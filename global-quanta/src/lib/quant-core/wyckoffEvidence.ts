// @gq/quant-core · Bằng chứng VSA cho Wyckoff (W1) — dùng chung cho v2 và v3.
// Nguồn: "VSA theo Wyckoff" (Mr Vị, cập nhật 15/10/2018) — Spring #1/#2/#3 (tr.45–46), UT (tr.112–113), Creek · JAC · BUEC
// (tr.47–49), ICE (tr.118, 148), tái tích luỹ vs phân phối (tr.85–102), xác nhận bằng nến kế tiếp sau SOS/SOW (Phần D, tr.160–169).
// Tài liệu định tính và có chỗ mâu thuẫn (tr.19 / tr.52 với tr.45–46); ở đây theo tr.45–46 (khớp Pruden/Evans):
//   #1 KL rất lớn / thủng sâu -> KHÔNG mua, chờ Test · #2 KL trung bình -> cần Test KL thấp · #3 thủng nông, KL thấp -> mua được.
// Mọi bằng chứng NHÂN QUẢ: `knownIndex` = nến mà khi đóng cửa mới biết được. Ngưỡng là giá trị khởi điểm, CHƯA hiệu chỉnh cho VN;
// các bằng chứng chỉ để HIỂN THỊ, không đổi pha / điểm cho tới khi qua kiểm định đặt trước (xem WYCKOFF_EVIDENCE_POLICY).
import { atrSeries, type Bar } from "./math";

export const WYCKOFF_EVIDENCE = {
  avgWindow: 20,
  /** Spring/UT: KL ≥ x × TB20 hoặc thủng ≥ y ATR -> #1 (cao trào cung / cầu quá lớn). */
  climaxVol: 2, deepATR: 1.2,
  /** Spring #3: KL < x × TB20 và thủng ≤ y ATR. */
  quietVol: 1, shallowATR: 0.5,
  /** Test của Spring: nhịp lùi về trong N nến sau xác nhận (≥ 2 nến sau), đáy không thủng đáy Spring, về gần vùng Spring, KL < TB20 và < x × KL Spring. */
  testBars: 10, testVolVsSpring: 0.7, testNearATR: 1,
  /** Đỉnh/đáy dao động: fractal k nến mỗi bên (xác nhận sau k nến). */
  pivotK: 3,
  /** JAC: nến vượt Creek với biên độ ≥ x × TB20 biên độ và KL ≥ y × TB20. */
  jacSpread: 1.2, jacVol: 1.5,
  /** BUEC: trong N nến sau JAC, lùi về ≤ Creek + x ATR, KL < TB20, đóng cửa vẫn ≥ Creek − x ATR. */
  buecBars: 15, buecATR: 0.5,
} as const;

/** Chính sách: bằng chứng chưa qua kiểm định chỉ hiển thị. Đổi thành true từng mục khi kiểm định đặt trước đạt. */
export const WYCKOFF_EVIDENCE_POLICY = { springTypeAffectsPhase: false, jacAffectsPhase: false, confirmationAffectsPhase: false, leanAffectsPhase: false } as const;

/** Kết quả kiểm định đặt trước (2026-10-08, 225 mã, khung D, 10/2024–10/2026, ngoài mẫu từ 03/2026, vượt trội 20 phiên). */
export const WYCKOFF_EVIDENCE_NOTE =
  "Chỉ hiển thị, chưa tính vào pha. Kiểm định 225 mã (10/2024–10/2026): chưa bằng chứng nào đạt tiêu chí đặt trước; " +
  "'đặc điểm range' trong mẫu còn cho kết quả NGƯỢC sách (nghiêng tích luỹ kém hơn nghiêng phân phối). Ngưỡng là giá trị khởi điểm, chưa hiệu chỉnh cho VN.";

export interface EvidenceRange { start: number; end: number; high: number; low: number }
export interface EvPoint { index: number; date: string; price: number }

