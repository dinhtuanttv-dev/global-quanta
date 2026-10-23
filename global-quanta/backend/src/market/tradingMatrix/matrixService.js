// Trading Matrix M1 — điều phối snapshot từ các nguồn sẵn có (spec §7.1): không nhân bản công thức, mỗi nguồn lỗi độc lập
// (một nguồn hỏng không làm mất các ô khác), mọi khối có sourceAsOf + định nghĩa + mẫu số.
//   GET /api/market/trading-matrix/overview?scope=VNINDEX|VN30|UNIVERSE&horizon=daily|intraday
// Dữ liệu: kho cục bộ (Railway Volume, M0) cho dữ liệu ngày; SSI cho độ rộng trong phiên + VN-Index; research / cấu trúc cho
// regime. Snapshot cuối phiên lưu bảng cục bộ market_matrix_snapshot (job matrixSnapshot 16:50) — không ghi Supabase.
import { currentSession, expectsLiveTicks, lastCompletedSessionDate, vnDate, vnParts } from "../calendar.js";
import { getResearchOverview } from "../research/researchService.js";
import {
  breadthTrend, createHysteresis, dailyBreadth, flowState, overallHealth, regimeDaily, sessionPhase, sourceHealth, volatilityDaily,
} from "./features.js";
import { notableMovers, sectorStats } from "./sectorMatrix.js";
import { buildStateSeries, neutralState, RULE_VERSION, runLifecycle, SCENARIOS } from "./scenarioEngine.js";
import { riskFlags } from "./riskRules.js";
import { MATRIX_VALIDATION } from "./matrixValidation.js";
import { MATRIX_MODELS } from "./matrixModels.js";
import { featureRows, HORIZON, predict } from "./models.js";
import { notifyOps } from "../alerts.js";
import { fetchVndShares, impactSummary, indexImpact } from "./indexImpact.js";
import { fetchMarketDay } from "../scanner/marketDaily.js";
import { resolveIndexNow } from "../topbar/topbarService.js";
import { toActiveEvents } from "../scanner/scanEngine.js";
import { classify } from "../scanner/taxonomy.js";

const SHARES_KV = "matrix:shares";
const SHARES_TTL_MS = 24 * 3600_000;

export const FORECAST_TABLE = "market_matrix_forecast";
export const REPLAY_TABLE = "market_matrix_replay";
const ACTIVE_MODEL_KV = "matrix:activeModel";
const DRIFT_KV = "matrix:drift";

export const SIGNAL_TABLE = "market_matrix_signal";
export const OUTCOME_TABLE = "market_matrix_outcome";
const OUT_HORIZONS = [1, 3, 5, 10];
const LEDGER_STATES = new Set(["WATCH", "CONFIRMED", "INVALIDATED"]);

/** Kịch bản hiện tại (M3): vòng đời chạy lại trên chuỗi đã có (tất định) -> trạng thái phiên cuối + bằng chứng + nhãn kiểm định. */
function scenarioView(lc, coverage, regimeLabel) {
  const day = lc.timeline.at(-1);
  if (!day) return { scenarios: [], neutral: null, day: null };
  const scenarios = Object.entries(SCENARIOS).map(([id, sc]) => {
    const d = day[id];
    const verdict = MATRIX_VALIDATION.verdicts[id] ?? "PENDING";
    return {
      id, title: sc.title, meaning: sc.meaning, state: d.state, since: d.since, evidence: d.evidence, contradictions: d.contradictions, groups: d.groups,
      // M4: chỉ kịch bản ĐẠT mới được gọi "Xác nhận"; còn lại CONFIRMED hiển thị "đủ điều kiện quy tắc (chưa kiểm định)".
      displayState: d.state === "CONFIRMED" ? (verdict === "PASS" ? "Xác nhận" : "Đủ điều kiện quy tắc") : { WATCH: "Theo dõi", INVALIDATED: "Vô hiệu", COOLDOWN: "Tạm nghỉ", INACTIVE: "Không hoạt động" }[d.state],
      validation: { verdict, summary: MATRIX_VALIDATION.summary[id], label: verdict === "PASS" ? "ĐÃ KIỂM ĐỊNH" : "THỰC NGHIỆM" },
      ruleVersion: RULE_VERSION,
    };
  });
  return { scenarios, neutral: neutralState(day, { coverage, regimeLabel }), day };
}

export const MATRIX_VERSION = "matrix/M1 1.1.0";

