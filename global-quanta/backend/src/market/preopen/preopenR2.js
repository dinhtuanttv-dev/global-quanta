// PO-r2 (PO-r2-prereg.md): nhóm theo độ lệch chuẩn ES, σ̂ MS-GARCH hoặc EWMA, bảng trạng thái rời rạc. Hàm thuần, không nhìn trước.
import { estimate, hamiltonFilter, logReturns } from "../volatility/msGarch.js";
import { classOf, quantile } from "./preopenModel.js";

export const RULE_R2 = "PO-r2";
export const Z_T = 1;
const SMOOTH = 20;
const REFIT = 20, FIT_WINDOW = 500;
const mean = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : null);
const sd = (x) => { if (x.length < 2) return null; const m = mean(x); return Math.sqrt(x.reduce((a, v) => a + (v - m) ** 2, 0) / (x.length - 1)); };
const round = (v, d = 1) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 10 ** d) / 10 ** d);
export const STATES = ["neg", "mid", "pos"];
export const zBucket = (es, s) => (s > 0 ? (es / s <= -Z_T ? "neg" : es / s >= Z_T ? "pos" : "mid") : "mid");

/** σ̂ EWMA 0,94 theo % cho từng phiên i, chỉ dùng lợi suất trước i. */
export function ewmaVol(closes) {
  const out = new Array(closes.length).fill(null);
  let v = null;
  for (let i = 1; i < closes.length; i++) {
    if (v != null) out[i] = Math.sqrt(v);
    const r = Math.log(closes[i] / closes[i - 1]) * 100;
    v = v == null ? r * r : 0.94 * v + 0.06 * r * r;
  }
  return out;
}

/** σ̂ MS-GARCH theo % cho từng phiên i ≥ start: ước lượng lại mỗi 20 phiên trên 500 phiên trước, lọc đến i − 1. Trả thêm phần tử cuối cho phiên kế tiếp. */
export function msVol(closes, start = FIT_WINDOW + 1) {
  const out = new Array(closes.length + 1).fill(null);
  let est = null, since = REFIT;
  for (let i = start; i <= closes.length; i++) {
    const w = closes.slice(Math.max(0, i - FIT_WINDOW - 1), i);
    if (since >= REFIT || !est) { est = estimate(logReturns(w)); since = 0; }
    since++;
    if (!est) continue;
    const f = hamiltonFilter(logReturns(w), est.params), [r1, r2] = est.params.regimes;
    const { p11, p22 } = est.params;
    const q1 = f.prob[0] * p11 + f.prob[1] * (1 - p22), q2 = 1 - q1;
    const h = q1 * (r1.omega + r1.alpha * f.eps2 + r1.beta * f.hAgg) + q2 * (r2.omega + r2.alpha * f.eps2 + r2.beta * f.hAgg);
    out[i] = Math.sqrt(Math.max(0, h));
  }
  return out;
}

/** Gắn biến kỹ thuật và σ̂ vào hàng đã ghép theo ngày. */
export function enrich(rows, bars, { useMs = true, msStart = null } = {}) {
  const closes = bars.map((b) => b.close), idx = new Map(bars.map((b, i) => [String(b.date).slice(0, 10), i]));
  const ew = ewmaVol(closes), ms = useMs ? msVol(closes, msStart ?? Math.min(120, closes.length)) : null;
  return rows.map((r) => {
    const i = idx.get(r.date);
    const p = i - 1;
    const ma = p >= 49 ? mean(closes.slice(p - 49, p + 1)) : null;
    return { ...r, above: ma == null ? null : closes[p] > ma, ew: ew[i], ms: ms ? ms[i] : null };
  }).filter((r) => r.ew > 0);
}

/** y = a + b·es + q·σ̂, q là phân vị phần dư chuẩn hoá của tập huấn luyện. */
export function fitScaled(train, yKey, volKey) {
  const rows = train.filter((r) => r[volKey] > 0);
  if (rows.length < 30) return null;
  const mx = mean(rows.map((r) => r.es)), my = mean(rows.map((r) => r[yKey]));
  let n = 0, d = 0;
  for (const r of rows) { n += (r.es - mx) * (r[yKey] - my); d += (r.es - mx) ** 2; }
  const b = d > 0 ? n / d : 0, a = my - b * mx, z = rows.map((r) => (r[yKey] - a - b * r.es) / r[volKey]);
  const qLo = quantile(z, 0.1), qMid = quantile(z, 0.5), qHi = quantile(z, 0.9);
  return { a, b, predict: (es, vol) => ({ lo: a + b * es + qLo * vol, mid: a + b * es + qMid * vol, hi: a + b * es + qHi * vol }) };
}
export const unconditional = (train, key) => { const v = train.map((r) => r[key]); return { lo: quantile(v, 0.1), mid: quantile(v, 0.5), hi: quantile(v, 0.9) }; };