export type SpringKind = 1 | 2 | 3;
export interface SpringEvidence {
  side: "spring" | "ut";
  kind: SpringKind;
  index: number; date: string; price: number;
  /** Nến đóng cửa trở lại trong range — lúc biết được loại #1/#2/#3. */
  confirmedIndex: number;
  volRatio: number; depthATR: number;
  /** Nến kiểm định (Test) — chỉ cần với #1/#2; null = chưa có. */
  test: EvPoint | null;
  /** Spring #3, hoặc #1/#2 đã có Test -> có thể hành động; còn lại: chờ. */
  actionable: boolean;
  knownIndex: number;
  note: string;
}

export type Verdict = "confirmed" | "rejected" | "unclear" | "pending";
export interface ConfirmationEvidence {
  event: string; dir: 1 | -1; index: number; date: string;
  verdict: Verdict;
  /** Nến dùng để xác nhận (nến kế tiếp); null khi chưa có. */
  at: { index: number; date: string } | null;
  reason: string;
}

/** Đường Creek/ICE để vẽ: tối đa 4 đỉnh/đáy gần nhất trước cú phá (hoặc cuối range), kéo ngang tới nến phá nếu có. */
export interface LineEvidence { points: EvPoint[] }
const LINE_POINTS = 4;
export interface BreakEvidence extends EvPoint {
  kind: "JAC" | "creek-weak" | "ICE-break" | "ice-weak";
  /** Mức Creek/ICE bị phá. */
  level: number;
  volRatio: number; spreadRatio: number;
  /** BUEC (sau JAC) / hồi về ICE (sau phá ICE) với KL thấp. */
  backup: EvPoint | null;
  failed: EvPoint | null;
  knownIndex: number;
  note: string;
}

export interface LeanFeature { key: string; label: string; value: string; vote: 1 | 0 | -1 }
export interface LeanEvidence { score: number; label: "tích luỹ" | "phân phối" | "chưa rõ"; features: LeanFeature[] }

export interface WyckoffEvidence {
  springs: SpringEvidence[];
  confirmations: ConfirmationEvidence[];
  creek: LineEvidence | null;
  ice: LineEvidence | null;
  breaks: BreakEvidence[];
  lean: LeanEvidence | null;
  note: string;
}

const avgBefore = (xs: number[], i: number, w: number) => {
  let s = 0, c = 0;
  for (let j = Math.max(0, i - w); j < i; j++) { s += xs[j]; c++; }
  return c ? s / c : 0;
};

/** Spring/UT theo tài liệu. `k` = nến thủng biên, `ci` = nến đóng cửa trở lại trong range. */
export function classifySpringBar(bars: Bar[], k: number, ci: number, level: number, side: "spring" | "ut", atr?: number[], forcedKind?: SpringKind): SpringEvidence {
  const E = WYCKOFF_EVIDENCE;
  const A = atr ?? atrSeries(bars, 14);
  const vols = bars.map((b) => b.volume);
  const av = avgBefore(vols, k, E.avgWindow) || 1;
  const a = A[k] || 1;
  const extreme = side === "spring" ? bars[k].low : bars[k].high;
  const depthATR = Math.abs(level - extreme) / a;
  const volRatio = bars[k].volume / av;
  const kind: SpringKind = forcedKind ?? (volRatio >= E.climaxVol || depthATR >= E.deepATR ? 1 : volRatio < E.quietVol && depthATR <= E.shallowATR ? 3 : 2);
  let test: EvPoint | null = null;
  if (kind !== 3) {
    for (let j = ci + 1; j <= Math.min(bars.length - 1, ci + E.testBars); j++) {
      const b = bars[j];
      const broke = side === "spring" ? b.close < extreme : b.close > extreme;
      if (broke) break;
      // Test = nhịp LÙI VỀ sau khi đã hồi: cách nến xác nhận ≥ 2 nến và đáy (đỉnh với UT) thấp hơn (cao hơn) nến trước.
      const retracing = j >= ci + 2 && (side === "spring" ? b.low < bars[j - 1].low : b.high > bars[j - 1].high);
      if (!retracing) continue;
      const near = side === "spring" ? b.low <= level + E.testNearATR * (A[j] || a) : b.high >= level - E.testNearATR * (A[j] || a);
      const holds = side === "spring" ? b.low >= extreme : b.high <= extreme;
      if (near && holds && b.volume < avgBefore(vols, j, E.avgWindow) && b.volume < E.testVolVsSpring * bars[k].volume) {
        test = { index: j, date: b.date, price: side === "spring" ? b.low : b.high };
        break;
      }
    }
  }
  const name = side === "spring" ? "Spring" : "UT";
  const actionable = kind === 3 || test != null;
  const note = kind === 1
    ? `${name} #1: KL ${volRatio.toFixed(1)}× TB20, ${side === "spring" ? "thủng" : "vượt"} ${depthATR.toFixed(1)} ATR — ${side === "spring" ? "cung" : "cầu"} còn lớn, KHÔNG ${side === "spring" ? "mua" : "bán"} ngay; ${test ? `đã có Test ${test.date}` : "chờ Test KL thấp"}.`
    : kind === 2
      ? `${name} #2: KL ${volRatio.toFixed(1)}× TB20 — cần Test KL thấp${test ? `: đã có ${test.date}` : " (chưa có)"}.`
      : `${name} #3: ${side === "spring" ? "thủng" : "vượt"} nông ${depthATR.toFixed(1)} ATR, KL ${volRatio.toFixed(1)}× TB20 — ${side === "spring" ? "cung đã cạn" : "cầu đã cạn"}.`;
  return { side, kind, index: k, date: bars[k].date, price: extreme, confirmedIndex: ci, volRatio, depthATR, test, actionable, knownIndex: test ? test.index : ci, note };
}