/** Mã / ngành liên quan của từng kịch bản (spec §6.5): SC1 -> ngành dẫn dắt, SC2 -> trụ kéo chỉ số, SC3 -> ngành có cờ biến động. */
function attachRelated(scenarios, links) {
  const imp = links?.impact && !links.impact.error ? links.impact : null;
  const sx = links?.sectors && !links.sectors.error ? links.sectors : null;
  return scenarios.map((sc) => {
    let related = null;
    if (sc.id === "SC1" && sx) related = { kind: "sectors", note: "Ngành dẫn dắt (RS 5 phiên > 0, độ rộng ≥ 50%)", items: sx.leaders.map((x) => x.industry) };
    if (sc.id === "SC2" && imp) related = { kind: "tickers", note: `Trụ kéo chỉ số phiên ${imp.date} (5 mã chiếm ${imp.top5Share ?? "—"}% biến động)`, items: imp.up.map((x) => x.symbol) };
    if (sc.id === "SC3" && sx) related = { kind: "sectors", note: "Ngành có cờ biến động / độ rộng giảm nhanh", items: sx.flagged.map((x) => x.industry) };
    return { ...sc, related: related && related.items.length ? related : null };
  });
}
export const MATRIX_SCOPES = { VNINDEX: "Toàn sàn HOSE", VN30: "Rổ VN30", UNIVERSE: "Universe Siêu Quét" };
export const SNAPSHOT_TABLE = "market_matrix_snapshot";
const HISTORY = 260;

export const LIVE_IMPACT_TTL_MS = 5 * 60_000;
export const LIVE_IMPACT_DEADLINE_MS = 4 * 60_000;
export const LIVE_IMPACT_MIN_COVERAGE = 0.5;
const LIVE_SESSIONS = new Set(["ATO", "LO", "BREAK", "ATC"]);

