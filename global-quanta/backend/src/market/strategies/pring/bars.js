// Mô hình 1–3 thanh (Pring ch13–16) — CHỈ dùng làm xác nhận / cảnh báo tại điểm phá vỡ (ch17), không thành danh sách riêng.
// Mọi mô hình phải có xu hướng sắc trước đó (≥ trendBars thanh). Hướng: "bull" (đảo chiều lên / ủng hộ tăng), "bear".

import { PRING } from "./config.js";
import { atrOf } from "./core.js";

const B = PRING.bars;
const rng = (S, i) => S.H[i] - S.L[i];
const pos = (S, i, x) => (rng(S, i) > 0 ? (x - S.L[i]) / rng(S, i) : 0.5); // vị trí trong thanh: 0 = thấp, 1 = cao
// ATR tại i; chưa đủ 14 thanh -> biên độ TB của tối đa 10 thanh TRƯỚC (không dùng chính thanh i)
const atr = (S, i) => { const a = atrOf(S)[i]; if (Number.isFinite(a)) return a; let s = 0, n = 0; for (let k = Math.max(0, i - 10); k < i; k++) { s += rng(S, k); n++; } return n ? s / n : rng(S, i); };
/** Xu hướng ngắn trước thanh i: +1 lên / −1 xuống / 0 (so đóng cửa i−1 với i−1−n, cần ≥ 1 ATR). */
function trendBefore(S, i, n = B.trendBars) {
  if (i - 1 - n < 0) return 0;
  const d = S.C[i - 1] - S.C[i - 1 - n];
  return Math.abs(d) >= atr(S, i - 1) ? Math.sign(d) : 0;
}

export const BAR_LABEL = Object.freeze({
  OUTSIDE: "Outside bar", INSIDE: "Inside bar", KEY_REVERSAL: "Đảo chiều chủ chốt", EXHAUSTION: "Thanh cạn kiệt",
  PINOCCHIO: "Pinocchio bar", TWO_BAR: "Đảo chiều 2 thanh", THREE_BAR: "Đảo chiều 3 thanh",
});