/**
 * Xác nhận bằng nến kế tiếp (Phần D): sau nến tăng mạnh (SOS) — nến sau đóng cửa nửa trên / không có cung (biên hẹp, KL thấp,
 * không giảm sâu) = xác nhận; nến giảm biên rộng KL lớn đóng dưới giữa nến SOS, hoặc KL lớn mà biên hẹp đóng thấp (nỗ lực không
 * kết quả) = không xác nhận. Đối xứng cho SOW.
 */
export function nextBarConfirmation(bars: Bar[], k: number, dir: 1 | -1, event: string): ConfirmationEvidence {
  const E = WYCKOFF_EVIDENCE;
  const base = { event, dir, index: k, date: bars[k].date };
  const j = k + 1;
  if (j >= bars.length) return { ...base, verdict: "pending", at: null, reason: "Chưa có nến kế tiếp." };
  const b = bars[j], p = bars[k];
  const spreads = bars.map((x) => x.high - x.low);
  const vols = bars.map((x) => x.volume);
  const avS = avgBefore(spreads, j, E.avgWindow) || 1;
  const avV = avgBefore(vols, j, E.avgWindow) || 1;
  const spread = b.high - b.low;
  const pos = spread > 0 ? (b.close - b.low) / spread : 0.5; // 0 = đóng ở đáy, 1 = đỉnh
  const wide = spread >= 1.2 * avS, narrow = spread <= 0.8 * avS;
  const hiVol = b.volume >= 1.2 * avV, loVol = b.volume < avV;
  const midK = (p.high + p.low) / 2;
  const at = { index: j, date: b.date };
  const up = dir === 1;
  const fav = up ? pos : 1 - pos; // vị trí đóng cửa theo hướng tín hiệu
  const followed = up ? b.close >= p.close : b.close <= p.close;
  const against = up ? b.close < midK : b.close > midK;
  if (wide && hiVol && against && fav < 0.4) return { ...base, verdict: "rejected", at, reason: up ? "Nến sau giảm biên rộng, KL lớn, đóng dưới giữa nến SOS — cung xuất hiện." : "Nến sau tăng biên rộng, KL lớn, đóng trên giữa nến SOW — cầu xuất hiện." };
  if (hiVol && narrow && fav < 0.5) return { ...base, verdict: "rejected", at, reason: "KL lớn nhưng biên hẹp, đóng cửa ngược hướng — nỗ lực không có kết quả." };
  if (followed && fav >= 0.5) return { ...base, verdict: "confirmed", at, reason: up ? "Nến sau tăng tiếp, đóng cửa nửa trên." : "Nến sau giảm tiếp, đóng cửa nửa dưới." };
  if (narrow && loVol && !against) return { ...base, verdict: "confirmed", at, reason: up ? "Nến sau biên hẹp, KL thấp, giữ trên giữa nến SOS — không có cung (No Supply)." : "Nến sau biên hẹp, KL thấp, giữ dưới giữa nến SOW — không có cầu (No Demand)." };
  return { ...base, verdict: "unclear", at, reason: "Nến sau không rõ ràng — chờ thêm." };
}

