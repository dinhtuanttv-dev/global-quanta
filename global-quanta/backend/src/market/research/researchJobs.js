// Job tầng nghiên cứu (chạy sau Siêu Quét, ngày giao dịch):
//   researchFlow      16:00 — cô đặc nến phút / tick Lee–Ready mỗi phiên -> market_flow_daily + Volume Profile
//                            (mã đã có: chỉ phiên mới; mã chưa có: nạp tối đa RESEARCH_FLOW_MAX_BACKFILL mã/lần)
//   researchBackfill  20:30 — như researchFlow nhưng lô lớn hơn (nạp lịch sử ~1 năm ≈ 100 s/mã từ SSI),
//                            ngoài giờ giao dịch; tiến độ lưu theo từng mã nên chạy tiếp được sau khi bị ngắt
//   researchSignals   16:20 — Regime + Impulse theo ngày, đặc trưng IFE, ghi sổ cái tín hiệu
//   researchEvaluate  16:40 — chấm T+3/T+5/T+10, tổng hợp hiệu suất, cô đặc/dọn tick, làm mới materialized view
//   researchTrain     Thứ Bảy 10:30 — tinh chỉnh trọng số (champion / challenger)

import { groupSessions } from "../scanner/intradayService.js";
import { groupTickRows } from "../scanner/tickFlowService.js";
import { KV } from "../scanner/scannerJobs.js";
import { lastCompletedSessionDate } from "../calendar.js";
import { addDays, mapLimit } from "../util.js";
import { summarizeSessions } from "./flowHistory.js";
import { breadthByDate, buildRegimeSeries } from "./regime.js";
import { computeDailyFeatures, featureVector } from "./features.js";
import { HORIZONS, stockSignals, impulseSignal, adaptiveSignal, evaluateOutcome, summarizePerformance } from "./feedback.js";
import { trainAdaptive, decidePromotion, predictRaw, evaluate } from "./tuner.js";

export const RESEARCH_KV = {
  signalsThrough: "research:signals-through",
  evaluatedThrough: "research:evaluated-through",
  performance: "research:performance",
  model: "research:model",
};

export const T = {
  flow: "market_flow_daily",
  profile: "market_volume_profile_daily",
  regime: "market_regime_daily",
  ledger: "market_signal_ledger",
  outcomes: "market_signal_outcomes",
  weights: "market_model_weights",
};

const FLOW_SESSIONS = () => Number(process.env.RESEARCH_FLOW_SESSIONS) || 250;
const MAX_BACKFILL = () => Number(process.env.RESEARCH_FLOW_MAX_BACKFILL) || 20;
const MAX_BACKFILL_NIGHT = () => Number(process.env.RESEARCH_BACKFILL_MAX) || 90;
const TICK_KEEP_DAYS = () => Number(process.env.RESEARCH_TICK_KEEP_DAYS) || 60;
const num = (v) => (v === null || v === undefined ? null : Number(v));

export const flowFromRow = (r) => ({
  symbol: r.symbol, date: r.trading_date, method: r.method, close: num(r.close), refPrice: num(r.ref_price),
  volume: num(r.volume), continuousVolume: num(r.continuous_volume), delta: num(r.delta),
  largeDelta: num(r.large_delta), smallDelta: num(r.small_delta), ret: num(r.ret), minuteP95: num(r.minute_p95),
  features: r.features ?? null,
});
const flowToRow = (symbol, f, features) => ({
  symbol, trading_date: f.date, method: f.method, close: f.close, ref_price: f.refPrice, volume: f.volume,
  continuous_volume: f.continuousVolume, delta: f.delta, large_delta: f.largeDelta, small_delta: f.smallDelta,
  ret: f.ret, minute_p95: f.minuteP95, features: features ?? f.features ?? null, updated_at: new Date().toISOString(),
});
const profileToRow = (symbol, p) => ({
  symbol, trading_date: p.date, poc: p.poc, va_low: p.vaLow, va_high: p.vaHigh, vwap: p.vwap, bins: p.bins,
  source: "MINUTE_BARS", updated_at: new Date().toISOString(),
});
const profileFromRow = (r) => ({ date: r.trading_date, poc: num(r.poc), vaLow: num(r.va_low), vaHigh: num(r.va_high), vwap: num(r.vwap), bins: r.bins });

function groupBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

async function upsertChunked(store, table, rows, conflict, size = 1000) {
  for (let i = 0; i < rows.length; i += size) await store.upsertRows(table, rows.slice(i, i + size), conflict);
  return rows.length;
}

export function createResearchJobs(service, { now = Date.now } = {}) {
  const store = service.store;

  async function universeTickers() {
    const tickers = (await store.getKv(KV.universe))?.value?.tickers ?? [];
    if (!tickers.length) throw new Error("Chưa có universe. Chạy buildUniverse trước.");
    return [...tickers].sort((x, y) => (y.avgValue20 ?? 0) - (x.avgValue20 ?? 0)).map((t) => t.ticker);
  }

  async function dailyBySymbol(symbols, from, to) {
    const rows = await store.getMarketDailyRange({ from, to, symbols });
    return groupBy(rows, "symbol");
  }

  async function indexBars() {
    const res = await service.getOhlcv({ symbol: "VNINDEX", limit: 700 });
    return res.bars.filter((b) => !b.partial);
  }

  async function regimeRows() {
    return (await store.selectRows(T.regime, { order: "trading_date.asc" })).map((r) => ({
      date: r.trading_date, close: num(r.close), impulseScore: num(r.impulse_score), regime: r.regime, breadthPct: num(r.breadth_pct),
    }));
  }

  async function activeModels() {
    const rows = await store.selectRows(T.weights, { eq: { status: "active" } });
    return new Map(rows.map((r) => [Number(String(r.model).replace("ADAPTIVE_T", "")), { ...r, horizon: Number(String(r.model).replace("ADAPTIVE_T", "")) }]));
  }

  /** Cô đặc nến phút từng phiên của universe (gia tăng; nạp lịch sử cho tối đa `maxBackfill` mã chưa có). */
  async function flowJob({ maxBackfill }) {
    const provider = service.router.providers?.ssiFcV2;
    if (!provider?.isConfigured?.()) throw new Error("Chưa cấu hình SSI FC Data cho nến phút.");
    const symbols = await universeTickers();
    const lastClosed = lastCompletedSessionDate(new Date(now()));
    const dates = (await store.getMarketDailyDates()).filter((d) => d <= lastClosed).slice(-FLOW_SESSIONS());
    if (!dates.length) throw new Error("Chưa có dữ liệu ngày. Chạy backfillMarketDaily trước.");
    const existing = groupBy(await store.selectRows(T.flow, {
      select: "symbol,trading_date,minute_p95", gte: { trading_date: addDays(dates[0], -120) }, order: "trading_date.asc",
    }), "symbol");

    // Mã đã có lịch sử trước (nhanh, 1 request/mã), rồi một lô mã cần nạp lịch sử theo thứ tự thanh khoản.
    const known = symbols.filter((s) => existing.has(s));
    const fresh = symbols.filter((s) => !existing.has(s));
    const batch = [...known, ...fresh.slice(0, maxBackfill)];
    let sessions = 0, failed = 0, skipped = 0;
    await mapLimit(batch, 2, async (symbol) => {
      const have = existing.get(symbol) ?? [];
      const last = have.at(-1)?.trading_date ?? null;
      // Đã có dữ liệu: chỉ nạp phiên MỚI; chưa có: nạp cả cửa sổ (không thử lại lỗ hổng cũ mãi mãi).
      const missing = dates.filter((d) => (last ? d > last : true));
      if (!missing.length) { skipped++; return; }
      try {
        const from = missing[0], to = missing.at(-1);
        const bars = from === to ? await provider.getIntradayOhlcv(symbol, from) : await provider.getIntradayRange(symbol, from, to);
        const wanted = new Set(missing);
        const grouped = groupSessions(bars).filter((s) => wanted.has(s.date));
        const ticks = typeof store.getTickFlowRange === "function" ? groupTickRows(await store.getTickFlowRange({ symbol, from, to })) : new Map();
        const daily = await store.getMarketDailyRange({ from, to, symbols: [symbol] });
        const refByDate = new Map(daily.filter((r) => r.refPrice > 0).map((r) => [r.date, r.refPrice]));
        const { flow, profiles } = summarizeSessions(grouped, {
          priorP95s: have.map((r) => num(r.minute_p95)), tickByDate: ticks, refByDate,
        });
        if (flow.length) await store.upsertRows(T.flow, flow.map((f) => flowToRow(symbol, f)), "symbol,trading_date");
        if (profiles.length) await store.upsertRows(T.profile, profiles.map((p) => profileToRow(symbol, p)), "symbol,trading_date");
        sessions += flow.length;
      } catch (error) {
        failed++;
        console.warn(`[research] researchFlow ${symbol}: ${error.message}`);
      }
    });
    return {
      symbols: symbols.length, processed: batch.length, sessionsWritten: sessions, upToDate: skipped, failed,
      backfilled: Math.min(fresh.length, maxBackfill), backfillRemaining: Math.max(0, fresh.length - maxBackfill),
      window: [dates[0], dates.at(-1)],
    };
  }

  const jobs = {
    researchFlow: () => flowJob({ maxBackfill: MAX_BACKFILL() }),
    researchBackfill: () => flowJob({ maxBackfill: MAX_BACKFILL_NIGHT() }),

    /** Regime + Impulse theo ngày, đặc trưng IFE, sổ cái tín hiệu (gia tăng). */
    async researchSignals() {
      const symbols = await universeTickers();
      const dates = await store.getMarketDailyDates();
      const from = dates.at(-Math.min(dates.length, 330)), to = dates.at(-1);
      const daily = await dailyBySymbol(symbols, from, to);

      // 1. Regime & Impulse dựng lại cho từng ngày.
      const regimeSeries = buildRegimeSeries(await indexBars(), breadthByDate(daily));
      await upsertChunked(store, T.regime, regimeSeries.map((r) => ({
        trading_date: r.date, index_code: "VNINDEX", close: r.close, ma20: r.ma20, ma50: r.ma50, ma200: r.ma200,
        breadth_pct: r.breadthPct, impulse_score: r.impulseScore, regime: r.regime, updated_at: new Date().toISOString(),
      })), "trading_date");
      const regimeByDate = new Map(regimeSeries.map((r) => [r.date, r]));

      // 2. Đặc trưng + tín hiệu theo mã.
      const through = (await store.getKv(RESEARCH_KV.signalsThrough))?.value?.date ?? null;
      const flowAll = groupBy((await store.selectRows(T.flow, { gte: { trading_date: from }, order: "trading_date.asc" })).map(flowFromRow), "symbol");
      const profAll = groupBy(await store.selectRows(T.profile, { gte: { trading_date: from }, select: "symbol,trading_date,poc,va_low,va_high,vwap,bins" }), "symbol");
      const models = await activeModels();
      const ledger = [], flowUpdates = [];
      let lastDate = through;
      for (const symbol of symbols) {
        const flow = flowAll.get(symbol) ?? [];
        if (flow.length < 25) continue;
        const feats = computeDailyFeatures({
          flow, daily: daily.get(symbol) ?? [], profiles: (profAll.get(symbol) ?? []).map(profileFromRow), regimeByDate,
        });
        for (const f of flow) {
          const day = feats.get(f.date);
          if (!day) continue;
          if (!f.features || !through || f.date > through) flowUpdates.push(flowToRow(symbol, f, { ...day.features, regime: day.regime }));
          if (through && f.date <= through) continue;
          if (!lastDate || f.date > lastDate) lastDate = f.date;
          const common = { symbol, signal_date: f.date, regime: day.regime };
          for (const s of stockSignals(day)) {
            ledger.push({ ...common, signal: s.signal, direction: s.direction, score: s.score, model_version: null, features: { ...day.features, ...(s.extra ?? {}) } });
          }
          // Điểm thích ứng: CHỈ ghi cho ngày sau dữ liệu huấn luyện (ngoài mẫu thật), tránh tự chấm điểm trong mẫu.
          for (const [h, m] of models) {
            if (!(f.date > m.train_to)) continue;
            const prob = predictRaw(m.weights, featureVector(day.features), day.regime);
            const s = adaptiveSignal(h, prob);
            if (s) ledger.push({ ...common, signal: s.signal, direction: s.direction, score: s.score, model_version: m.version, features: day.features });
          }
        }
      }
      for (const r of regimeSeries) {
        if (through && r.date <= through) continue;
        const s = impulseSignal(r.impulseScore);
        if (s) ledger.push({ symbol: "VNINDEX", signal_date: r.date, signal: s.signal, direction: s.direction, score: s.score, regime: r.regime, model_version: null, features: { breadthPct: r.breadthPct } });
      }
      await upsertChunked(store, T.flow, flowUpdates, "symbol,trading_date");
      await upsertChunked(store, T.ledger, ledger, "symbol,signal_date,signal");
      // Ghi bù tín hiệu ngày cũ hơn mốc đã chấm -> lùi mốc để researchEvaluate chấm cả phần bù.
      const evaluated = (await store.getKv(RESEARCH_KV.evaluatedThrough))?.value?.date ?? null;
      const oldest = ledger.reduce((m, l) => (!m || l.signal_date < m ? l.signal_date : m), null);
      if (evaluated && oldest && oldest <= evaluated) await store.setKv(RESEARCH_KV.evaluatedThrough, { date: addDays(oldest, -1) });
      if (lastDate) await store.setKv(RESEARCH_KV.signalsThrough, { date: lastDate });
      return { regimeDays: regimeSeries.length, featuresWritten: flowUpdates.length, signals: ledger.length, through: lastDate };
    },

    /** Chấm điểm T+3/T+5/T+10, tổng hợp hiệu suất, dọn tick, làm mới materialized view. */
    async researchEvaluate() {
      const dates = await store.getMarketDailyDates();
      const evaluatedThrough = (await store.getKv(RESEARCH_KV.evaluatedThrough))?.value?.date ?? null;
      const pending = await store.selectRows(T.ledger, {
        select: "symbol,signal_date,signal,direction,regime",
        ...(evaluatedThrough ? { gte: { signal_date: addDays(evaluatedThrough, 1) } } : {}),
      });
      const regimes = await regimeRows();
      const benchClose = new Map(regimes.map((r) => [r.date, r.close]));
      const done = new Set((await store.selectRows(T.outcomes, {
        select: "symbol,signal_date,signal,horizon",
        ...(evaluatedThrough ? { gte: { signal_date: addDays(evaluatedThrough, 1) } } : {}),
      })).map((o) => `${o.symbol}|${o.signal_date}|${o.signal}|${o.horizon}`));

      const stockSymbols = [...new Set(pending.map((p) => p.symbol).filter((s) => s !== "VNINDEX"))];
      const minDate = pending.reduce((m, p) => (p.signal_date < m ? p.signal_date : m), dates.at(-1) ?? "9999");
      const daily = stockSymbols.length ? await dailyBySymbol(stockSymbols, addDays(minDate, -40), dates.at(-1)) : new Map();
      const indexRows = regimes.map((r) => ({ date: r.date, close: r.close, closeAdj: r.close, high: r.close, low: r.close }));
      const indexPos = new Map(indexRows.map((r, i) => [r.date, i]));
      const posCache = new Map();
      const outcomes = [];
      let oldestIncomplete = null, newestPending = null;
      for (const p of pending) {
        if (!newestPending || p.signal_date > newestPending) newestPending = p.signal_date;
        const isIndex = p.symbol === "VNINDEX";
        const rows = isIndex ? indexRows : daily.get(p.symbol) ?? [];
        if (!isIndex && !posCache.has(p.symbol)) posCache.set(p.symbol, new Map(rows.map((r, i) => [r.date, i])));
        const i = isIndex ? indexPos.get(p.signal_date) : posCache.get(p.symbol).get(p.signal_date);
        if (i === undefined) continue; // không có giá ngày đó: không chấm được, không chặn mốc
        for (const h of HORIZONS) {
          if (done.has(`${p.symbol}|${p.signal_date}|${p.signal}|${h}`)) continue;
          const o = evaluateOutcome(rows, i, p.direction, h, isIndex ? null : benchClose);
          if (!o) {
            // Chỉ "chờ" khi chưa đủ h phiên tương lai; thiếu dữ liệu khác (VD không có VN-Index ngày đó) thì bỏ qua.
            if (i + h >= rows.length && (!oldestIncomplete || p.signal_date < oldestIncomplete)) oldestIncomplete = p.signal_date;
            continue;
          }
          outcomes.push({
            symbol: p.symbol, signal_date: p.signal_date, signal: p.signal, horizon: h,
            ret: o.ret, bench_ret: o.benchRet, excess_ret: o.excessRet, barrier: o.barrier, mfe: o.mfe, mae: o.mae, hit: o.hit,
            evaluated_at: new Date().toISOString(),
          });
        }
      }
      await upsertChunked(store, T.outcomes, outcomes, "symbol,signal_date,signal,horizon");
      // Mốc "đã chấm xong": chỉ tiến tới ngay trước tín hiệu cũ nhất còn thiếu kỳ hạn
      // (không suy từ lịch — sổ cái có thể được ghi bù ngày cũ sau đó).
      const through = oldestIncomplete ? addDays(oldestIncomplete, -1) : newestPending ?? evaluatedThrough;
      if (through) await store.setKv(RESEARCH_KV.evaluatedThrough, { date: through });

      // Hiệu suất toàn lịch sử (JS — chạy được cả khi không có Supabase).
      const ledgerAll = await store.selectRows(T.ledger, { select: "symbol,signal_date,signal,direction,regime" });
      const outAll = await store.selectRows(T.outcomes, { select: "symbol,signal_date,signal,horizon,hit,excess_ret,ret" });
      const meta = new Map(ledgerAll.map((l) => [`${l.symbol}|${l.signal_date}|${l.signal}`, l]));
      const base = await baselineStats(store, benchClose, dates, indexRows);
      const joined = [];
      for (const o of outAll) {
        const l = meta.get(`${o.symbol}|${o.signal_date}|${o.signal}`);
        if (!l) continue;
        const h = Number(o.horizon), d = Number(l.direction);
        let expectedHit = null, signedExcess = null;
        if (l.symbol === "VNINDEX") {
          const p = base.index[h];
          expectedHit = p === undefined ? null : d > 0 ? p : 1 - p;
          signedExcess = d * (num(o.ret) - (base.indexMean[h] ?? 0));
        } else {
          const day = base.byDate[h]?.get(l.signal_date);
          if (day) { expectedHit = d > 0 ? day.p : 1 - day.p; signedExcess = d * (num(o.excess_ret) - day.mean); }
        }
        joined.push({ signal: l.signal, direction: d, regime: l.regime, horizon: h, hit: o.hit, expectedHit, signedExcess });
      }
      const baseline = base.overall;
      const rows = summarizePerformance(joined);
      const current = regimes.at(-1) ?? null;
      await store.setKv(RESEARCH_KV.performance, {
        generatedAt: new Date(now()).toISOString(), baseline, baselineIndex: base.index, rows, signals: ledgerAll.length, outcomes: outAll.length,
        currentRegime: current && { date: current.date, regime: current.regime, impulseScore: current.impulseScore, breadthPct: current.breadthPct },
      });

      // Dữ liệu dài hạn: cô đặc tick theo phiên, dọn tick phút cũ, làm mới materialized view (chỉ Supabase).
      const maintenance = {};
      for (const [name, fn, args] of [
        ["rollup", "market_rollup_tick_flow", { p_since: addDays(dates.at(-1) ?? new Date(now()).toISOString().slice(0, 10), -14) }],
        ["prune", "market_prune_tick_flow", { p_keep_days: TICK_KEEP_DAYS() }],
        ["refresh", "market_refresh_research", {}],
      ]) {
        try { maintenance[name] = await store.rpc(fn, args); } catch (error) { maintenance[name] = `lỗi: ${error.message.slice(0, 120)}`; }
      }
      return { pending: pending.length, outcomesWritten: outcomes.length, performanceRows: rows.length, maintenance };
    },

    /** Tinh chỉnh trọng số theo từng kỳ hạn; champion / challenger. */
    async researchTrain() {
      const symbols = await universeTickers();
      const dates = await store.getMarketDailyDates();
      const from = dates.at(-Math.min(dates.length, 330));
      const daily = await dailyBySymbol(symbols, from, dates.at(-1));
      const regimes = await regimeRows();
      const benchClose = new Map(regimes.map((r) => [r.date, r.close]));
      const flow = await store.selectRows(T.flow, { select: "symbol,trading_date,features", gte: { trading_date: from } });
      const samplesByH = buildSamples(flow, daily, benchClose);
      const active = await activeModels();
      const summary = { trainedAt: new Date(now()).toISOString(), horizons: {} };

      for (const h of HORIZONS) {
        const samples = samplesByH.get(h) ?? [];
        const res = trainAdaptive(samples, { horizon: h });
        const model = `ADAPTIVE_T${h}`;
        const current = active.get(h) ?? null;
        if (!res.ok) {
          summary.horizons[h] = { status: "insufficient", reason: res.reason, samples: samples.length, active: current && describeModel(current) };
          continue;
        }
        let liveMetrics = null;
        if (current) {
          const fresh = samples.filter((s) => s.date > current.train_to);
          if (fresh.length >= 100) liveMetrics = evaluate(fresh.map((s) => predictRaw(current.weights, s.x, s.regime)), fresh, current.weights.baseRate);
        }
        const decision = decidePromotion(res, current && { metrics: current.metrics }, { liveMetrics });
        const version = `${res.trainTo}.${Date.now().toString(36)}`;
        const row = {
          model, version, status: decision.promote ? "active" : "rejected", trained_at: new Date(now()).toISOString(),
          train_from: res.trainFrom, train_to: res.trainTo, weights: res.model,
          metrics: { ...res.metrics, decision: decision.reason, liveMetricsOfPrevious: liveMetrics },
        };
        if (decision.promote && current) await store.upsertRows(T.weights, [{ ...current, status: "retired", horizon: undefined }].map(stripHorizon), "model,version");
        await store.upsertRows(T.weights, [row], "model,version");
        summary.horizons[h] = { status: decision.promote ? "promoted" : "kept", reason: decision.reason, samples: samples.length, active: describeModel(decision.promote ? row : current), candidate: describeModel(row) };
      }
      await store.setKv(RESEARCH_KV.model, summary);
      return Object.fromEntries(Object.entries(summary.horizons).map(([h, v]) => [`T+${h}`, `${v.status}: ${v.reason}`]));
    },
  };

  return jobs;
}