/** Các mô hình thanh kết thúc tại i. `level` (tuỳ chọn) = mức hỗ trợ/kháng cự cho Pinocchio. */
export function barPatternsAt(S, i, level = null) {
  const out = [];
  if (i < 3) return out;
  const tr = trendBefore(S, i), a = atr(S, i), O = S.O, H = S.H, L = S.L, C = S.C;
  // Outside bar (ch13): bao trùm thanh trước, sau xu hướng; đóng ở cực ngược xu hướng = đảo chiều.
  if (tr !== 0 && H[i] > H[i - 1] && L[i] < L[i - 1]) {
    const p = pos(S, i, C[i]);
    if (tr > 0 && p <= 0.35) out.push({ kind: "OUTSIDE", dir: "bear", i });
    if (tr < 0 && p >= 0.65) out.push({ kind: "OUTSIDE", dir: "bull", i });
  }
  // Inside bar (ch14): nằm trong thanh trước rộng — cân bằng sau một nhịp mạnh (báo tạm dừng / đảo chiều ngược xu hướng).
  if (tr !== 0 && H[i] < H[i - 1] && L[i] > L[i - 1] && rng(S, i - 1) >= B.wide * a) out.push({ kind: "INSIDE", dir: tr > 0 ? "bear" : "bull", i });
  // Đảo chiều chủ chốt (ch15): mở gap theo xu hướng, thanh rộng, đóng quanh đóng cửa trước (ngược lại).
  if (tr > 0 && O[i] > H[i - 1] && rng(S, i) >= B.wide * a && C[i] <= C[i - 1]) out.push({ kind: "KEY_REVERSAL", dir: "bear", i });
  if (tr < 0 && O[i] < L[i - 1] && rng(S, i) >= B.wide * a && C[i] >= C[i - 1]) out.push({ kind: "KEY_REVERSAL", dir: "bull", i });
  // Thanh cạn kiệt (ch15): rất rộng, mở gap, mở ở một đầu, đóng ở đầu kia.
  if (rng(S, i) >= B.exhaust * a) {
    if (tr > 0 && O[i] > H[i - 1] && pos(S, i, O[i]) >= 0.7 && pos(S, i, C[i]) <= 0.3) out.push({ kind: "EXHAUSTION", dir: "bear", i });
    if (tr < 0 && O[i] < L[i - 1] && pos(S, i, O[i]) <= 0.3 && pos(S, i, C[i]) >= 0.7) out.push({ kind: "EXHAUSTION", dir: "bull", i });
  }
  // Pinocchio (ch15): "mũi" xuyên mức kháng cự/hỗ trợ nhưng mở và đóng đều phía bên trong; mũi dài ≥ 2/3 thanh.
  const top = Math.max(O[i], C[i]), bot = Math.min(O[i], C[i]);
  if (rng(S, i) > 0) {
    const upNose = (H[i] - top) / rng(S, i), dnNose = (bot - L[i]) / rng(S, i);
    if (upNose >= 2 / 3 && (level == null || (H[i] > level && top < level))) out.push({ kind: "PINOCCHIO", dir: "bear", i });
    if (dnNose >= 2 / 3 && (level == null || (L[i] < level && bot > level))) out.push({ kind: "PINOCCHIO", dir: "bull", i });
  }
  // Đảo chiều 2 thanh (ch16): hai thanh rộng gần cùng mức cao (đỉnh) / thấp (đáy), thanh 1 theo xu hướng, thanh 2 ngược lại.
  const t2 = trendBefore(S, i - 1);
  if (t2 !== 0 && rng(S, i - 1) >= B.wide * a && rng(S, i) >= B.wide * a) {
    if (t2 > 0 && Math.abs(H[i] - H[i - 1]) <= 0.25 * a && pos(S, i - 1, C[i - 1]) >= 0.7 && pos(S, i, C[i]) <= 0.3) out.push({ kind: "TWO_BAR", dir: "bear", i });
    if (t2 < 0 && Math.abs(L[i] - L[i - 1]) <= 0.25 * a && pos(S, i - 1, C[i - 1]) <= 0.3 && pos(S, i, C[i]) >= 0.7) out.push({ kind: "TWO_BAR", dir: "bull", i });
  }
  // Đảo chiều 3 thanh (ch16): hai thanh rộng ngược màu kẹp một thanh hẹp/Pinocchio ở cực trị.
  const t3 = trendBefore(S, i - 2);
  if (t3 !== 0 && rng(S, i - 2) >= B.wide * a && rng(S, i) >= B.wide * a && rng(S, i - 1) < rng(S, i - 2)) {
    if (t3 > 0 && pos(S, i - 2, C[i - 2]) >= 0.7 && pos(S, i, C[i]) <= 0.3 && H[i - 1] >= Math.max(H[i - 2], H[i]) - 0.25 * a) out.push({ kind: "THREE_BAR", dir: "bear", i });
    if (t3 < 0 && pos(S, i - 2, C[i - 2]) <= 0.3 && pos(S, i, C[i]) >= 0.7 && L[i - 1] <= Math.min(L[i - 2], L[i]) + 0.25 * a) out.push({ kind: "THREE_BAR", dir: "bull", i });
  }
  return out.map((x) => ({ ...x, date: S.date[i], label: BAR_LABEL[x.kind] }));
}

/**
 * Đánh giá quanh điểm phá vỡ bo (ch17): mô hình thanh NGƯỢC hướng phá vỡ trong [bo−1, bo+2] (≤ t) = cảnh báo (cạn kiệt /
 * Pinocchio tại phá vỡ dễ thành "lưỡi cưa"); mô hình CÙNG hướng trong [bo−3, bo] = xác nhận (đà đủ để phá vỡ hợp lệ).
 */
export function breakoutBarContext(S, bo, t, dir, level) {
  const warn = [], confirm = [];
  for (let i = Math.max(3, bo - 3); i <= Math.min(t, bo + 2); i++) {
    for (const p of barPatternsAt(S, i, level)) {
      if (p.dir !== dir && i >= bo - 1) warn.push(p);
      else if (p.dir === dir && i <= bo) confirm.push(p);
    }
  }
  return { warn, confirm };
}
