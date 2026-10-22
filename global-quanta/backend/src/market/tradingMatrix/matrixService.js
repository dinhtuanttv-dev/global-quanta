// Trading Matrix M1 — điều phối snapshot từ các nguồn sẵn có (spec §7.1): không nhân bản công thức, mỗi nguồn lỗi độc lập
// (một nguồn hỏng không làm mất các ô khác), mọi khối có sourceAsOf + định nghĩa + mẫu số.
//   GET /api/market/trading-matrix/overview?scope=VNINDEX|VN30|UNIVERSE&horizon=daily|intraday
// Dữ liệu: kho cục bộ (Railway Volume, M0) cho dữ liệu ngày; SSI cho độ rộng trong phiên + VN-Index; research / cấu trúc cho
// regime. Snapshot cuối phiên lưu bảng cục bộ market_matrix_snapshot (job matrixSnapshot 16:50) — không ghi Supabase.
import { currentSession, expectsLiveTicks, lastCompletedSessionDate, vnParts } from "../calendar.js";
import { getResearchOverview } from "../research/researchService.js";
import {
  breadthTrend, createHysteresis, dailyBreadth, flowState, overallHealth, regimeDaily, sessionPhase, sourceHealth, volatilityDaily,
} from "./features.js";

export const MATRIX_VERSION = "matrix/M1 1.0.0";
export const MATRIX_SCOPES = { VNINDEX: "Toàn sàn HOSE", VN30: "Rổ VN30", UNIVERSE: "Universe Siêu Quét" };
export const SNAPSHOT_TABLE = "market_matrix_snapshot";
const HISTORY = 260;

