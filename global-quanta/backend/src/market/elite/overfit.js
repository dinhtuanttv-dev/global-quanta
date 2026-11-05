// E7-v3 (2026-11-06) — thống kê hiệu chỉnh quá khớp, đúng E7-prereg.md (sửa đổi E7-v3). Hàm thuần.
//   deflatedSharpe  Bailey & López de Prado (2014), "The Deflated Sharpe Ratio"
//   pboCscv         Bailey, Borwein, López de Prado & Zhu (2017), "The Probability of Backtest Overfitting" (CSCV)
import { normInv } from "./decisionCore.js";
import { normCdf } from "./icCore.js";

export const EULER_GAMMA = 0.5772156649015329;

/** Mô men của chuỗi: trung bình, độ lệch chuẩn (mẫu), độ lệch γ₃, độ nhọn γ₄ (KHÔNG trừ 3). */
export function moments(x) {
  const n = x.length, m = x.reduce((a, b) => a + b, 0) / n;
  let m2 = 0, m3 = 0, m4 = 0;
  for (const v of x) { const d = v - m; m2 += d * d; m3 += d ** 3; m4 += d ** 4; }
  m2 /= n; m3 /= n; m4 /= n;
  const sd = Math.sqrt((m2 * n) / (n - 1));
  return { n, mean: m, sd, skew: m2 > 0 ? m3 / m2 ** 1.5 : 0, kurt: m2 > 0 ? m4 / (m2 * m2) : 3 };
}
export const sharpe = (x) => { const s = moments(x); return s.sd > 0 ? s.mean / s.sd : 0; };

/** SR₀ = √V·[(1 − γ)Φ⁻¹(1 − 1/N) + γΦ⁻¹(1 − 1/(N·e))]: Sharpe tối đa kỳ vọng của N phép thử khi không có kỹ năng. */
export function expectedMaxSharpe(N, variance) {
  if (!(N > 1) || !(variance > 0)) return 0;
  return Math.sqrt(variance) * ((1 - EULER_GAMMA) * normInv(1 - 1 / N) + EULER_GAMMA * normInv(1 - 1 / (N * Math.E)));
}

/**
 * DSR của một chuỗi lợi suất (Sharpe theo kỳ, không quy năm).
 * @param {number[]} rets  chuỗi lợi suất (VD lợi suất vượt ngày)
 * @param {number[]} trialSharpes  SR̂ của tất cả cấu hình đã thử (để ước V); N mặc định = số cấu hình
 */
export function deflatedSharpe(rets, trialSharpes, N = trialSharpes.length) {
  const mo = moments(rets);
  const sr = mo.sd > 0 ? mo.mean / mo.sd : 0;
  const mt = trialSharpes.reduce((a, b) => a + b, 0) / trialSharpes.length;
  const V = trialSharpes.reduce((a, b) => a + (b - mt) ** 2, 0) / Math.max(1, trialSharpes.length - 1);
  const sr0 = expectedMaxSharpe(N, V);
  const denom = Math.sqrt(Math.max(1e-12, 1 - mo.skew * sr + ((mo.kurt - 1) / 4) * sr * sr));
  return { sr, sr0, N, V, T: mo.n, skew: mo.skew, kurt: mo.kurt, dsr: normCdf(((sr - sr0) * Math.sqrt(mo.n - 1)) / denom) };
}

/** Mọi tổ hợp k phần tử của [0..n−1] (thứ tự từ điển). */
export function combinations(n, k) {
  const out = [], cur = [];
  const rec = (start) => { if (cur.length === k) { out.push([...cur]); return; } for (let i = start; i < n; i++) { cur.push(i); rec(i + 1); cur.pop(); } };
  rec(0);
  return out;
}

/**
 * PBO bằng CSCV. matrix[c][t] = lợi suất của cấu hình c tại kỳ t (cùng độ dài T). S khối liên tiếp (bỏ phần dư cuối chuỗi).
 * Với mỗi tổ hợp S/2 khối trong mẫu: cấu hình có SR trong mẫu cao nhất -> hạng tương đối ω ngoài mẫu (1 = tốt nhất), λ = logit(ω).
 */
export function pboCscv(matrix, S = 10) {
  const C = matrix.length, T = matrix[0].length, L = Math.floor(T / S);
  const blocks = Array.from({ length: S }, (_, b) => [b * L, (b + 1) * L]);
  const combos = combinations(S, S / 2);
  const lambdas = [];
  let degradation = 0;
  for (const ins of combos) {
    const inSet = new Set(ins);
    const slice = (c, take) => { const out = []; blocks.forEach(([a, z], b) => { if (inSet.has(b) === take) for (let t = a; t < z; t++) out.push(matrix[c][t]); }); return out; };
    const srIn = matrix.map((_, c) => sharpe(slice(c, true)));
    const srOut = matrix.map((_, c) => sharpe(slice(c, false)));
    let best = 0; for (let c = 1; c < C; c++) if (srIn[c] > srIn[best]) best = c;
    const below = srOut.filter((v, c) => c !== best && v < srOut[best]).length;
    const ties = srOut.filter((v, c) => c !== best && v === srOut[best]).length;
    const omega = (below + 0.5 * ties + 1) / (C + 1); // hạng tương đối trong (0, 1)
    lambdas.push(Math.log(omega / (1 - omega)));
    degradation += srOut[best] - srIn[best];
  }
  return { pbo: lambdas.filter((l) => l <= 0).length / lambdas.length, splits: combos.length, blockLength: L, meanLogit: lambdas.reduce((a, b) => a + b, 0) / lambdas.length, meanOosMinusIs: degradation / combos.length };
}