/** Đỉnh (side=high) / đáy (side=low) dao động fractal k nến; ci = p + k. */
export function pivots(bars: Bar[], from: number, to: number, side: "high" | "low", k: number = WYCKOFF_EVIDENCE.pivotK) {
  const out: { index: number; ci: number; price: number }[] = [];
  for (let p = Math.max(from, k); p <= Math.min(to, bars.length - 1 - k); p++) {
    const v = side === "high" ? bars[p].high : bars[p].low;
    let ok = true;
    for (let d = 1; d <= k && ok; d++) {
      const l = side === "high" ? bars[p - d].high : bars[p - d].low;
      const r = side === "high" ? bars[p + d].high : bars[p + d].low;
      ok = side === "high" ? v >= l && v > r : v <= l && v < r;
    }
    if (ok) out.push({ index: p, ci: p + k, price: v });
  }
  return out;
}

/**
 * Mức Creek/ICE dùng để xét phá vỡ tại nến x: chỉ các đỉnh/đáy đã XÁC NHẬN trước x; phá vỡ chỉ xét ở phần kéo dài bên phải
 * (sau điểm cuối) = mức cao nhất (Creek) / thấp nhất (ICE) của 2 điểm gần nhất — "vượt các đỉnh hồi", không phải cắt nội suy.
 */
function levelAt(pts: { index: number; ci: number; price: number }[], x: number, dir: 1 | -1): number | null {
  const known = pts.filter((p) => p.ci < x);
  if (known.length < 2 || x <= known[known.length - 1].index) return null;
  const a = known[known.length - 2].price, b = known[known.length - 1].price;
  return dir === 1 ? Math.max(a, b) : Math.min(a, b);
}

/** Số nến tối đa sau cuối range vẫn coi cú phá là của cấu trúc này. */
const BREAK_HORIZON = 40;

function lineBreak(bars: Bar[], range: EvidenceRange, pts: { index: number; ci: number; price: number }[], dir: 1 | -1, atr: number[]): BreakEvidence | null {
  const E = WYCKOFF_EVIDENCE;
  const spreads = bars.map((x) => x.high - x.low);
  const vols = bars.map((x) => x.volume);
  const n = bars.length;
  const mid = (range.high + range.low) / 2;
  let weak: BreakEvidence | null = null;
  for (let x = range.start + 2 * E.pivotK + 1; x < Math.min(n, range.end + BREAK_HORIZON + 1); x++) {
    const L = levelAt(pts, x, dir);
    if (L == null) continue;
    const crossed = dir === 1 ? bars[x].close > L && bars[x - 1].close <= L : bars[x].close < L && bars[x - 1].close >= L;
    if (!crossed) continue;
    const volRatio = bars[x].volume / (avgBefore(vols, x, E.avgWindow) || 1);
    const spreadRatio = spreads[x] / (avgBefore(spreads, x, E.avgWindow) || 1);
    const strong = volRatio >= E.jacVol && spreadRatio >= E.jacSpread;
    if (!strong) {
      if (!weak) weak = { kind: dir === 1 ? "creek-weak" : "ice-weak", level: L, index: x, date: bars[x].date, price: bars[x].close, volRatio, spreadRatio, backup: null, failed: null, knownIndex: x,
        note: `${dir === 1 ? "Vượt Creek" : "Thủng ICE"} nhưng thiếu biên độ/KL (${spreadRatio.toFixed(1)}× / ${volRatio.toFixed(1)}× TB20) — theo tài liệu KHÔNG phải ${dir === 1 ? "JAC" : "SOW"}.` };
      continue;
    }
    let backup: EvPoint | null = null, failed: EvPoint | null = null;
    for (let j = x + 1; j <= Math.min(n - 1, x + E.buecBars); j++) {
      const b = bars[j], a = atr[j] || 1;
      if (dir === 1 ? b.close < mid : b.close > mid) { failed = { index: j, date: b.date, price: b.close }; break; }
      const touch = dir === 1 ? b.low <= L + E.buecATR * a && b.close >= L - E.buecATR * a : b.high >= L - E.buecATR * a && b.close <= L + E.buecATR * a;
      if (touch && b.volume < (avgBefore(vols, j, E.avgWindow) || Infinity)) { backup = { index: j, date: b.date, price: dir === 1 ? b.low : b.high }; break; }
    }
    const note = `${dir === 1 ? "JAC — vượt Creek" : "Phá ICE"} (${Math.round(L).toLocaleString("vi-VN")}) với biên độ ${spreadRatio.toFixed(1)}× và KL ${volRatio.toFixed(1)}× TB20`
      + (backup ? `; ${dir === 1 ? "BUEC" : "hồi về ICE"} KL thấp ${backup.date}` : "")
      + (failed ? `; thất bại — đóng cửa ${dir === 1 ? "dưới" : "trên"} giữa range ${failed.date}` : "") + ".";
    return { kind: dir === 1 ? "JAC" : "ICE-break", level: L, index: x, date: bars[x].date, price: bars[x].close, volRatio, spreadRatio, backup, failed, knownIndex: x, note };
  }
  return weak;
}