export function createMatrixService({ service, store, getStructure = () => null, now = Date.now, log = console }) {
  const hyst = createHysteresis(2);
  const memo = new Map(); // `${scope}|${asOf}` -> { bySymbol, foreign, at }

  async function scopeSymbols(scope, latestRows) {
    if (scope === "VN30") {
      const r = await service.getIndexComponents("VN30");
      return { symbols: r?.data ?? r?.symbols ?? [], source: "SSI IndexComponents" };
    }
    if (scope === "UNIVERSE") {
      const u = (await store.getKv("scanner:universe"))?.value?.tickers ?? [];
      return { symbols: u.map((t) => t.ticker), source: "scanner:universe" };
    }
    return { symbols: latestRows.filter((r) => r.exchange === "HOSE").map((r) => r.symbol), source: "SSI DailyStockPrice (HOSE)" };
  }

  /** Dữ liệu ngày của phạm vi (đệm theo phiên đã đóng — chỉ tính lại khi có phiên mới). */
  async function dailyScope(scope, expected) {
    const dates = (await store.getMarketDailyDates()).filter((d) => d <= expected);
    const asOf = dates.at(-1);
    if (!asOf) throw new Error("Kho cục bộ chưa có dữ liệu ngày (đang dựng lại từ SSI).");
    const key = `${scope}|${asOf}`;
    if (memo.has(key)) return memo.get(key);
    const latestRows = await store.getMarketDailyByDate(asOf);
    const { symbols, source } = await scopeSymbols(scope, latestRows);
    const want = new Set(symbols);
    const span = dates.slice(-HISTORY);
    const rows = await store.getMarketDailyRange({ from: span[0], to: asOf, symbols: [...want] });
    const bySymbol = new Map([...want].map((s) => [s, []]));
    for (const r of rows) bySymbol.get(r.symbol)?.push(r);
    const foreign = [];
    for (const d of span.slice(-20)) {
      let net = 0, n = 0;
      for (const list of bySymbol.values()) { const r = list.find((x) => x.date === d); if (r) { net += (r.foreignBuyVal ?? 0) - (r.foreignSellVal ?? 0); n++; } }
      if (n) foreign.push({ date: d, net });
    }
    const v = { asOf, bySymbol, foreign, span, scopeSource: source };
    for (const k of memo.keys()) if (k.startsWith(`${scope}|`)) memo.delete(k);
    memo.set(key, v);
    return v;
  }

  async function overview({ scope = "VNINDEX", horizon = "daily" } = {}) {
    scope = MATRIX_SCOPES[scope] ? scope : "VNINDEX";
    const nowDate = new Date(now());
    const expected = lastCompletedSessionDate(nowDate);
    const live = expectsLiveTicks(nowDate);
    const health = [];
    const out = {
      version: MATRIX_VERSION, asOf: nowDate.toISOString(), horizon,
      session: { ...sessionPhase(currentSession(nowDate), vnParts(nowDate).minutes), tradingDate: expected, live },
      scope: { id: scope, label: MATRIX_SCOPES[scope], eligible: null, observed: null },
      regime: null, breadth: { daily: null, intraday: null, trend: null }, flow: null, volatility: null,
      scenarios: [], riskFlags: [], sourceAsOf: {},
    };

    // 1. Dữ liệu ngày của phạm vi -> độ rộng + khối ngoại
    let d = null;
    try {
      d = await dailyScope(scope, expected);
      out.breadth.daily = dailyBreadth(d.bySymbol, d.asOf);
      out.breadth.trend = breadthTrend(d.bySymbol, d.span.slice(-20));
      out.scope.eligible = out.breadth.daily.eligibleCount; out.scope.observed = out.breadth.daily.observedCount; out.scope.source = d.scopeSource;
      out.sourceAsOf.daily = d.asOf;
      health.push(sourceHealth({ id: "daily", label: "Dữ liệu ngày (SSI, kho cục bộ)", kind: "daily", asOf: d.asOf, expectedDate: expected }));
    } catch (e) { health.push(sourceHealth({ id: "daily", label: "Dữ liệu ngày (SSI, kho cục bộ)", kind: "daily", error: e.message })); }

    // 2. Độ rộng trong phiên (SSI chỉ số) — tách riêng khỏi cuối phiên
    try {
      const code = scope === "VN30" ? "VN30" : "VNINDEX";
      const b = await service.getBreadth(code);
      const asOf = b.provenance?.fetchedAt ?? b.provenance?.asOf ?? null;
      out.breadth.intraday = { horizon: "intraday", index: code, advancers: b.advancers, decliners: b.decliners, unchanged: b.noChanges, ceilings: b.ceilings, floors: b.floors,
        observedCount: [b.advancers, b.decliners, b.noChanges].every(Number.isFinite) ? b.advancers + b.decliners + b.noChanges : null, asOf, source: b.provenance?.source ?? null,
        note: scope === "UNIVERSE" ? "SSI chỉ có độ rộng theo chỉ số — hiển thị độ rộng VN-Index." : null };
      out.sourceAsOf.intraday = asOf;
      health.push(sourceHealth({ id: "intraday", label: `Độ rộng trong phiên (SSI ${code})`, kind: "intraday", asOf, live, nowMs: now() }));
    } catch (e) { health.push(sourceHealth({ id: "intraday", label: "Độ rộng trong phiên (SSI)", kind: "intraday", error: e.message })); }

    // 3. VN-Index -> biến động + regime
    let idxBars = null;
    try {
      const r = await service.getOhlcv({ symbol: "VNINDEX", limit: 300 });
      idxBars = (r.bars ?? []).filter((b) => !b.partial && b.close > 0);
      out.volatility = volatilityDaily(idxBars);
      out.sourceAsOf.index = idxBars.at(-1)?.date ?? null;
      health.push(sourceHealth({ id: "index", label: "VN-Index (SSI)", kind: "daily", asOf: idxBars.at(-1)?.date, expectedDate: expected }));
    } catch (e) { health.push(sourceHealth({ id: "index", label: "VN-Index (SSI)", kind: "daily", error: e.message })); }

    let intel = null;
    try {
      const ro = await service.cache.wrap("matrix:research", 60_000, () => getResearchOverview(store));
      intel = ro?.intel ?? null;
      out.sourceAsOf.research = intel?.asOf ?? null;
      health.push(sourceHealth({ id: "research", label: "Nghiên cứu VN-Index (HMM, dấu chân lệnh)", kind: "daily", asOf: intel?.asOf, expectedDate: expected, error: intel ? null : "Job nghiên cứu chưa chạy (16:00–16:40)" }));
    } catch (e) { health.push(sourceHealth({ id: "research", label: "Nghiên cứu VN-Index", kind: "daily", error: e.message })); }

    let stageOdds = null;
    try {
      const st = getStructure();
      if (st) {
        const doc = await service.cache.wrap("matrix:structure:VNINDEX", 10 * 60_000, () => st.analyze("VNINDEX", { h1: false }));
        stageOdds = doc?.stageOdds ? { ...doc.stageOdds, dayStage: doc.context?.day ?? null, label: doc.stageOdds.label } : null;
        out.sourceAsOf.structure = doc?.asOf ?? null;
      }
    } catch (e) { log.warn?.(`[matrix] cấu trúc: ${e.message}`); }

    const hmm = intel?.current ? { pBear: intel.current.pBear, pNeutral: intel.current.pNeutral, pBull: intel.current.pBull, date: intel.current.date } : null;
    out.regime = regimeDaily(idxBars, { hmm, stageOdds });
    out.regime.label = hyst(`regime|${scope}`, out.regime.label);

    // 4. Dòng tiền (tách nguồn)
    const fp = intel?.current ? { date: intel.current.date, zLd5: intel.current.zLd5, zFr5: intel.current.zFr5, coverageDays: intel.coverage?.footprintDays ?? null } : null;
    out.flow = flowState({ foreignByDate: d?.foreign ?? [], footprint: fp });
    out.flow.state = hyst(`flow|${scope}`, out.flow.state);

    const scanAsOf = (await store.getKv("scanner:latest").catch(() => null))?.value?.dataAsOf ?? null;
    health.push(sourceHealth({ id: "scanner", label: "Kết quả Siêu Quét", kind: "daily", asOf: scanAsOf, expectedDate: expected, error: scanAsOf ? null : "Chưa có kết quả quét" }));
    out.dataHealth = { status: overallHealth(health, ["daily", "index"]), sources: health };
    return out;
  }

  return {
    overview,
    /** 16:50 — lưu snapshot cuối phiên ba phạm vi vào bảng cục bộ (ghi đúng thời điểm, không sửa về sau). */
    async snapshot() {
      const saved = [];
      for (const scope of Object.keys(MATRIX_SCOPES)) {
        const o = await overview({ scope, horizon: "daily" });
        const date = o.sourceAsOf.daily ?? o.session.tradingDate;
        await store.upsertRows(SNAPSHOT_TABLE, [{ scope, trading_date: date, version: MATRIX_VERSION, created_at: o.asOf, doc: o }], "scope,trading_date");
        saved.push({ scope, date, health: o.dataHealth.status });
      }
      return { saved };
    },
    async history({ scope = "VNINDEX", limit = 60 } = {}) {
      const rows = await store.selectRows(SNAPSHOT_TABLE, { eq: { scope }, order: "trading_date.desc", limit });
      return rows.map((r) => ({ date: r.trading_date, version: r.version, regime: r.doc?.regime?.label ?? null, aboveMa20Pct: r.doc?.breadth?.daily?.aboveMa20Pct ?? null, flow: r.doc?.flow?.state ?? null, atrPercentile: r.doc?.volatility?.atrPercentile ?? null, health: r.doc?.dataHealth?.status ?? null }));
    },
  };
}

export const MATRIX_SCHEDULE = [{ name: "matrixSnapshot", at: "16:50", tradingDayOnly: true }];
