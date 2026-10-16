// Dịch vụ Kết nối thế giới của Gateway: dựng dữ liệu THẬT (ngày + tháng) tối đa 2 lần/ngày, lưu gọn ở KV `world:data`,
// engine world (gói macro-center 1.2) chạy trong worker thread. Request chỉ đọc kết quả đã dựng — không gọi nguồn ngoài.
import { adjustOhlcSeries, repairUnexplainedGaps } from "../adjusted/corporateActions.js";
import { parseYahooMonthly as parseYahooChart, toClosedMonths } from "../macro/macroGlobalFeeds.js";
import { createInlineProxy, createWorkerProxy } from "../macro/workerProxy.js";
import { vnToday } from "../macro/macroCore.js";
import { createWorldCore } from "./worldCore.js";
import {
  FOREIGN_MARKETS, REAL_WORLD_EVENTS, SECTOR_BASKETS, WORLD_FACTORS_WITHOUT_SOURCE, WORLD_MONTHLY_YAHOO,
  alignForeignReturns, closeMap, equalWeightReturns, firstFullIndex, monthlyIndexFromReturns,
} from "./worldData.js";

export const WORLD_KV_KEY = "world:data";
const REFRESH_MS = 12 * 3600_000;
const RETRY_MS = 65 * 60_000; // chạm ngân sách tải lịch sử đầy đủ (40/giờ, dùng chung) -> thử lại sau ~1 giờ
// 6 năm: >= 60 tháng chung cho ma trận (5 năm chỉ cho 59 tháng đã đóng). KHÔNG dùng 7: giá danh nghĩa SSI chỉ có từ 27/02/2020,
// yêu cầu dài hơn nguồn có khiến kho lịch sử luôn "chưa phủ đủ" -> tải đầy đủ lại mỗi lần, đốt ngân sách 40 lượt/giờ dùng chung.
const HISTORY_YEARS = 6;
const UA = { "user-agent": "Mozilla/5.0 (compatible; GlobalQuanta/1.0)" };
const MACRO_FACTORS = new Set(["FED", "DXY", "OIL"]); // đã có nguồn thật ở Trung tâm vĩ mô (FRED/Yahoo)

export const worldOps = (core) => ({
  setData: ([payload]) => core.setData(payload),
  source: () => core.source(),
  handle: ([req]) => core.handle(req),
});