const stripHorizon = (r) => { const { horizon, ...rest } = r; return rest; };

export function describeModel(row) {
  if (!row) return null;
  const w = row.weights;
  return {
    model: row.model, version: row.version, status: row.status, trainFrom: row.train_from, trainTo: row.train_to,
    holdout: row.metrics?.holdout ?? null, heuristic: row.metrics?.heuristic ?? null, byRegime: row.metrics?.byRegime ?? null,
    lambda: row.metrics?.lambda ?? null,
    weights: w?.features?.map((name, j) => ({ name, weight: Math.round(w.global[j + 1] * 1e4) / 1e4 })) ?? [],
    regimeModels: Object.keys(w?.regimes ?? {}),
  };
}

/**
 * Mẫu huấn luyện: đặc trưng tại t -> nhãn CẮT NGANG "mạnh hơn trung vị toàn universe cùng ngày
 * sau h phiên" (lợi suất vượt VN-Index trừ trung vị cùng ngày > 0). Tỷ lệ nền ≈ 50% mọi ngày nên
 * mô hình đo khả năng CHỌN MÃ, không bị xu hướng chung của thị trường (vốn đổi theo tuần) làm lệch.
 * @returns {Map<number, any[]>}
 */
export function buildSamples(flowRows, dailyBySym, benchClose) {
  const out = new Map(HORIZONS.map((h) => [h, []]));
  // Trung vị lợi suất vượt của toàn universe theo (h, ngày).
  const medians = new Map(HORIZONS.map((h) => [h, new Map()]));
  for (const h of HORIZONS) {
    const byDate = new Map();
    for (const rows of dailyBySym.values()) {
      for (let i = 0; i + h < rows.length; i++) {
        const o = evaluateOutcome(rows, i, 1, h, benchClose);
        if (!o) continue;
        if (!byDate.has(rows[i].date)) byDate.set(rows[i].date, []);
        byDate.get(rows[i].date).push(o.excessRet);
      }
    }
    for (const [d, v] of byDate) if (v.length >= 3) medians.get(h).set(d, medianOf(v));
  }
  const pos = new Map();
  for (const f of flowRows) {
    if (!f.features) continue;
    const rows = dailyBySym.get(f.symbol);
    if (!rows) continue;
    if (!pos.has(f.symbol)) pos.set(f.symbol, new Map(rows.map((r, i) => [r.date, i])));
    const i = pos.get(f.symbol).get(f.trading_date);
    if (i === undefined) continue;
    const regime = f.features.regime ?? null;
    for (const h of HORIZONS) {
      const o = evaluateOutcome(rows, i, 1, h, benchClose);
      const med = medians.get(h).get(f.trading_date);
      if (!o || med === undefined) continue;
      const rel = o.excessRet - med;
      out.get(h).push({ date: f.trading_date, symbol: f.symbol, x: featureVector(f.features), y: rel > 0 ? 1 : 0, excess: rel, regime });
    }
  }
  return out;
}