/** Tái tích luỹ vs phân phối (tr.85–102): 4 đặc trưng, mỗi cái bỏ phiếu +1 (tích luỹ) / −1 (phân phối) / 0. */
export function rangeLean(bars: Bar[], range: EvidenceRange): LeanEvidence | null {
  const len = range.end - range.start + 1;
  if (len < 20) return null;
  const seg = bars.slice(range.start, range.end + 1);
  const half = Math.floor(len / 2);
  const f: LeanFeature[] = [];
  // 1. Đáy thấp nhất nằm ở 1/2 đầu (tích luỹ) hay đỉnh cao nhất nằm ở 1/2 đầu rồi đỉnh thấp dần (phân phối).
  let li = 0, hi = 0;
  seg.forEach((b, i) => { if (b.low < seg[li].low) li = i; if (b.high > seg[hi].high) hi = i; });
  const lp = li / (len - 1), hp = hi / (len - 1);
  f.push({ key: "extremes", label: "Vị trí đáy / đỉnh thấp nhất – cao nhất trong range", value: `đáy ở ${Math.round(lp * 100)}%, đỉnh ở ${Math.round(hp * 100)}% thời gian`,
    vote: lp <= 0.5 && hp > 0.5 ? 1 : hp <= 0.5 && lp > 0.5 ? -1 : 0 });
  // 2. Đáy dao động nửa sau nâng dần / đỉnh hạ dần.
  const lows = pivots(bars, range.start + half, range.end, "low", 2).filter((p) => p.ci <= range.end);
  const highs = pivots(bars, range.start + half, range.end, "high", 2).filter((p) => p.ci <= range.end);
  const slope = (ps: { price: number }[]) => (ps.length >= 2 ? Math.sign(ps[ps.length - 1].price - ps[0].price) : 0);
  const sl = slope(lows), sh = slope(highs);
  f.push({ key: "swings", label: "Đáy / đỉnh dao động ở nửa sau", value: `đáy ${sl > 0 ? "nâng dần" : sl < 0 ? "hạ dần" : "—"}, đỉnh ${sh > 0 ? "nâng dần" : sh < 0 ? "hạ dần" : "—"}`,
    vote: sl > 0 && sh >= 0 ? 1 : sh < 0 && sl <= 0 ? -1 : 0 });
  // 3. KL nến giảm / nến tăng ở nửa sau: cung cạn (< 0,85) hay cung tăng (> 1,15).
  let dv = 0, uv = 0, dn = 0, un = 0;
  for (const b of seg.slice(half)) { if (b.close < b.open) { dv += b.volume; dn++; } else if (b.close > b.open) { uv += b.volume; un++; } }
  const ratio = dn && un && uv > 0 ? dv / dn / (uv / un) : null;
  f.push({ key: "supply", label: "KL TB nến giảm ÷ nến tăng ở nửa sau", value: ratio == null ? "—" : `${ratio.toFixed(2)}×`,
    vote: ratio == null ? 0 : ratio < 0.85 ? 1 : ratio > 1.15 ? -1 : 0 });
  // 4. Biến động thu hẹp (tích luỹ) hay lỏng dần (phân phối).
  const avgSpread = (xs: Bar[]) => xs.reduce((s, b) => s + (b.high - b.low), 0) / Math.max(1, xs.length);
  const vr = avgSpread(seg.slice(half)) / (avgSpread(seg.slice(0, half)) || 1);
  f.push({ key: "volatility", label: "Biên độ TB nửa sau ÷ nửa đầu", value: `${vr.toFixed(2)}×`, vote: vr < 0.85 ? 1 : vr > 1.15 ? -1 : 0 });
  const score = f.reduce((s, x) => s + x.vote, 0);
  return { score, label: score >= 2 ? "tích luỹ" : score <= -2 ? "phân phối" : "chưa rõ", features: f };
}

