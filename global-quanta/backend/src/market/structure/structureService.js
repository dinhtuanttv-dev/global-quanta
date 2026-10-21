// Cấu trúc thị trường đa khung (T4) — dịch vụ Gateway.
//   GET /api/market/structure/:symbol    Tuần / Ngày / 1 giờ: giai đoạn, mẫu hình, vùng giá, Granville, bảng kiểm, ma trận R1–R7,
//                                        2 kịch bản, chú thích tiếng Việt ghim vào nến, nón dự báo, nhãn bằng chứng (T2/T3).
//   GET /api/market/structure-summary    Bản tóm tắt toàn universe (job scanStructure 15:47) để làm giàu bảng bộ lọc.
// Dữ liệu: SSI là nguồn chính — nến ngày = /ta-series (cùng chuỗi với biểu đồ, ghim đúng nến), nến 1 giờ = nến phút SSI IntradayOhlc
// gộp theo tiết, điều chỉnh như /ta-intraday. Kho nến 1 giờ + bản tóm tắt nằm trên Railway Volume; KV Supabase chỉ nhận
// MỘT bản tóm tắt nhỏ / ngày (dự phòng khởi động lạnh) -> không tăng băng thông Supabase/Neon đáng kể.
import * as Q from "../vendor/quantCore.mjs";
import { canonicalSymbol, isIndexSymbol, isValidSymbol } from "../normalizer.js";
import { ValidationError } from "../errors.js";
import { expectsLiveTicks, isTradingDay, lastCompletedSessionDate, vnDate, vnParts } from "../calendar.js";
import { addDays } from "../util.js";
import { tradingDatesBack } from "../scanner/scannerJobs.js";
import { factorForDate } from "../adjusted/taIntraday.js";
import { createScreenerSeries } from "../strategies/screenerSeries.js";
import { createH1Cache } from "./h1Cache.js";
import { STRUCTURE_VALIDATION } from "./validation.js";
import { features, prepareIndex, prepareSymbol } from "./validate.js";
import { applyIsotonic, hmmFilter, linearAt, logisticAt } from "./ml.js";
import { createStructureLedger } from "./ledger.js";

export const H1_SESSIONS = 120;          // ≈ 6 tháng: đủ MA100 tiết (= MA20 ngày) + sóng trung
export const STRUCTURE_SUMMARY_KV = "structure:summary";
const SUMMARY_FILE = "summary";
const BUY = new Set(["M1", "M2", "M3", "G3"]);

const r2 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);
const px = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 100) / 100);

/** Đổi phân tích một khung thành bản gọn cho giao diện — dùng chung với chế độ phát lại trên trình duyệt (quant-core). */
export const compactTf = (a, opts) => Q.compactStructureTf(a, opts);

/** Bản tóm tắt một mã cho bảng bộ lọc (khung D + tuần đã đóng). */
export function summaryRow(ticker, m) {
  const d = m.tfs.D, t = d.bars.length - 1;
  const lastPat = d.patterns.map((p) => ({ p, s: Q.patternStatusAt(p, t) })).filter(({ s }) => s === "forming" || s === "confirmed").pop();
  const lastSig = d.signals[d.signals.length - 1];
  const sup = d.zones.filter((z) => z.role === "support").sort((a, b) => b.mid - a.mid)[0];
  const res = d.zones.filter((z) => z.role === "resistance").sort((a, b) => a.mid - b.mid)[0];
  return {
    t: ticker, asOf: d.bars[t].date, st: d.stage[t], prev: t > 0 ? d.stage[t - 1] : null, age: d.stageAge[t], ws: m.context.week, dow: d.dow[t],
    v: m.align.verdict, rule: m.align.rule, sc: m.checklist.buyScore, ss: m.checklist.sellScore,
    chg: t > 0 && d.stage[t] !== d.stage[t - 1],
    pat: lastPat ? { type: lastPat.p.type, status: lastPat.s, date: d.bars[lastPat.p.breakIndex ?? lastPat.p.confirmedIndex].date } : null,
    sig: lastSig && t - lastSig.index <= 5 ? { code: lastSig.code, date: d.bars[lastSig.index].date } : null,
    sup: sup ? px(sup.mid) : null, res: res ? px(res.mid) : null,
    trigL: px(m.scenarios[0]?.trigger), trigS: px(m.scenarios[1]?.trigger),
  };
}

/**
 * Nón dự báo 5/10/20 phiên theo tham số đã kiểm định (CQR) hoặc phân phối lịch sử (đối chứng).
 * Độ rộng hiệu chỉnh = offset ACI của sổ dự báo thực tế (T6) nếu đã đủ điểm, ngược lại = offset hiệu chỉnh lúc kiểm định.
 * `raw` (log-lợi suất trước hiệu chỉnh + offset đã dùng) được ghi vào sổ để chấm sau h phiên.
 */
