// Lớp tín hiệu dòng tiền cho ELITE COMMAND RADAR (một lần gọi cho cả ★ danh mục):
//   Stealth 20 (tín hiệu duy nhất đã qua kiểm định có lợi thế) · ý đồ dòng tiền IFE (HMM) · xác suất mô hình thích ứng
//   (CHỈ khi có mô hình đạt kiểm định). Kèm "bằng chứng" của từng tín hiệu từ vòng phản hồi (z cụm, tỷ lệ đúng vs nền)
//   để giao diện hiển thị đúng mức tin cậy, không thổi phồng tín hiệu chưa có lợi thế.

import { canonicalSymbol, isValidSymbol } from "../normalizer.js";
import { ValidationError } from "../errors.js";
import { RESEARCH_KV, T } from "../research/researchJobs.js";
import { HORIZONS, SIGNAL_LABELS, STEALTH_Z } from "../research/feedback.js";
import { featureVector } from "../research/features.js";
import { explain } from "../research/tuner.js";
import { INTENT_STATES } from "../scanner/ife.js";

export const MAX_SIGNAL_TICKERS = 80;
/** Tín hiệu còn "nóng" trong bao nhiêu phiên gần nhất có dữ liệu. */
export const FRESH_SESSIONS = 3;
const LOOKBACK_DAYS = 20;
const INTENT_LABEL = Object.fromEntries(INTENT_STATES.map((s) => [s.id, s.label]));

export function parseSignalTickers(value) {
  const list = [...new Set(String(value ?? "").split(",").map((s) => canonicalSymbol(s.trim())).filter(Boolean))];
  if (!list.length) throw new ValidationError("Cần tham số tickers.");
  if (list.length > MAX_SIGNAL_TICKERS) throw new ValidationError(`Tối đa ${MAX_SIGNAL_TICKERS} mã.`);
  const bad = list.filter((t) => !isValidSymbol(t));
  if (bad.length) throw new ValidationError(`Mã không hợp lệ: ${bad.slice(0, 5).join(", ")}`);
  return list;
}

const num = (v) => (v === null || v === undefined ? null : Number(v));

/** Bằng chứng của một tín hiệu: dòng hiệu suất ALL (và theo trạng thái hiện tại) tốt nhất theo z cụm. */
export function signalEvidence(rows, signal, regime) {
  const pick = (reg) => rows.filter((r) => r.signal === signal && r.regime === reg)
    .sort((a, b) => (b.zHitClustered ?? -9) - (a.zHitClustered ?? -9))[0] ?? null;
  const all = pick("ALL");
  const inRegime = regime ? pick(regime) : null;
  const brief = (r) => r && ({ horizon: r.horizon, n: r.n, hitRate: r.hitRate, baseline: r.baseline, zClustered: r.zHitClustered, verdict: r.verdict });
  return { signal, label: SIGNAL_LABELS[signal] ?? signal, verdict: all?.verdict ?? "insufficient", all: brief(all), regime: brief(inRegime) };
}

export async function getRadarSignals(store, tickers, now = new Date()) {
  const from = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const [flowRows, ledgerRows, active, perf] = await Promise.all([
    store.selectRows(T.flow, { in: { symbol: tickers }, gte: { trading_date: from }, select: "symbol,trading_date,features", order: "trading_date.desc" }),
    store.selectRows(T.ledger, { in: { symbol: tickers }, gte: { signal_date: from }, select: "symbol,signal_date,signal,direction,score,features", order: "signal_date.desc" }),
    store.selectRows(T.weights, { eq: { status: "active" } }),
    store.getKv(RESEARCH_KV.performance),
  ]);
  const perfRows = perf?.value?.rows ?? [];
  const regime = perf?.value?.currentRegime?.regime ?? null;

  // Các phiên có dữ liệu (toàn danh mục) — "nóng" = trong FRESH_SESSIONS phiên gần nhất.
  const sessions = [...new Set(flowRows.map((r) => String(r.trading_date).slice(0, 10)))].sort().reverse();
  const freshFrom = sessions[Math.min(FRESH_SESSIONS, sessions.length) - 1] ?? null;
  const latestFlow = new Map();
  for (const r of flowRows) if (r.features && !latestFlow.has(r.symbol)) latestFlow.set(r.symbol, r);
  const ledgerBy = new Map();
  for (const l of ledgerRows) {
    if (!ledgerBy.has(l.symbol)) ledgerBy.set(l.symbol, []);
    ledgerBy.get(l.symbol).push(l);
  }
  const models = HORIZONS.map((h) => ({ horizon: h, row: active.find((r) => r.model === `ADAPTIVE_T${h}`) ?? null }));

  const items = {};
  for (const t of tickers) {
    const flow = latestFlow.get(t);
    if (!flow) { items[t] = null; continue; }
    const asOf = String(flow.trading_date).slice(0, 10);
    const f = flow.features;
    const led = ledgerBy.get(t) ?? [];
    const fresh = (l) => freshFrom && String(l.signal_date).slice(0, 10) >= freshFrom;
    const st = led.find((l) => l.signal === "STEALTH_20" && fresh(l)) ?? null;
    const it = led.find((l) => l.signal === "IFE_INTENT" && fresh(l)) ?? null;
    const intentState = it?.features?.state ?? null;
    items[t] = {
      asOf,
      stealth20: {
        z: num(f.stealth20),
        on: Boolean(st),
        direction: st ? Number(st.direction) : 0,
        score: st ? num(st.score) : null,
        date: st ? String(st.signal_date).slice(0, 10) : null,
      },
      intent: it ? { state: intentState, label: INTENT_LABEL[intentState] ?? intentState, p: num(it.score), direction: Number(it.direction), date: String(it.signal_date).slice(0, 10) } : null,
      netIntent: num(f.netIntent),
      adaptive: models.filter((m) => m.row).map((m) => ({ horizon: m.horizon, prob: Math.round(explain(m.row.weights, featureVector(f), regime).prob * 1000) / 1000 })),
    };
  }

  return {
    asOf: sessions[0] ?? null,
    freshFrom,
    regime,
    stealthThreshold: STEALTH_Z,
    evidence: {
      STEALTH_20: signalEvidence(perfRows, "STEALTH_20", regime),
      IFE_INTENT: signalEvidence(perfRows, "IFE_INTENT", regime),
    },
    adaptiveModels: models.map((m) => ({ horizon: m.horizon, active: Boolean(m.row), version: m.row?.version ?? null })),
    items,
    disclaimer: "Thống kê quá khứ (vòng phản hồi T+3/5/10, sai số cụm); không phải khuyến nghị đầu tư.",
  };
}
