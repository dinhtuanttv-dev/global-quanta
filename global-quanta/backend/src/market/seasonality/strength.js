// MV1 — "mùa vụ có thật không": kiểm định hoán vị nhãn tháng TRONG TỪNG NĂM (giữ cấu trúc năm: biến động chung của một năm không bị
// gán nhầm thành hiệu ứng tháng) + BH-FDR toàn universe. Hàm thuần, ngẫu nhiên có seed (cùng mã -> cùng p-value mọi lần chạy).
import { SEAS } from "./config.js";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32 bit — seed tất định theo chuỗi (VD "FPT|SEAS-v1"). */
export function seedOf(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** S = Σ_m n_m (TB_m − TB chung)² / N: phương sai GIỮA các tháng của excess (rows = năm, mỗi hàng 12 ô, null = thiếu). */
export function betweenMonthVariance(rows) {
  const sum = new Array(12).fill(0), cnt = new Array(12).fill(0);
  let total = 0, N = 0;
  for (const r of rows) for (let m = 0; m < 12; m++) { const v = r[m]; if (v == null) continue; sum[m] += v; cnt[m]++; total += v; N++; }
  if (!N) return 0;
  const g = total / N;
  let s = 0;
  for (let m = 0; m < 12; m++) if (cnt[m]) s += cnt[m] * (sum[m] / cnt[m] - g) ** 2;
  return s / N;
}

/**
 * p-value hoán vị một phía (S lớn = mùa vụ mạnh): p = (1 + #{S_b ≥ S}) / (1 + B).
 * Không đủ dữ liệu (< 24 quan sát hoặc < 6 tháng có dữ liệu) -> p = null.
 */
export function seasonalStrength(rows, { permutations = SEAS.permutations, seed = 1 } = {}) {
  const N = rows.reduce((a, r) => a + r.filter((v) => v != null).length, 0);
  const months = new Set();
  rows.forEach((r) => r.forEach((v, m) => { if (v != null) months.add(m); }));
  const S = betweenMonthVariance(rows);
  if (N < 24 || months.size < 6) return { S, p: null, n: N };
  const rng = mulberry32(seed);
  const slots = rows.map((r) => r.map((v, m) => (v == null ? -1 : m)).filter((m) => m >= 0));
  const work = rows.map((r) => [...r]);
  let ge = 0;
  for (let b = 0; b < permutations; b++) {
    for (let y = 0; y < rows.length; y++) {
      const idx = slots[y], vals = idx.map((m) => rows[y][m]);
      for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
      idx.forEach((m, k) => { work[y][m] = vals[k]; });
    }
    if (betweenMonthVariance(work) >= S - 1e-15) ge++;
  }
  return { S, p: (1 + ge) / (1 + permutations), n: N };
}

/** Benjamini–Hochberg: q-value cho từng p (null giữ nguyên null, không tính vào m). */
export function benjaminiHochberg(ps) {
  const idx = ps.map((p, i) => [p, i]).filter(([p]) => p != null && Number.isFinite(p)).sort((a, b) => a[0] - b[0]);
  const m = idx.length;
  const q = new Array(ps.length).fill(null);
  let run = 1;
  for (let k = m - 1; k >= 0; k--) {
    run = Math.min(run, (idx[k][0] * m) / (k + 1));
    q[idx[k][1]] = run;
  }
  return q;
}

/** Nhãn độ mạnh mùa vụ (hiển thị). */
export function strengthLabel(q) {
  if (q == null) return "INSUFFICIENT";
  if (q <= SEAS.fdrQ) return "CLEAR";
  if (q <= 0.2) return "WEAK";
  return "NOISE";
}