export function forecastCone(V, symbol, close, x, aciOffset = {}) {
  const cone = V?.cone;
  if (!cone) return null;
  const out = {}, raw = {};
  for (const [h, c] of Object.entries(cone.horizons ?? {})) {
    let lo0, hi0, mid;
    if (c.kind === "cqr") {
      const z = x.map((v, j) => (v - c.mu[j]) / (c.sd[j] || 1));
      lo0 = linearAt(c.lo, z); hi0 = linearAt(c.hi, z); mid = linearAt(c.mid, z);
    } else if (c.kind === "empirical") {
      const q = c.baseline?.[symbol] ?? c.global;
      if (!q) continue;
      [lo0, hi0, mid] = q;
    } else continue;
    const off = Number.isFinite(aciOffset[h]) ? aciOffset[h] : c.off;
    const lo = lo0 - off, hi = hi0 + off;
    raw[h] = [Math.round(lo0 * 1e4) / 1e4, Math.round(hi0 * 1e4) / 1e4, Math.round(off * 1e4) / 1e4];
    out[h] = { p10: px(close * Math.exp(lo)), p50: px(close * Math.exp(Math.min(Math.max(mid, lo), hi))), p90: px(close * Math.exp(hi)), kind: c.kind, coverageOOS: c.coverageOOS ?? null, aci: Number.isFinite(aciOffset[h]) };
  }
  return Object.keys(out).length ? { horizons: out, label: cone.label, note: cone.note, raw } : null;
}