/** Xác suất từ bảng trạng thái rời rạc, co về tần suất nền khi ô ít mẫu. */
export function stateProbs(train, s) {
  const base = Object.fromEntries(STATES.map((k) => [k, train.filter((r) => classOf(r.cc) === k).length / train.length]));
  const key = (b, above) => `${b}|${above == null ? "na" : above ? "1" : "0"}`;
  const cells = new Map();
  for (const r of train) { const c = key(zBucket(r.es, s), r.above); const m = cells.get(c) ?? { n: 0, neg: 0, mid: 0, pos: 0 }; m.n++; m[classOf(r.cc)]++; cells.set(c, m); }
  return { base, probs(es, above) { const m = cells.get(key(zBucket(es, s), above)) ?? { n: 0, neg: 0, mid: 0, pos: 0 }; return Object.fromEntries(STATES.map((k) => [k, (m[k] + SMOOTH * base[k]) / (m.n + SMOOTH)])); } };
}

const NAMES = { neg: "Tiêu cực", mid: "Trung tính", pos: "Tích cực" };
const POSTURE = { neg: "Thận trọng, chờ xác nhận", mid: "Chọn lọc, giữ kế hoạch", pos: "Ưu tiên giải ngân theo kế hoạch" };
const vi = (v, d = 1) => (v == null ? "—" : v.toLocaleString("vi-VN", { maximumFractionDigits: d }));

/**
 * Dựng 3 kịch bản từ giá đóng cửa phiên trước. `es = null` nghĩa là thiếu dữ liệu: không có kịch bản dẫn đầu.
 * levels dùng làm mốc xác nhận và vô hiệu; evidence quyết định phần nào được hiện.
 */
export function buildScenariosR2({ rows, es, prevClose, levels = {}, volNow, evidence }) {
  const train = rows.slice(-250), s = sd(train.map((r) => r.es));
  const lead = es == null ? null : zBucket(es, s);
  const px = (pct) => round(prevClose * (1 + pct / 100));
  const openFit = fitScaled(train, "gap", "ew"), dayKey = evidence.dayModel === "ms" ? "ms" : "ew";
  const dayFit = evidence.dayModel === "uncond" ? null : fitScaled(train, "cc", dayKey), dayU = unconditional(train, "cc");
  const volOpen = volNow?.ew ?? null, volDay = volNow?.[dayKey] ?? null;
  const state = stateProbs(train, s), above = levels.ma50 != null ? prevClose > levels.ma50 : null;
  const anchors = { neg: -Z_T * s * 1.3, mid: 0, pos: Z_T * s * 1.3 };
  const near = [levels.ma20, levels.ma50, levels.ma200].filter((v) => v != null);
  const below = near.filter((v) => v < prevClose).sort((a, b) => b - a)[0] ?? null, over = near.filter((v) => v > prevClose).sort((a, b) => a - b)[0] ?? null;
  const scenarios = STATES.map((id) => {
    const anchor = id === lead ? es : anchors[id], o = openFit && volOpen ? openFit.predict(anchor, volOpen) : null;
    const dayBand = dayFit && volDay ? dayFit.predict(anchor, volDay) : dayU;
    const day = { lo: px(dayBand.lo), hi: px(dayBand.hi) };
    const openBand = evidence.openBand && o ? { lo: px(o.lo), mid: px(o.mid), hi: px(o.hi) } : null;
    const pv = state.probs(anchor, above)[id];
    const edge = round(Z_T * s, 2);
    return {
      id, name: NAMES[id], esAnchor: round(anchor, 2), open: openBand, day, n: train.filter((r) => zBucket(r.es, s) === id).length, posture: POSTURE[id], probability: evidence.probabilities ? round(pv * 100, 0) : null,
      shadowOpen: o ? { lo: px(o.lo), mid: px(o.mid), hi: px(o.hi) } : null, shadowProbability: round(pv * 100, 0),
      trigger: id === "neg" ? `ES từ lúc VN đóng cửa ≤ −${vi(edge, 2)}% (−1σ)` : id === "pos" ? `ES từ lúc VN đóng cửa ≥ +${vi(edge, 2)}% (+1σ)` : `ES trong ±${vi(edge, 2)}% (±1σ)`,
      confirm: id === "neg" ? `Dưới ${vi(below ?? prevClose)} sau 10:00` : id === "pos" ? `Trên ${vi(over ?? prevClose)} sau 10:00` : `Trong ${vi(below ?? day.lo)}–${vi(over ?? day.hi)} đến 10:00`,
      invalid: id === "neg" ? `Lấy lại ${vi(prevClose)}` : id === "pos" ? `Về dưới ${vi(prevClose)}` : `Ra ngoài ${vi(day.lo)}–${vi(day.hi)}`,
      action: id === "neg" ? (evidence.noPanicSell ? "Lịch sử: giảm từ đầu phiên rồi hồi, không bán đuổi lúc mở." : "Chờ phản ứng sau 10:00. Quy tắc hành động chưa có bằng chứng.")
        : id === "pos" ? (evidence.noChase ? "Lịch sử: mở cao rồi hụt lại, không mua đuổi lúc mở." : "Chờ giữ được đà sau mở cửa. Quy tắc hành động chưa có bằng chứng.") : "Giữ tỷ trọng theo kế hoạch.",
    };
  });
  return { lead, scenarios, esSd: round(s, 2), above, trainDays: train.length, trainFrom: train[0]?.date ?? null, trainTo: train[train.length - 1]?.date ?? null };
}
