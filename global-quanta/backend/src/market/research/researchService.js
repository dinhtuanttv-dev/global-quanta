// API đọc kết quả tầng nghiên cứu cho UI (Siêu Quét AI, Action Center).

import { canonicalSymbol, isValidSymbol } from "../normalizer.js";
import { ValidationError } from "../errors.js";
import { RESEARCH_KV, T, flowFromRow, describeModel } from "./researchJobs.js";
import { featureVector, FEATURE_NAMES } from "./features.js";
import { explain } from "./tuner.js";
import { SIGNAL_LABELS, HORIZONS } from "./feedback.js";
import { analyzeIndex } from "./indexAnalysis.js";
import { INTEL_KV, MODEL_FEATURES } from "./marketIntel.js";

export const FEATURE_LABELS = {
  zEffort: "Nỗ lực dòng lệnh (z)",
  zResult: "Kết quả giá (z)",
  zLarge: "Dòng lệnh tay to (z)",
  stealth5: "Stealth 5 phiên",
  stealth20: "Stealth 20 phiên",
  netIntent: "Ý đồ ròng (HMM)",
  pocDistAtr: "Khoảng cách tới POC 20 phiên (ATR)",
  valueAreaPos: "Vị trí so với vùng giá trị",
  logRvol: "RVOL (log)",
  mom5Atr: "Động lượng 5 phiên (ATR)",
  impulse: "Market Impulse",
};

async function activeModelRows(store) {
  return store.selectRows(T.weights, { eq: { status: "active" } });
}

export async function getResearchOverview(store) {
  const [model, performance, active, regimeRows, intel] = await Promise.all([
    store.getKv(RESEARCH_KV.model), store.getKv(RESEARCH_KV.performance), activeModelRows(store),
    store.selectRows(T.regime, { order: "trading_date.asc" }), store.getKv(INTEL_KV),
  ]);
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  const index = analyzeIndex(regimeRows.map((r) => ({
    date: r.trading_date, close: num(r.close), regime: r.regime, impulseScore: num(r.impulse_score), breadthPct: num(r.breadth_pct),
    ma20: num(r.ma20), ma50: num(r.ma50), ma200: num(r.ma200),
  })));
  const perf = performance?.value ?? null;
  return {
    generatedAt: perf?.generatedAt ?? null,
    currentRegime: perf?.currentRegime ?? null,
    // Phân tích AI cấp VN-Index (panel cột trái): trạng thái, lịch sử, VN-Index sau T+h theo trạng thái / vùng Impulse.
    index,
    // Market Intelligence (dấu chân tay to, ngày phân phối, HMM, phân kỳ, Bayes T+h, mô hình walk-forward) — null khi job chưa chạy.
    intel: intel?.value ? { ...intel.value, modelFeatures: MODEL_FEATURES } : null,
    baseline: perf?.baseline ?? {},
    performance: perf?.rows ?? [],
    counts: perf ? { signals: perf.signals, outcomes: perf.outcomes } : null,
    models: HORIZONS.map((h) => {
      const row = active.find((r) => r.model === `ADAPTIVE_T${h}`);
      return { horizon: h, active: describeModel(row) };
    }),
    lastTraining: model?.value ?? null,
    signalLabels: SIGNAL_LABELS,
    featureLabels: FEATURE_LABELS,
    disclaimer: "Thống kê quá khứ, kiểm định ngoài mẫu; không phải khuyến nghị đầu tư.",
  };
}

export async function getResearchSymbol(store, rawSymbol) {
  const symbol = canonicalSymbol(rawSymbol);
  if (!isValidSymbol(symbol)) throw new ValidationError("Mã chứng khoán không hợp lệ.");
  const [flowRows, profileRows, active, perf] = await Promise.all([
    store.selectRows(T.flow, { eq: { symbol }, order: "trading_date.desc", limit: 30 }),
    store.selectRows(T.profile, { eq: { symbol }, select: "trading_date,poc,va_low,va_high,vwap", order: "trading_date.desc", limit: 1 }),
    activeModelRows(store),
    store.getKv(RESEARCH_KV.performance),
  ]);
  const latest = flowRows.map(flowFromRow).find((f) => f.features) ?? null;
  const regime = latest?.features?.regime ?? null;
  const adaptive = latest ? HORIZONS.map((h) => {
    const row = active.find((r) => r.model === `ADAPTIVE_T${h}`);
    if (!row) return { horizon: h, ready: false };
    const e = explain(row.weights, featureVector(latest.features), regime);
    return {
      horizon: h, ready: true, version: row.version, ...e,
      contributions: e.contributions.map((c) => ({ ...c, label: FEATURE_LABELS[c.name] ?? c.name })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
      holdout: row.metrics?.holdout ? { brierSkill: row.metrics.holdout.brierSkill, auc: row.metrics.holdout.auc, activeHitRate: row.metrics.holdout.activeHitRate, n: row.metrics.holdout.n } : null,
    };
  }) : [];

  // Tín hiệu đang bật của mã + lịch sử chấm điểm gần đây của chính mã đó.
  const since = flowRows.at(-1)?.trading_date ?? null;
  const ledger = await store.selectRows(T.ledger, { eq: { symbol }, ...(since ? { gte: { signal_date: since } } : {}), order: "signal_date.desc" });
  const outcomes = await store.selectRows(T.outcomes, { eq: { symbol }, ...(since ? { gte: { signal_date: since } } : {}) });
  const outByKey = new Map();
  for (const o of outcomes) {
    const k = `${o.signal_date}|${o.signal}`;
    if (!outByKey.has(k)) outByKey.set(k, {});
    outByKey.get(k)[o.horizon] = { excess: o.excess_ret === null ? null : Number(o.excess_ret), hit: o.hit };
  }
  const perfRows = perf?.value?.rows ?? [];
  const trackRecord = (signal) => perfRows.filter((r) => r.signal === signal && (r.regime === "ALL" || r.regime === regime));
  const signals = ledger.map((l) => ({
    date: l.signal_date, signal: l.signal, label: SIGNAL_LABELS[l.signal] ?? l.signal,
    direction: Number(l.direction), score: l.score === null ? null : Number(l.score), regime: l.regime,
    outcomes: outByKey.get(`${l.signal_date}|${l.signal}`) ?? {},
  }));
  const todaySignals = latest ? signals.filter((s) => s.date === latest.date) : [];

  return {
    symbol,
    asOf: latest?.date ?? null,
    regime,
    method: latest?.method ?? null,
    features: latest ? FEATURE_NAMES.map((name) => ({ name, label: FEATURE_LABELS[name], value: latest.features[name] ?? null })) : [],
    profile: profileRows[0] ? { date: profileRows[0].trading_date, poc: Number(profileRows[0].poc), vaLow: Number(profileRows[0].va_low), vaHigh: Number(profileRows[0].va_high), vwap: Number(profileRows[0].vwap) } : null,
    adaptive,
    todaySignals: todaySignals.map((s) => ({ ...s, trackRecord: trackRecord(s.signal) })),
    recentSignals: signals.slice(0, 30),
    disclaimer: "Xác suất học từ dữ liệu quá khứ (kiểm định walk-forward); không phải khuyến nghị đầu tư.",
  };
}