export function createStructureService({ service, taSeries, corporateActions, now = Date.now, h1Cache = createH1Cache(), seriesSource = null }) {
  const store = service.store;
  let summaryMemo = null; // { value, at }
  const ledger = createStructureLedger({ store: h1Cache, now });

  async function dailyBars(symbol) {
    const r = await taSeries.get({ symbol, range: "5y", limit: 1300 });
    return { bars: (r.bars ?? []).filter((b) => b.close > 0), priceBasis: r.priceBasis, actions: (r.corporateActions ?? []).map((a) => ({ date: a.date, factor: a.factor })), warnings: r.warnings ?? [] };
  }

  /** Nến 1 giờ: phiên đã đóng từ kho (thiếu thì tải SSI một lần), phiên đang chạy tải lại mỗi 60 giây. */
  async function h1Bars(symbol, actions, isIndex) {
    const provider = service.router?.providers?.ssiFcV2;
    if (!provider?.isConfigured?.() || typeof provider.getIntradayRange !== "function") return { bars: null, reason: "Chưa cấu hình SSI FC Data cho nến phút." };
    const nowDate = new Date(now());
    const today = vnDate(nowDate);
    const lastClosed = lastCompletedSessionDate(nowDate);
    const sessionLive = isTradingDay(nowDate) && vnParts(nowDate).minutes >= 9 * 60 && lastClosed < today;
    const historyEnd = sessionLive ? addDays(today, -1) : lastClosed;
    const dates = tradingDatesBack(historyEnd, H1_SESSIONS);
    const days = { ...(await h1Cache.get(symbol)) };
    const missing = dates.filter((d) => !(d in days));
    let fetched = 0;
    if (missing.length) {
      const mins = await service.cache.wrap(`structure-h1:${symbol}:${missing[0]}:${historyEnd}`, 10 * 60_000, () => provider.getIntradayRange(symbol, missing[0], historyEnd));
      const byDay = new Map();
      for (const b of mins) { if (!(b?.close > 0)) continue; const k = String(b.date).slice(0, 10); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(b); }
      for (const d of missing) {
        const arr = (byDay.get(d) ?? []).sort((a, b) => String(a.date).localeCompare(String(b.date)));
        days[d] = Q.minutesToH1(arr.map((b) => ({ ...b, date: String(b.date).replace("T", " ").slice(0, 16) })));
        fetched++;
      }
    }
    const keep = new Set(dates);
    for (const d of Object.keys(days)) if (!keep.has(d)) delete days[d];
    if (fetched) await h1Cache.put(symbol, days);
    let live = [];
    if (sessionLive) {
      const mins = await service.cache.wrap(`structure-h1-live:${symbol}:${today}`, expectsLiveTicks(nowDate) ? 60_000 : 5 * 60_000, () => provider.getIntradayOhlcv(symbol, today).catch(() => []));
      live = Q.minutesToH1(mins.filter((b) => b?.close > 0).sort((a, b) => String(a.date).localeCompare(String(b.date))).map((b) => ({ ...b, date: String(b.date).replace("T", " ").slice(0, 16) })));
    }
    const all = [...dates.flatMap((d) => days[d] ?? []), ...live];
    const bars = all.map((b) => {
      const k = isIndex ? 1 : factorForDate(b.date.slice(0, 10), actions);
      return k === 1 ? b : { ...b, open: b.open * k, high: b.high * k, low: b.low * k, close: b.close * k };
    });
    return { bars, sessions: dates.length + (live.length ? 1 : 0), fetchedSessions: fetched, live: sessionLive };
  }

  function evidence(V) {
    const v = V.verdicts ?? {};
    const lab = (k) => (v[k] === "PASS" ? "ĐÃ KIỂM ĐỊNH" : V.status === "PENDING" ? "ĐANG KIỂM ĐỊNH" : "THỰC NGHIỆM");
    return {
      prereg: V.prereg, status: V.status, verdicts: v, summary: V.summary ?? null,
      labels: { stageUp: lab("H1"), alignment: lab("H2"), checklist: lab("H3"), patterns: lab("H4"), stageDown: lab("H5") },
    };
  }

  async function analyze(symbolRaw, { h1 = true } = {}) {
    const symbol = canonicalSymbol(symbolRaw);
    if (!isValidSymbol(symbol)) throw new ValidationError("Mã chứng khoán không hợp lệ.");
    const isIndex = isIndexSymbol(symbol);
    const daily = await dailyBars(symbol);
    if (daily.bars.length < 120) { const e = new Error(`${symbol} chưa đủ lịch sử nến ngày (${daily.bars.length} phiên).`); e.statusCode = 404; throw e; }
    let hb = { bars: null };
    if (h1) { try { hb = await h1Bars(symbol, daily.actions, isIndex); } catch (e) { hb = { bars: null, reason: e.message }; } }
    const dBars = daily.bars.map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0 }));
    const m = Q.analyzeStructureMtf({ d: dBars, h1: hb.bars?.length >= 30 ? hb.bars : undefined });

    // Xác suất / nón / thời lượng giai đoạn theo kết quả kiểm định (chỉ dùng tham số đã ĐẠT; còn lại là mô tả lịch sử).
    const V = STRUCTURE_VALIDATION;
    let cone = null, probability = null, stageOdds = null;
    try {
      const vni = await dailyBars("VNINDEX");
      const u = prepareSymbol(symbol, dBars, prepareIndex(vni.bars));
      const t = dBars.length - 1, x = features(u, t);
      cone = forecastCone(V, symbol, dBars[t].close, x, await ledger.offsets());
      if (cone) delete cone.raw;
      if (V.meta?.model) {
        const z = x.map((v, j) => (v - V.meta.model.mu[j]) / (V.meta.model.sd[j] || 1));
        probability = { value: r2(applyIsotonic(V.meta.model.iso, logisticAt(V.meta.model.w, z))), baseRate: V.meta.baseRate, label: "ĐÃ KIỂM ĐỊNH", horizon: 20 };
      } else if (V.meta) probability = { value: null, baseRate: V.meta.baseRate, label: "THỰC NGHIỆM", note: V.meta.note ?? null };
      const ty = V.stageModel?.typical?.[u.a.stage[t]] ?? null;
      stageOdds = { stage: u.a.stage[t], age: u.a.stageAge[t], typical: ty, up: null, down: null, label: V.stageModel?.model ? "ĐÃ KIỂM ĐỊNH" : "MÔ TẢ" };
      if (V.stageModel?.model) {
        const SM = V.stageModel.model, feat = (i) => {
          const c = dBars[i].close, pc = dBars[i - 1].close, atr = Math.max(u.a.atr[i], 1e-9), cap = (v) => Math.max(-8, Math.min(8, Number.isFinite(v) ? v : 0));
          return [cap((c - pc) / atr), cap(u.a.dev[i]), cap(u.a.slope[i] * 10), cap(u.a.spread[i])].map((v, j) => (v - SM.st.mu[j]) / (SM.st.sd[j] || 1));
        };
        const xs = []; for (let i = 120; i <= t; i++) xs.push(feat(i));
        const post = hmmFilter(SM.hmm, xs).at(-1);
        const STAGES = ["A", "UP", "B", "C", "D", "DOWN", "Bp", "RANGE"];
        const s = u.a.stage[t], med = ty?.median ?? 20;
        const xx = [...post, ...STAGES.map((k) => (k === s ? 1 : 0)), Math.log(1 + u.a.stageAge[t]), u.a.stageAge[t] / med];
        stageOdds.up = r2(applyIsotonic(SM.up.iso, logisticAt(SM.up.w, xx)));
        stageOdds.down = r2(applyIsotonic(SM.down.iso, logisticAt(SM.down.w, xx)));
      }
    } catch (e) { cone = cone ?? null; }

    const h = m.tfs.H1;
    const base = Q.compactStructure(m);
    return {
      ...base, symbol, generatedAt: new Date(now()).toISOString(),
      dataSource: { daily: { source: "SSI · /ta-series", priceBasis: daily.priceBasis, bars: daily.bars.length, warnings: daily.warnings },
        h1: h ? { source: "SSI IntradayOhlc (gộp theo tiết)", bars: hb.bars.length, sessions: hb.sessions, live: hb.live } : { unavailable: hb.reason ?? "Chưa đủ nến 1 giờ." } },
      cone, probability, stageOdds, evidence: evidence(V),
    };
  }

  async function readSummary() {
    if (summaryMemo && now() - summaryMemo.at < 10 * 60_000) return summaryMemo.value;
    let value = await h1Cache.readJson(SUMMARY_FILE);
    if (!value) { try { value = (await store.getKv(STRUCTURE_SUMMARY_KV))?.value ?? null; if (value) await h1Cache.writeJson(SUMMARY_FILE, value); } catch { value = null; } }
    summaryMemo = { value, at: now() };
    return value;
  }

  return {
    analyze,
    summary: readSummary,
    ledgerStats: () => ledger.stats(),
    cacheStats: () => h1Cache.stats(),
    jobs: {
      /** 15:47 — khung D (+ tuần đã đóng) cho toàn universe, dùng chung bộ nhớ đệm chuỗi của job bộ lọc 15:45 (không đọc thêm Supabase). */
      async scanStructure() {
        const t0 = now();
        const universe = (await store.getKv("scanner:universe"))?.value?.tickers ?? [];
        if (!universe.length) throw new Error("Chưa có universe.");
        const loadSeries = await (seriesSource ?? createScreenerSeries({ store, corporateActions })).prepare(universe.map((u) => u.ticker));
        let vni = null;
        try { const ib = typeof loadSeries.index === "function" ? await loadSeries.index("VNINDEX") : null; if (ib?.length) vni = prepareIndex(ib.filter((b) => !b.partial && b.close > 0)); } catch { vni = null; }
        const aciOff = await ledger.offsets();
        const rows = [], skipped = [], entries = [], series = new Map();
        for (const { ticker } of universe) {
          try {
            const r = await loadSeries(ticker);
            const bars = (r?.bars ?? []).filter((b) => !b.partial && b.close > 0).map((b) => ({ date: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume ?? 0 }));
            if (bars.length < 260) { skipped.push(ticker); continue; }
            const row = summaryRow(ticker, Q.analyzeStructureMtf({ d: bars }));
            rows.push(row);
            series.set(ticker, { close: bars.map((b) => b.close), idx: new Map(bars.map((b, i) => [b.date, i])) });
            // T6: khoảng dự báo thô cho sổ thực tế (chỉ khi đã có tham số nón từ kiểm định).
            let cone = null;
            if (vni && STRUCTURE_VALIDATION.cone) {
              try { const u = prepareSymbol(ticker, bars, vni); cone = forecastCone(STRUCTURE_VALIDATION, ticker, bars.at(-1).close, features(u, bars.length - 1), aciOff)?.raw ?? null; } catch { cone = null; }
            }
            entries.push({ t: ticker, d: row.asOf, st: row.st, v: row.v, cone });
          } catch { skipped.push(ticker); }
        }
        const asOf = rows.reduce((m, r) => (r.asOf > m ? r.asOf : m), "");
        let ledgerStats = null;
        try {
          if (asOf) await ledger.record(asOf, entries.filter((e) => e.d === asOf).map(({ d, ...e }) => e));
          ledgerStats = await ledger.score((t) => series.get(t) ?? null, asOf || vnDate(new Date(now())));
        } catch (e) { ledgerStats = { error: e.message }; }
        const transitions = rows.filter((r) => r.chg && r.asOf === asOf).map((r) => ({ t: r.t, from: r.prev, to: r.st, v: r.v }));
        const doc = { engine: Q.MTF_STRUCTURE_VERSION, generatedAt: new Date(now()).toISOString(), asOf, evidence: evidence(STRUCTURE_VALIDATION).labels, rows, skipped, transitions, ledger: ledgerStats };
        const disk = await h1Cache.writeJson(SUMMARY_FILE, doc);
        let kv = true;
        try { await store.setKv(STRUCTURE_SUMMARY_KV, doc); } catch { kv = false; }
        summaryMemo = { value: doc, at: now() };
        return { symbols: rows.length, skipped: skipped.length, asOf, disk, kv, transitions: transitions.length, ledger: ledgerStats?.coverage ?? ledgerStats, ms: now() - t0 };
      },
    },
  };
}

export const STRUCTURE_SCHEDULE = [{ name: "scanStructure", at: "15:47", tradingDayOnly: true }];
export { BUY as STRUCTURE_BUY_CODES };