function medianOf(values) {
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Mốc so sánh theo NGÀY (cắt ngang toàn universe): p_up = tỷ lệ mã vượt VN-Index sau h phiên kể từ
 * ngày đó, mean = lợi suất vượt trung bình; cùng tỷ lệ tăng của VN-Index (cho tín hiệu cấp chỉ số).
 */
async function baselineStats(store, benchClose, dates, indexRows) {
  const out = { byDate: {}, overall: {}, index: {}, indexMean: {} };
  const symbols = (await store.getKv(KV.universe))?.value?.tickers?.map((t) => t.ticker) ?? [];
  const rows = symbols.length && dates.length
    ? groupBy(await store.getMarketDailyRange({ from: dates.at(-Math.min(dates.length, 330)), to: dates.at(-1), symbols }), "symbol")
    : new Map();
  // Cắt ngang tối thiểu 20 mã/ngày (universe nhỏ: một nửa số mã, ít nhất 3).
  const minCross = Math.min(20, Math.max(3, Math.floor(rows.size / 2)));
  for (const h of HORIZONS) {
    const acc = new Map();
    let k = 0, n = 0;
    for (const series of rows.values()) {
      for (let i = 0; i + h < series.length; i++) {
        const o = evaluateOutcome(series, i, 1, h, benchClose);
        if (!o) continue;
        const a = acc.get(series[i].date) ?? { up: 0, n: 0, sum: 0 };
        a.n++; a.sum += o.excessRet; if (o.excessRet > 0) a.up++;
        acc.set(series[i].date, a);
        n++; if (o.excessRet > 0) k++;
      }
    }
    out.byDate[h] = new Map([...acc].filter(([, a]) => a.n >= minCross).map(([d, a]) => [d, { p: a.up / a.n, mean: a.sum / a.n }]));
    out.overall[h] = n ? Math.round((k / n) * 1e4) / 1e4 : 0.5;
    let ku = 0, ni = 0, si = 0;
    for (let i = 0; i + h < indexRows.length; i++) {
      const r = indexRows[i + h].close / indexRows[i].close - 1;
      ni++; si += r; if (r > 0) ku++;
    }
    out.index[h] = ni ? Math.round((ku / ni) * 1e4) / 1e4 : 0.5;
    out.indexMean[h] = ni ? si / ni : 0;
  }
  return out;
}

export const RESEARCH_SCHEDULE = [
  { name: "researchFlow", at: "16:00", tradingDayOnly: true },
  { name: "researchBackfill", at: "20:30", tradingDayOnly: false },
  { name: "researchSignals", at: "16:20", tradingDayOnly: true },
  { name: "researchEvaluate", at: "16:40", tradingDayOnly: true },
  { name: "researchTrain", at: "10:30", weekdays: [6] },
];