async function yahoo(symbol, interval, range, fetchImpl) {
  const r = await fetchImpl(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`, { headers: UA, signal: AbortSignal.timeout(45_000) });
  if (!r.ok) throw new Error(`Yahoo ${symbol} HTTP ${r.status}`);
  return parseYahooChart(await r.json()).map((p) => ({ date: p.date, close: p.value }));
}

export function createWorldService({ store, history, corporateActions, macroObservations, inline = false, fetchImpl = globalThis.fetch, now = Date.now, log = console } = {}) {
  const today = () => vnToday(now());
  const engine = inline
    ? createInlineProxy(worldOps(createWorldCore({ today })))
    : createWorkerProxy({ url: new URL("./worldWorker.js", import.meta.url), label: "thế giới", replayOp: "setData", timeoutMs: 120_000 });
  let ready = null;
  let builtAt = 0;
  let attemptedAt = 0; // lần thử gần nhất (kể cả thất bại / chưa đủ) — chặn việc mỗi request lại kích hoạt dựng & tải lịch sử
  let lastComplete = false;
  let pending = null;
  let retryTimer = null;

  function init() {
    if (!ready) {
      ready = (async () => {
        let saved = null;
        try {
          saved = store?.getKv ? await store.getKv(WORLD_KV_KEY) : null;
        } catch (e) {
          log.warn?.(`[world] không đọc được ${WORLD_KV_KEY}: ${e.message}`);
        }
        if (saved?.daily) builtAt = Date.parse(saved.meta?.builtAt ?? 0) || 0;
        await engine.call("setData", saved?.daily ? saved : null);
      })().catch((e) => {
        ready = null;
        throw e;
      });
    }
    return ready;
  }

  /** Dựng toàn bộ dữ liệu thật. Lỗi nguồn sự kiện quyền -> giữ bản cũ (giá chưa điều chỉnh sẽ tạo lợi suất giả ở ngày GDKHQ). */
  async function build() {
    const report = { markets: {}, sectors: {}, monthly: {}, missingFactors: WORLD_FACTORS_WITHOUT_SOURCE, notes: [] };
    // 1) lịch phiên VN + thị trường VN
    const vni = (await history.get("VNINDEX", { years: HISTORY_YEARS })).bars.filter((b) => !b.partial && b.close > 0);
    const tradingDays = vni.map((b) => b.date);
    if (tradingDays.length < 300) throw new Error(`VN-Index chỉ có ${tradingDays.length} phiên.`);
    const vMap = closeMap(vni);
    const markets = { VN: tradingDays.map((d, t) => (t ? Math.round((vMap.get(d) / vMap.get(tradingDays[t - 1]) - 1) * 1e6) / 1e4 : 0)) };
    report.markets.VN = { source: "Gateway VN-Index", sessions: tradingDays.length };
    // 2) thị trường nước ngoài (Yahoo, nến ngày)
    for (const [id, m] of Object.entries(FOREIGN_MARKETS)) {
      const bars = await yahoo(m.symbol, "1d", "10y", fetchImpl);
      const a = alignForeignReturns(tradingDays, bars, { lag1: m.lag1 });
      markets[id] = a.ret;
      report.markets[id] = { source: `Yahoo:${m.symbol}`, labelVi: m.labelVi, lagOneDay: m.lag1, flatDays: a.flatDays, first: a.first, last: a.last };
    }
    // 3) ngành: rổ cân bằng tỷ trọng, giá điều chỉnh cộng dồn theo sự kiện quyền (cùng cơ chế /ta-series)
    const sectors = {};
    const sectorMonthly = [];
    let budgetHit = false;
    for (const [sec, tickers] of Object.entries(SECTOR_BASKETS)) {
      const series = {};
      const used = [], missing = [];
      for (const t of tickers) {
        if (budgetHit) { missing.push(t); continue; }
        try {
          const [h, ca] = await Promise.all([history.get(t, { years: HISTORY_YEARS }), corporateActions.get(t)]);
          if (!ca.covered) { missing.push(`${t} (không có trong nguồn sự kiện quyền)`); continue; }
          const adj = repairUnexplainedGaps(adjustOhlcSeries(h.bars.filter((b) => b.close > 0), ca.events).bars).bars;
          series[t] = adj;
          used.push(t);
        } catch (e) {
          if (e?.statusCode === 503) budgetHit = true;
          missing.push(`${t} (${e?.statusCode === 503 ? "chờ ngân sách tải lịch sử" : e.message})`);
        }
      }
      const ew = equalWeightReturns(tradingDays, series);
      const start = firstFullIndex(ew.members);
      sectors[sec] = start == null ? tradingDays.map(() => 0) : ew.ret.map((r, i) => (i < start ? 0 : r));
      if (start != null) for (const o of monthlyIndexFromReturns(tradingDays, ew.ret, today(), { startIndex: start })) sectorMonthly.push({ seriesId: sec, ...o, source: "Gateway: rổ cân bằng tỷ trọng (giá điều chỉnh)" });
      report.sectors[sec] = { members: used, missing, from: start == null ? null : tradingDays[start], minMembersNow: ew.members.at(-1) };
    }
    if (budgetHit) report.notes.push("Chưa nạp đủ lịch sử 6 năm cho mọi mã (giới hạn tải 40 lượt/giờ dùng chung) — tự thử lại sau ~1 giờ.");
    const emptySectors = Object.entries(report.sectors).filter(([, r]) => r.from == null).map(([k]) => k);
    if (emptySectors.length) report.notes.push(`Ngành chưa đủ mã để dựng chỉ số: ${emptySectors.join(", ")} — bản dựng không được dùng.`);
    // 4) yếu tố tháng: FED/DXY/OIL từ Trung tâm vĩ mô + Yahoo
    const monthly = [];
    for (const o of (await macroObservations()) ?? []) if (MACRO_FACTORS.has(o.seriesId)) monthly.push(o);
    for (const id of MACRO_FACTORS) report.monthly[id] = { source: "Trung tâm vĩ mô (FRED/Yahoo)", months: monthly.filter((o) => o.seriesId === id).length };
    for (const [id, f] of Object.entries(WORLD_MONTHLY_YAHOO)) {
      try {
        const months = toClosedMonths((await yahoo(f.symbol, "1mo", "25y", fetchImpl)).map((p) => ({ date: p.date, value: p.close })), today());
        for (const m of months) monthly.push({ seriesId: id, ...m, source: f.source });
        report.monthly[id] = { source: f.source, months: months.length, first: months[0]?.period ?? null, last: months.at(-1)?.period ?? null };
      } catch (e) {
        report.monthly[id] = { source: f.source, error: e.message };
      }
    }
    return {
      daily: { tradingDays, markets, sectors },
      observations: [...monthly, ...sectorMonthly],
      events: REAL_WORLD_EVENTS,
      meta: { builtAt: new Date(now()).toISOString(), report, complete: !budgetHit && !emptySectors.length },
    };
  }

  function refresh({ force = false } = {}) {
    if (pending) return pending;
    if (!force) {
      if (builtAt && now() - builtAt < REFRESH_MS) return Promise.resolve({ skipped: "fresh" });
      if (attemptedAt && !lastComplete && now() - attemptedAt < RETRY_MS) return Promise.resolve({ skipped: "retry-later" });
    }
    pending = (async () => {
      await init();
      attemptedAt = now();
      const payload = await build();
      // CHỈ dùng bản dựng đầy đủ: ngành thiếu dữ liệu sẽ thành chuỗi 0 và cho event study/kết nối giả -> giữ bản cũ, thử lại sau.
      lastComplete = payload.meta.complete;
      if (payload.meta.complete) {
        if (store?.setKv) await store.setKv(WORLD_KV_KEY, payload);
        await engine.call("setData", payload);
        builtAt = now();
      }
      if (!payload.meta.complete && !retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          refresh({ force: true }).catch((e) => log.warn?.(`[world] dựng lại lỗi: ${e.message}`));
        }, RETRY_MS);
        retryTimer.unref?.();
      }
      return { builtAt: payload.meta.builtAt, complete: payload.meta.complete, report: payload.meta.report, source: await engine.call("source") };
    })().finally(() => {
      pending = null;
    });
    return pending;
  }
  const refreshInBackground = () => refresh().catch((e) => log.warn?.(`[world] dựng dữ liệu lỗi: ${e.message}`));

  return {
    init,
    refresh,
    async handle(req) {
      await init();
      refreshInBackground();
      return engine.call("handle", req);
    },
    async source() {
      await init();
      refreshInBackground();
      return engine.call("source");
    },
    close: () => engine.close(),
  };
}