export function createMatrixService({ service, store, getStructure = () => null, corporateActions = null, fetchShares = fetchVndShares, fetchDay = fetchMarketDay, now = Date.now, log = console }) {
  const hyst = createHysteresis(2);
  const memo = new Map(); // `${scope}|${asOf}` -> { bySymbol, foreign, at }
  const impactMemo = new Map(); // date -> kết quả indexImpact

  /** Số cổ phiếu lưu hành (VNDirect) — lưu KV cục bộ, làm mới mỗi 24 giờ; lỗi -> dùng bản cũ. */
  async function sharesFor(symbols) {
    const cached = (await store.getKv(SHARES_KV).catch(() => null))?.value ?? null;
    const have = new Map(Object.entries(cached?.map ?? {}));
    const fresh = cached && now() - Date.parse(cached.fetchedAt) < SHARES_TTL_MS;
    const missing = symbols.filter((s) => !have.has(s));
    if (fresh && missing.length <= symbols.length * 0.05) return { map: have, fetchedAt: cached.fetchedAt, source: "VNDirect finfo OUTSTANDING_SHARES" };
    try {
      const got = await fetchShares(symbols);
      for (const [k, v] of got) have.set(k, v);
      const fetchedAt = new Date(now()).toISOString();
      await store.setKv(SHARES_KV, { fetchedAt, map: Object.fromEntries(have) });
      return { map: have, fetchedAt, source: "VNDirect finfo OUTSTANDING_SHARES" };
    } catch (e) {
      if (have.size) return { map: have, fetchedAt: cached?.fetchedAt ?? null, source: "VNDirect finfo OUTSTANDING_SHARES (bản lưu)", warning: e.message };
      throw e;
    }
  }

  /** Index Impact một phiên đã chốt (mặc định phiên gần nhất trong kho). */
  async function impactFor(date = null) {
    const expected = lastCompletedSessionDate(new Date(now()));
    const dates = (await store.getMarketDailyDates()).filter((d) => d <= expected);
    const day = date && dates.includes(date) ? date : dates.at(-1);
    if (!day) throw new Error("Kho cục bộ chưa có dữ liệu ngày (đang dựng lại từ SSI).");
    if (impactMemo.has(day)) return impactMemo.get(day);
    const rows = await store.getMarketDailyByDate(day);
    const hose = rows.filter((r) => r.exchange === "HOSE").map((r) => r.symbol);
    const [sh, idx, tax] = await Promise.all([
      sharesFor(hose),
      service.getOhlcv({ symbol: "VNINDEX", limit: 300 }).then((r) => (r.bars ?? []).filter((b) => !b.partial && b.close > 0)),
      store.getKv("scanner:taxonomy").then((r) => r?.value?.map ?? {}).catch(() => ({})),
    ]);
    const i = idx.findIndex((b) => b.date === day);
    const events = new Map();
    if (corporateActions) {
      await corporateActions.prefetch?.(hose).catch(() => {});
      for (const s of hose) { const ca = await corporateActions.get(s).catch(() => null); if (ca?.events?.length) events.set(s, ca.events); }
    }
    const r = indexImpact({ date: day, rows, shares: sh.map, eventsOf: (s) => events.get(s) ?? null, indexPrev: i > 0 ? idx[i - 1].close : null, indexClose: i >= 0 ? idx[i].close : null, taxonomy: tax });
    const doc = { version: MATRIX_VERSION, index: "VNINDEX", ...r, sharesSource: sh.source, sharesAsOf: sh.fetchedAt, sharesWarning: sh.warning ?? null,
      eventsSource: corporateActions ? "Project A / VNDirect finfo" : null,
      method: "c_i = I(t−1)·(P_t − R̃)·N_i / Σ R̃·N; R̃ = giá tham chiếu điều chỉnh sự kiện quyền; N = cổ phiếu lưu hành (VNDirect). Kiểm chứng 20 phiên 24/09–21/10/2026: RMSE 0,020 điểm %, R² 0,9995.",
      vn30Note: "VN30 tính theo free-float + giới hạn tỷ trọng — chưa có dữ liệu free-float có nguồn nên không tính tác động VN30." };
    for (const k of impactMemo.keys()) if (impactMemo.size > 5) impactMemo.delete(k);
    impactMemo.set(day, doc);
    return doc;
  }

  // Index Impact TRONG PHIÊN: SSI DailyStockPrice của hôm nay (giá khớp hiện tại toàn sàn, ~6 lượt gọi, ~1 phút) làm mới nền mỗi
  // 5 phút trong giờ giao dịch; trả bản gần nhất kèm thời điểm (không chặn chờ). Chỉ số hiện tại = snapshot SSI; mốc = đóng cửa phiên trước.
  let live = { at: 0, doc: null, inflight: null, error: null };
  async function buildLive() {
    const nowDate = new Date(now());
    const today = vnDate(nowDate);
    const dates = (await store.getMarketDailyDates()).filter((d) => d < today);
    const prevDay = dates.at(-1);
    if (!prevDay) throw new Error("Kho cục bộ chưa có dữ liệu ngày.");
    const prevRows = (await store.getMarketDailyByDate(prevDay)).filter((r) => r.exchange === "HOSE" && r.close > 0);
    const universe = new Set(prevRows.map((r) => r.symbol));
    const day = await fetchDay(today);
    const rows = day.rows.filter((r) => r.exchange === "HOSE" && universe.has(r.symbol));
    // Đo 23/10/2026: SSI DailyStockPrice của hôm nay lúc 11:50 trả đủ HOSE, sau 13:00 trả 0 dòng -> không đủ thì KHÔNG công bố.
    if (rows.length < universe.size * LIVE_IMPACT_MIN_COVERAGE) throw new Error(`SSI chưa trả đủ giá trong phiên (${rows.length}/${universe.size} mã HOSE)`);
    // Mã chưa khớp lệnh hôm nay vẫn thuộc vốn hoá VN-Index: đứng giá (đóng góp 0) nhưng PHẢI nằm trong mẫu số Σ R·N.
    const seen = new Set(rows.map((r) => r.symbol));
    for (const r of prevRows) if (!seen.has(r.symbol)) rows.push({ symbol: r.symbol, exchange: "HOSE", close: r.close, refPrice: r.close, value: 0, untraded: true });
    const hose = [...universe];
    const [sh, idx, snap, tax] = await Promise.all([
      sharesFor(hose),
      service.getOhlcv({ symbol: "VNINDEX", limit: 30 }).then((r) => (r.bars ?? []).filter((b) => !b.partial && b.close > 0 && b.date < today)),
      service.getIndexSnapshot("VNINDEX"),
      store.getKv("scanner:taxonomy").then((r) => r?.value?.map ?? {}).catch(() => ({})),
    ]);
    // Sự kiện quyền: nạp GỘP một lượt (trước đây gọi lẻ ~420 mã tuần tự -> nhiều phút).
    const events = new Map();
    if (corporateActions) {
      await corporateActions.prefetch?.(hose).catch(() => {});
      for (const s of hose) { const ca = await corporateActions.get(s).catch(() => null); if (ca?.events?.length) events.set(s, ca.events); }
    }
    // Trong giờ SSI DailyIndex trả điểm = 0 -> lấy điểm hiện tại như thanh trên (nến phút SSI).
    const ix = await resolveIndexNow({ service, snap, today, prevClose: idx.at(-1)?.close ?? null, intraday: true });
    const r = indexImpact({ date: today, rows, shares: sh.map, eventsOf: (s) => events.get(s) ?? null, indexPrev: idx.at(-1)?.close ?? null, indexClose: ix.value, taxonomy: tax });
    return { version: MATRIX_VERSION, index: "VNINDEX", horizon: "intraday", ...r, asOf: new Date(now()).toISOString(), indexAsOf: ix.asOf ?? null, indexSource: ix.source, indexDerived: ix.derived, prevSession: idx.at(-1)?.date ?? null,
      sharesSource: sh.source, sharesAsOf: sh.fetchedAt, sharesWarning: sh.warning ?? null,
      method: "Trong phiên: giá khớp hiện tại (SSI DailyStockPrice, làm mới 5 phút) so giá tham chiếu; VN-Index hiện tại (snapshot SSI) so đóng cửa phiên trước. Cùng công thức phiên đã chốt.",
      vn30Note: "VN30 tính theo free-float + giới hạn tỷ trọng — chưa có dữ liệu free-float có nguồn nên không tính tác động VN30." };
  }
  async function impactLive() {
    const session = currentSession(new Date(now()));
    if (!LIVE_SESSIONS.has(session)) return { live: false, session, reason: "Ngoài giờ giao dịch — xem tác động của phiên đã chốt." };
    const fresh = live.doc && vnDate(new Date(live.at)) === vnDate(new Date(now())) && now() - live.at < LIVE_IMPACT_TTL_MS;
    const cooling = live.error && now() - (live.tried ?? 0) < 60_000; // lỗi -> chờ 1 phút rồi mới thử lại
    if (!fresh && !live.inflight && !cooling) {
      const t0 = Date.now();
      let timer;
      const deadline = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`quá ${LIVE_IMPACT_DEADLINE_MS / 60_000} phút`)), LIVE_IMPACT_DEADLINE_MS); });
      live.inflight = Promise.race([buildLive(), deadline]).finally(() => clearTimeout(timer))
        .then((doc) => { live = { at: now(), doc, inflight: null, error: null, tried: now() }; log.info?.(`[matrix] impact trong phiên: ${Math.round((Date.now() - t0) / 1000)} giây`); })
        .catch((e) => { live.inflight = null; live.error = e.message; live.tried = now(); log.warn?.(`[matrix] impact trong phiên: ${e.message}`); });
    }
    const todays = live.doc && vnDate(new Date(live.at)) === vnDate(new Date(now())) ? live.doc : null;
    // Lượt làm mới lỗi -> giữ bản đúng gần nhất trong ngày, kèm tuổi + lý do (không công bố số thiếu dữ liệu).
    if (todays) return { live: true, session, refreshing: Boolean(live.inflight), ageSec: Math.round((now() - live.at) / 1000), lastError: live.error, ...todays };
    return { live: true, session, pending: true, reason: live.error ? `Lỗi lần tải trước: ${live.error}` : "Đang tải giá trong phiên toàn sàn từ SSI (khoảng 1 phút)…", refreshing: Boolean(live.inflight) };
  }

  /** Liên kết cho snapshot tổng hợp: trụ chỉ số, ngành dẫn dắt / tụt hậu / cảnh báo, tín hiệu gần nhất. */
  async function linksFor(scope, asOf) {
    return service.cache.wrap(`matrix:links:${scope}:${asOf}`, 10 * 60_000, async () => {
      const links = { impact: null, sectors: null, lastSignal: null };
      if (scope === "VNINDEX") { try { links.impact = impactSummary(await impactFor(asOf)); } catch (e) { links.impact = { error: e.message }; } }
      try {
        const sx = await sectors({ scope });
        const rs5 = (x) => x.rs?.[5] ?? null;
        const ranked = sx.sectors.filter((x) => rs5(x) !== null);
        links.sectors = {
          asOf: sx.asOf,
          leaders: ranked.filter((x) => rs5(x) > 0 && x.breadth >= 50).sort((a, b) => rs5(b) - rs5(a)).slice(0, 3).map((x) => ({ industry: x.industry, rs5: rs5(x), breadth: x.breadth })),
          laggards: ranked.filter((x) => rs5(x) < 0 && x.breadth < 50).sort((a, b) => rs5(a) - rs5(b)).slice(0, 3).map((x) => ({ industry: x.industry, rs5: rs5(x), breadth: x.breadth })),
          flagged: sx.sectors.filter((x) => x.flags?.length).slice(0, 4).map((x) => ({ industry: x.industry, flags: x.flags.map((f) => f.text) })),
          medianReturn5: Object.fromEntries(sx.sectors.map((x) => [x.industry, { m1: x.medianReturn?.[1] ?? null, m5: x.medianReturn?.[5] ?? null, breadth: x.breadth, breadth5: x.breadth5 }])),
        };
      } catch (e) { links.sectors = { error: e.message }; }
      try { links.lastSignal = (await store.selectRows(SIGNAL_TABLE, { eq: { scope }, order: "signal_date.desc", limit: 1 }))[0] ?? null; } catch { links.lastSignal = null; }
      if (links.lastSignal) links.lastSignal = { scenario: links.lastSignal.scenario, date: links.lastSignal.signal_date, state: links.lastSignal.state };
      return links;
    });
  }

  /** Sự kiện đã xác nhận của lần quét gần nhất (Project A) -> ngành (cùng phân ngành bảng). null = nguồn không khả dụng. */
  async function confirmedEvents() {
    const ctx = (await store.getKv("scanner:context").catch(() => null))?.value ?? null;
    if (!ctx || ctx.eventsAvailable === false) return null;
    return toActiveEvents(ctx.events ?? [], new Date(now()))
      .filter((e) => e.verifiedStatus === "user_confirmed" && e.status !== "resolved")
      .map((e) => ({ ...e, industries: [...new Set((e.sectors ?? []).map((s) => classify({ legacy: s }).industry))] }));
  }

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
    // Số phiên trong kho nằm trong khoá: lúc kho đang dựng lại (ít phiên) không được giữ kết quả thiếu lịch sử tới phiên sau.
    const key = `${scope}|${asOf}|${dates.length}`;
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

  /** M5: mô hình đang chạy = ghi đè rollback (KV) nếu hợp lệ, ngược lại champion của sổ đăng ký. */
  async function activeModel() {
    const override = (await store.getKv(ACTIVE_MODEL_KV).catch(() => null))?.value?.id ?? null;
    const id = MATRIX_MODELS.models.some((m) => m.id === override) ? override : MATRIX_MODELS.active;
    return MATRIX_MODELS.models.find((m) => m.id === id);
  }
  function forecastOf(model, states, idxBars) {
    const row = featureRows(states, idxBars).at(-1);
    if (!row || !model) return null;
    const g = MATRIX_MODELS.gate;
    const promoted = model.kind === "C1" && g.verdict === "PROMOTE";
    const metrics = model.id === g.champion.id ? g.champion : model.id === g.challenger.id ? g.challenger : g.others.find((o) => o.id === model.id) ?? null;
    return {
      date: row.date, target: "VN-Index sau " + HORIZON + " phiên cao hơn hôm nay", horizon: HORIZON, p: Math.round(predict(model, row) * 1000) / 1000,
      modelId: model.id, kind: model.kind, baseRate: model.base, trainN: model.n, trainedTo: model.trainedTo ?? null,
      holdout: { n: g.n, baseRate: g.baseRate, ...metrics }, gate: g.verdict,
      label: promoted ? "ĐÃ KIỂM ĐỊNH" : "MÔ TẢ",
      note: promoted ? "Mô hình đã qua cổng thăng hạng đặt trước."
        : "Tần suất lịch sử theo nhóm độ rộng (huấn luyện VN100, 2021-10 → 2024-12); mô hình học máy chưa qua cổng thăng hạng (holdout Brier skill " + g.challenger.brierSkill + ").",
    };
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

    // 5. Kịch bản (M3) + cờ rủi ro — THỰC NGHIỆM công khai
    if (d && idxBars?.length) {
      try {
        const states = buildStateSeries({ bySymbol: d.bySymbol, indexBars: idxBars.filter((b) => b.date <= d.asOf) });
        const lc = runLifecycle(states);
        const v = scenarioView(lc, out.breadth.daily?.coverage ?? null, out.regime.label);
        out.scenarios = v.scenarios; out.neutral = v.neutral; out.stateVector = states.at(-1) ?? null;
        out.links = await linksFor(scope, d.asOf).catch((e) => ({ error: e.message }));
        out.riskFlags = riskFlags({ day: v.day, flow: out.flow, links: out.links, events: await confirmedEvents() });
        out.scenarios = attachRelated(out.scenarios, out.links);
        out.forecast = forecastOf(await activeModel(), states, idxBars.filter((b) => b.date <= d.asOf));
      } catch (e) { log.warn?.(`[matrix] kịch bản: ${e.message}`); }
    }
    if (!out.riskFlags.length) out.riskFlags = riskFlags({ day: null, flow: out.flow, links: null, events: await confirmedEvents() });

    const scanAsOf = (await store.getKv("scanner:latest").catch(() => null))?.value?.dataAsOf ?? null;
    health.push(sourceHealth({ id: "scanner", label: "Kết quả Siêu Quét", kind: "daily", asOf: scanAsOf, expectedDate: expected, error: scanAsOf ? null : "Chưa có kết quả quét" }));
    out.dataHealth = { status: overallHealth(health, ["daily", "index"]), sources: health };
    return out;
  }

  /** M2 — heatmap ngành (cùng phân ngành với bảng Siêu Quét) cho phạm vi, phiên đã chốt gần nhất. */
  async function sectors({ scope = "VNINDEX" } = {}) {
    scope = MATRIX_SCOPES[scope] ? scope : "VNINDEX";
    const expected = lastCompletedSessionDate(new Date(now()));
    const d = await dailyScope(scope, expected);
    const [idx, tax, scan] = await Promise.all([
      service.getOhlcv({ symbol: "VNINDEX", limit: 300 }).then((r) => (r.bars ?? []).filter((b) => !b.partial && b.close > 0)),
      store.getKv("scanner:taxonomy").then((r) => r?.value?.map ?? {}).catch(() => ({})),
      store.getKv("scanner:latest").then((r) => r?.value ?? null).catch(() => null),
    ]);
    // Smart Score chỉ ghép khi lần quét CÙNG phiên (không trộn thời điểm).
    const smart = scan?.dataAsOf === d.asOf ? new Map((scan.items ?? []).map((i) => [i.ticker, i.smartScore])) : new Map();
    return {
      version: MATRIX_VERSION, scope: { id: scope, label: MATRIX_SCOPES[scope] },
      ...sectorStats({ bySymbol: d.bySymbol, asOf: d.asOf, indexBars: idx, taxonomy: tax, smart }),
      smartAsOf: scan?.dataAsOf ?? null, smartMatched: smart.size > 0,
      taxonomySource: "scanner:taxonomy (cùng phân ngành với bộ lọc ngành của bảng)",
    };
  }

  /** M2 — mã biến động đáng chú ý (KHÔNG phải đóng góp chỉ số: không có trọng số). */
  async function movers({ scope = "VN30" } = {}) {
    scope = MATRIX_SCOPES[scope] ? scope : "VN30";
    const d = await dailyScope(scope, lastCompletedSessionDate(new Date(now())));
    const tax = await store.getKv("scanner:taxonomy").then((r) => r?.value?.map ?? {}).catch(() => ({}));
    return { version: MATRIX_VERSION, scope: { id: scope, label: MATRIX_SCOPES[scope] }, horizon: "daily", ...notableMovers({ bySymbol: d.bySymbol, asOf: d.asOf, taxonomy: tax }) };
  }

  /** Chấm kết quả các đợt (phiên vào CONFIRMED) trên VN-Index tại T+1/3/5/10, so nền = TB lợi suất cùng kỳ hạn 250 phiên trước. */
  async function scoreSignals() {
    const r = await service.getOhlcv({ symbol: "VNINDEX", limit: 600 });
    const bars = (r.bars ?? []).filter((b) => !b.partial && b.close > 0);
    const idx = new Map(bars.map((b, i) => [b.date, i])), c = bars.map((b) => b.close);
    const rows = await store.selectRows(SIGNAL_TABLE, { eq: { state: "CONFIRMED" } });
    const done = new Set((await store.selectRows(OUTCOME_TABLE, {})).map((x) => `${x.scope}|${x.scenario}|${x.signal_date}|${x.horizon}`));
    const add = [];
    for (const s of rows) {
      const i = idx.get(s.signal_date);
      if (i == null) continue;
      for (const h of OUT_HORIZONS) {
        if (i + h >= c.length || done.has(`${s.scope}|${s.scenario}|${s.signal_date}|${h}`)) continue;
        const ret = (c[i + h] / c[i] - 1) * 100;
        const hist = []; for (let j = Math.max(h, i - 250); j <= i; j++) hist.push((c[j] / c[j - h] - 1) * 100);
        const base = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : 0;
        add.push({ scope: s.scope, scenario: s.scenario, signal_date: s.signal_date, horizon: h, ret: Math.round(ret * 1000) / 1000, excess: Math.round((ret - base) * 1000) / 1000, scored_at: new Date(now()).toISOString() });
      }
    }
    if (add.length) await store.upsertRows(OUTCOME_TABLE, add, "scope,scenario,signal_date,horizon");
    return { scored: add.length };
  }

  /** M6: chấm dự báo đã đủ 10 phiên; Brier 60 phiên thực tế so holdout (+0,03) -> trôi hiệu chỉnh (2 lần liên tiếp -> cảnh báo). */
  async function scoreForecasts() {
    const r = await service.getOhlcv({ symbol: "VNINDEX", limit: 600 });
    const bars = (r.bars ?? []).filter((b) => !b.partial && b.close > 0);
    const idx = new Map(bars.map((b, i) => [b.date, i]));
    const rows = await store.selectRows(FORECAST_TABLE, { eq: { scope: "VNINDEX" } });
    const upd = [];
    for (const f of rows) {
      if (f.y != null) continue;
      const i = idx.get(f.trading_date);
      if (i == null || i + HORIZON >= bars.length) continue;
      upd.push({ ...f, y: bars[i + HORIZON].close > bars[i].close ? 1 : 0 });
    }
    if (upd.length) await store.upsertRows(FORECAST_TABLE, upd, "scope,trading_date");
    const st = await modelStatus();
    const prev = (await store.getKv(DRIFT_KV).catch(() => null))?.value ?? { consecutive: 0 };
    const consecutive = st.drift ? (prev.consecutive ?? 0) + 1 : 0;
    await store.setKv(DRIFT_KV, { consecutive, at: new Date(now()).toISOString(), rollingBrier: st.rollingBrier });
    if (consecutive >= 2) void notifyOps("matrix:drift", "Trading Matrix: mô hình " + st.active + " suy giảm hiệu chỉnh (Brier 60 phiên " + st.rollingBrier + " > ngưỡng " + st.threshold + ") — cân nhắc quay lại phiên bản trước.");
    return { scored: upd.length, ...st, consecutive };
  }

  async function modelStatus() {
    const m = await activeModel();
    const scored = (await store.selectRows(FORECAST_TABLE, { eq: { scope: "VNINDEX" }, order: "trading_date.desc" })).filter((f) => f.y != null && f.model_id === m.id).slice(0, 60);
    const rb = scored.length ? scored.reduce((a, f) => a + (f.p - f.y) ** 2, 0) / scored.length : null;
    const g = MATRIX_MODELS.gate;
    const hb = m.id === g.champion.id ? g.champion.brier : m.id === g.challenger.id ? g.challenger.brier : (g.others.find((o) => o.id === m.id)?.brier ?? g.champion.brier);
    const threshold = Math.round((hb + 0.03) * 1e4) / 1e4;
    return { active: m.id, gate: g.verdict, holdoutBrier: hb, threshold, liveScored: scored.length, rollingBrier: rb == null ? null : Math.round(rb * 1e4) / 1e4, drift: scored.length >= 30 && rb > threshold };
  }

  /** M6: phát lại snapshot cuối phiên cho các phiên trong quá khứ (dữ liệu ≤ phiên đó) — bảng riêng, KHÔNG ghi đè sổ tín hiệu. */
  async function replay({ scope = "VNINDEX", from, to }) {
    scope = MATRIX_SCOPES[scope] ? scope : "VNINDEX";
    const dates = (await store.getMarketDailyDates()).filter((d) => d >= from && d <= to);
    const r = await service.getOhlcv({ symbol: "VNINDEX", limit: 600 });
    const allIdx = (r.bars ?? []).filter((b) => !b.partial && b.close > 0);
    const model = await activeModel();
    const rows = [];
    for (const date of dates) {
      const d = await dailyScope(scope, date);
      const idxBars = allIdx.filter((b) => b.date <= d.asOf);
      const states = buildStateSeries({ bySymbol: d.bySymbol, indexBars: idxBars });
      const v = scenarioView(runLifecycle(states), null, null);
      rows.push({ scope, trading_date: date, replayed_at: new Date(now()).toISOString(), version: MATRIX_VERSION, rule_version: RULE_VERSION, recomputed: true,
        doc: { breadth: dailyBreadth(d.bySymbol, d.asOf), regime: regimeDaily(idxBars), volatility: volatilityDaily(idxBars), scenarios: v.scenarios.map((x) => ({ id: x.id, state: x.state })), forecast: forecastOf(model, states, idxBars) } });
    }
    if (rows.length) await store.upsertRows(REPLAY_TABLE, rows, "scope,trading_date");
    return { scope, replayed: rows.length, from, to };
  }

  /** Sổ tín hiệu + kết quả thực tế + kiểm định lịch sử cho giao diện. */
  async function signals({ scope = "VNINDEX", limit = 40 } = {}) {
    const sig = await store.selectRows(SIGNAL_TABLE, { eq: { scope }, order: "signal_date.desc", limit });
    const outs = await store.selectRows(OUTCOME_TABLE, { eq: { scope } });
    const live = {};
    for (const id of Object.keys(SCENARIOS)) {
      live[id] = Object.fromEntries(OUT_HORIZONS.map((h) => {
        const xs = outs.filter((o) => o.scenario === id && o.horizon === h).map((o) => o.excess);
        return [h, { n: xs.length, meanExcess: xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null }];
      }));
    }
    return { version: MATRIX_VERSION, scope, ruleVersion: RULE_VERSION, recent: sig.map((s) => ({ scenario: s.scenario, date: s.signal_date, state: s.state, evidence: s.evidence, health: s.health })),
      live, validation: { prereg: MATRIX_VALIDATION.prereg, verdicts: MATRIX_VALIDATION.verdicts, summary: MATRIX_VALIDATION.summary, stats: MATRIX_VALIDATION.stats },
      note: "Kết quả thực tế chỉ tính khi đã đủ kỳ hạn; tín hiệu đang theo dõi không được tính như kết quả hoàn tất." };
  }

  return {
    overview, sectors, movers, signals, scoreSignals, scoreForecasts, modelStatus, replay, impact: impactFor, impactLive,
    /** M5: quay lại / chọn phiên bản mô hình trong sổ đăng ký (admin). */
    async setActiveModel(id) {
      if (!MATRIX_MODELS.models.some((m) => m.id === id)) throw Object.assign(new Error("Không có mô hình " + id + " trong sổ đăng ký."), { statusCode: 400 });
      await store.setKv(ACTIVE_MODEL_KV, { id, at: new Date(now()).toISOString() });
      return modelStatus();
    },
    /** 16:50 — lưu snapshot cuối phiên ba phạm vi vào bảng cục bộ (ghi đúng thời điểm, không sửa về sau). */
    async snapshot() {
      const saved = [];
      for (const scope of Object.keys(MATRIX_SCOPES)) {
        const o = await overview({ scope, horizon: "daily" });
        const date = o.sourceAsOf.daily ?? o.session.tradingDate;
        await store.upsertRows(SNAPSHOT_TABLE, [{ scope, trading_date: date, version: MATRIX_VERSION, created_at: o.asOf, doc: o }], "scope,trading_date");
        // Sổ tín hiệu: ghi chuyển trạng thái của phiên đúng thời điểm phát (không ghi lại về sau).
        const sig = [];
        for (const sc of o.scenarios ?? []) {
          if (sc.since !== date) continue;
          // Chỉ ghi chuyển trạng thái có ý nghĩa (vào Theo dõi / Đủ điều kiện / Vô hiệu) — về INACTIVE / COOLDOWN không phải tín hiệu.
          if (!LEDGER_STATES.has(sc.state)) continue;
          sig.push({ scope, scenario: sc.id, signal_date: date, state: sc.state, rule_version: sc.ruleVersion, created_at: o.asOf,
            evidence: sc.evidence, contradictions: sc.contradictions, inputs: o.stateVector, coverage: o.breadth.daily?.coverage ?? null, health: o.dataHealth.status });
        }
        if (sig.length) await store.upsertRows(SIGNAL_TABLE, sig, "scope,scenario,signal_date");
        // M5/M6: ghi dự báo của mô hình đang chạy để chấm hiệu chỉnh thực tế sau 10 phiên.
        if (o.forecast && o.forecast.date === date) await store.upsertRows(FORECAST_TABLE, [{ scope, trading_date: date, model_id: o.forecast.modelId, p: o.forecast.p, y: null }], "scope,trading_date");
        // M6: nguồn bắt buộc hỏng 2 phiên liên tiếp -> cảnh báo vận hành.
        if (scope === "VNINDEX" && o.dataHealth.status === "UNAVAILABLE") {
          const prev = (await store.selectRows(SNAPSHOT_TABLE, { eq: { scope }, order: "trading_date.desc", limit: 2 }))[1];
          if (prev?.doc?.dataHealth?.status === "UNAVAILABLE") void notifyOps("matrix:unavailable", "Trading Matrix: nguồn dữ liệu bắt buộc không khả dụng 2 phiên liên tiếp (" + prev.trading_date + ", " + date + ").");
        }
        saved.push({ scope, date, health: o.dataHealth.status, signals: sig.length });
      }
      let scoring = null, model = null;
      try { scoring = await scoreSignals(); } catch (e) { scoring = { error: e.message }; }
      try { model = await scoreForecasts(); } catch (e) { model = { error: e.message }; }
      return { saved, scoring, model };
    },
    async history({ scope = "VNINDEX", limit = 60 } = {}) {
      const rows = await store.selectRows(SNAPSHOT_TABLE, { eq: { scope }, order: "trading_date.desc", limit });
      return rows.map((r) => ({ date: r.trading_date, version: r.version, regime: r.doc?.regime?.label ?? null, aboveMa20Pct: r.doc?.breadth?.daily?.aboveMa20Pct ?? null, flow: r.doc?.flow?.state ?? null, atrPercentile: r.doc?.volatility?.atrPercentile ?? null, health: r.doc?.dataHealth?.status ?? null }));
    },
  };
}

export const MATRIX_SCHEDULE = [{ name: "matrixSnapshot", at: "16:50", tradingDayOnly: true }];