const V3_KIND: Record<string, SpringKind> = { SPRING_3: 3, UT_3: 3, SPRING_2: 2, UT_2: 2, SHAKEOUT: 1, UTAD: 1 };

export interface EvidenceEventInput { event: string; index: number; confirmedIndex?: number | null; label?: string }

/** Gom bằng chứng cho một cấu trúc (range + sự kiện đã phát hiện bởi engine v2/v3). */
export function wyckoffEvidence(bars: Bar[], range: EvidenceRange, events: EvidenceEventInput[]): WyckoffEvidence {
  const atr = atrSeries(bars, 14);
  const springs: SpringEvidence[] = [];
  const confirmations: ConfirmationEvidence[] = [];
  for (const e of events) {
    if ((e.event === "Spring" || e.event === "UT" || e.event === "UTAD") && e.confirmedIndex != null) {
      // v3 đã tự phân loại (SPRING_3 / SPRING_2 / SHAKEOUT, UT_3 / UT_2 / UTAD) -> giữ nhãn của engine để thẻ không mâu thuẫn.
      const forced = e.label ? V3_KIND[e.label] : undefined;
      springs.push(classifySpringBar(bars, e.index, e.confirmedIndex, e.event === "Spring" ? range.low : range.high, e.event === "Spring" ? "spring" : "ut", atr, forced));
    }
    if (e.event === "SOS" || e.event === "SOW") {
      // v3 ghi SOS ở đỉnh nhịp; nến xác nhận = nến kế tiếp của nến sự kiện (hoặc của nến xác nhận nếu muộn hơn).
      const k = Math.max(e.index, e.confirmedIndex ?? e.index);
      confirmations.push(nextBarConfirmation(bars, k, e.event === "SOS" ? 1 : -1, e.event));
    }
  }
  const mid = (range.high + range.low) / 2;
  const hp = pivots(bars, range.start, range.end, "high").filter((p) => p.price >= mid);
  const lp = pivots(bars, range.start, range.end, "low").filter((p) => p.price <= mid);
  const breaks: BreakEvidence[] = [];
  const up = hp.length >= 2 ? lineBreak(bars, range, hp, 1, atr) : null;
  const dn = lp.length >= 2 ? lineBreak(bars, range, lp, -1, atr) : null;
  const toLine = (ps: typeof hp, br: BreakEvidence | null): LineEvidence | null => {
    const used = (br ? ps.filter((p) => p.ci < br.index) : ps).slice(-LINE_POINTS);
    if (used.length < 2) return null;
    const points = used.map((p) => ({ index: p.index, date: bars[p.index].date, price: p.price }));
    if (br) points.push({ index: br.index, date: br.date, price: br.level });
    return { points };
  };
  if (up) breaks.push(up);
  if (dn) breaks.push(dn);
  breaks.sort((a, b) => a.index - b.index);
  return {
    springs, confirmations, creek: toLine(hp, up), ice: toLine(lp, dn), breaks, lean: rangeLean(bars, range),
    note: WYCKOFF_EVIDENCE_NOTE,
  };
}
