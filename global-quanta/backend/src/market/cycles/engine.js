// Cycle Fingerprint v2 (CF2) — tìm giai đoạn tương tự & dự báo lợi suất vượt VN-Index.
//
// Truy vấn tại ngày t (điểm cuối cửa sổ hiện tại của mã) chỉ thấy tiền tố thư viện có fwdEndCal < cal(t).
//   1. Lọc thô: khoảng cách Euclid trên PAA (z-log 30 phiên -> 10 đoạn), giữ M ứng viên (+ M_s ứng viên cùng ngành ICB).
//   2. Khoảng cách chi tiết: DTW dải Sakoe-Chiba ±10% trên z-log (hình dạng) ⊕ khoảng cách bối cảnh đã chuẩn hoá (λ):
//        d = sqrt(d_shape² + λ·d_ctx²), cùng ngành ICB cấp 2: d × (1 − β).
//   3. Chọn K láng giềng tăng dần theo d, ràng buộc: cùng mã cách nhau ≥ GAP phiên (diễn biến sau không chồng lấn),
//      tối đa CAP láng giềng / tháng lịch (tránh cùng một đợt thị trường).
//   4. Trọng số kernel tuyệt đối w = exp(−½(d/h)²), h = hMult × phân vị 5% của d giữa các cặp NGẪU NHIÊN (hiệu chỉnh trong mẫu).
//   5. Số mẫu hiệu dụng n_eff = min(Kish, Kish theo cụm tháng). Dự báo = μ0 + n_eff/(n_eff+k0)·(TB có trọng số − μ0),
//      μ0 = TB vô điều kiện của tiền tố (theo thời điểm). P(vượt) co tương tự về p0.
//   6. Khoảng dự báo conformal (split, Mondrian theo nhóm biến động) — phần dư hiệu chỉnh trong mẫu (CF3), áp ở ngoài.
// Độ tương đồng hiển thị = phân vị TUYỆT ĐỐI: "giống hơn x% các cặp cửa sổ ngẫu nhiên" (không còn min-max).
import { dtwBand, rng } from "./core.js";
import { HORIZONS } from "./library.js";

export const ENGINE_DEFAULTS = Object.freeze({
  K: 30, poolM: 400, poolSector: 100, band: 0.1, gap: 60, monthCap: 3, sectorBeta: 0.1, k0: 10,
});

/** Chọn chỉ số của m giá trị nhỏ nhất trong dist[0..L) (quickselect trên mảng chỉ số). */
function smallestM(dist, L, m, filter) {
  const idx = [];
  for (let i = 0; i < L; i++) if (!filter || filter(i)) idx.push(i);
  if (idx.length <= m) return idx;
  let lo = 0, hi = idx.length - 1;
  const k = m;
  while (lo < hi) {
    const pivot = dist[idx[(lo + hi) >> 1]];
    let i = lo, j = hi;
    while (i <= j) {
      while (dist[idx[i]] < pivot) i++;
      while (dist[idx[j]] > pivot) j--;
      if (i <= j) { const t = idx[i]; idx[i] = idx[j]; idx[j] = t; i++; j--; }
    }
    if (k <= j) hi = j; else if (k >= i) lo = i; else break;
  }
  return idx.slice(0, m);
}

/**
 * Bước 1–2: tập ứng viên cho truy vấn q = { z, paa, ctx, sid } trên tiền tố L.
 * Trả { idx, dShape, dCtx, sameSector } (mảng song song). `ctxSd` = độ lệch chuẩn từng đặc trưng (hiệu chỉnh trong mẫu).
 */
export function candidatePool(lib, q, L, { ctxSd, opts = ENGINE_DEFAULTS, scratch } = {}) {
  const { M, W, C } = lib;
  const pd = scratch?.pd && scratch.pd.length >= L ? scratch.pd : new Float64Array(Math.max(L, 1));
  for (let i = 0; i < L; i++) {
    let s = 0; const o = i * M;
    for (let k = 0; k < M; k++) { const d = lib.paa[o + k] - q.paa[k]; s += d * d; }
    pd[i] = s;
  }
  const chosen = new Set(smallestM(pd, L, opts.poolM));
  if (q.sid >= 0 && opts.poolSector > 0) for (const i of smallestM(pd, L, opts.poolSector, (i) => lib.sid[i] === q.sid)) chosen.add(i);
  const r = Math.max(1, Math.ceil(opts.band * W));
  const buf = { prev: new Float64Array(W + 1), cur: new Float64Array(W + 1) };
  const zb = new Float64Array(W);
  const idx = [...chosen], dShape = new Float64Array(idx.length), dCtx = new Float64Array(idx.length), same = new Uint8Array(idx.length);
  idx.forEach((i, k) => {
    for (let t = 0; t < W; t++) zb[t] = lib.z[i * W + t];
    dShape[k] = dtwBand(q.z, zb, r, Infinity, buf);
    let s = 0; for (let c = 0; c < C; c++) { const d = (lib.ctx[i * C + c] - q.ctx[c]) / (ctxSd?.[c] || 1); s += d * d; }
    dCtx[k] = Math.sqrt(s / C);
    same[k] = q.sid >= 0 && lib.sid[i] === q.sid ? 1 : 0;
  });
  return { idx, dShape, dCtx, same };
}

/** Bước 3 — chọn K láng giềng thoả ràng buộc chồng lấn / cụm tháng, theo thứ tự `order` (chỉ số vào pool). */
function selectConstrained(lib, poolIdx, order, opts) {
  const byTicker = new Map(), byMonth = new Map(), out = [];
  for (const k of order) {
    if (out.length >= opts.K) break;
    const i = poolIdx[k], t = lib.tid[i], m = lib.month[i], c = lib.endCal[i];
    if ((byMonth.get(m) ?? 0) >= opts.monthCap) continue;
    const prev = byTicker.get(t);
    if (prev && prev.some((x) => Math.abs(x - c) < opts.gap)) continue;
    out.push(k);
    byMonth.set(m, (byMonth.get(m) ?? 0) + 1);
    if (prev) prev.push(c); else byTicker.set(t, [c]);
  }
  return out;
}

/** n_eff = min(Kish theo trọng số, Kish theo tổng trọng số từng cụm tháng). */
export function effectiveN(ws, months) {
  let s = 0, s2 = 0; const cl = new Map();
  ws.forEach((w, k) => { s += w; s2 += w * w; cl.set(months[k], (cl.get(months[k]) ?? 0) + w); });
  if (!(s > 0)) return 0;
  let c2 = 0; for (const v of cl.values()) c2 += v * v;
  return Math.min((s * s) / s2, (s * s) / c2);
}

/** Bước 4–5 — từ láng giềng đã chọn (chỉ số thư viện + trọng số) tới dự báo co về tiền tố. */
export function aggregate(lib, L, nIdx, ws, k0) {
  const H = lib.H;
  const months = nIdx.map((i) => lib.month[i]);
  const nEff = effectiveN(ws, months);
  const shrink = nEff / (nEff + k0);
  const tot = ws.reduce((a, b) => a + b, 0) || 1;
  const pred = [], pUp = [], raw = [], mu0 = [], p0 = [];
  for (let h = 0; h < H; h++) {
    let m = 0, u = 0;
    nIdx.forEach((i, k) => { const y = lib.y[i * H + h]; m += ws[k] * y; u += ws[k] * (y > 0 ? 1 : 0); });
    m /= tot; u /= tot;
    const mu = L > 0 ? lib.ySum[L * H + h] / L : 0, pu = L > 0 ? lib.yUp[L * H + h] / L : 0.5;
    raw.push(m); mu0.push(mu); p0.push(pu);
    pred.push(mu + shrink * (m - mu)); pUp.push(pu + shrink * (u - pu));
  }
  return { pred, pUp, raw, mu0, p0, nEff, shrink };
}

/**
 * Dự báo đầy đủ từ pool với tham số đã chốt { lambda, hMult } và hiệu chỉnh { nullQ05[λ] }.
 * Trả láng giềng (chỉ số thư viện, d, w) + dự báo theo HORIZONS.
 */
export function forecastFromPool(lib, L, pool, { lambda, hMult, h0, opts = ENGINE_DEFAULTS }) {
  const n = pool.idx.length;
  const d = new Float64Array(n);
  for (let k = 0; k < n; k++) d[k] = Math.sqrt(pool.dShape[k] ** 2 + lambda * pool.dCtx[k] ** 2) * (pool.same[k] ? 1 - opts.sectorBeta : 1);
  const order = Array.from({ length: n }, (_, k) => k).sort((a, b) => d[a] - d[b]);
  const sel = selectConstrained(lib, pool.idx, order, opts);
  const h = Math.max(hMult * h0, 1e-6);
  const nIdx = sel.map((k) => pool.idx[k]), dist = sel.map((k) => d[k]);
  const ws = dist.map((x) => Math.max(Math.exp(-0.5 * (x / h) ** 2), 1e-12));
  return { neighbors: nIdx, dist, ws, ...aggregate(lib, L, nIdx, ws, opts.k0) };
}

/** Placebo B1 — K phần tử NGẪU NHIÊN của tiền tố thoả cùng ràng buộc, mang đúng bộ trọng số của engine (hoán vị). */
export function placeboForecast(lib, L, ws, seed, opts = ENGINE_DEFAULTS) {
  const rand = rng(seed);
  const order = [];
  const seen = new Set();
  for (let tries = 0; order.length < opts.K * 6 && tries < opts.K * 50 && L > 0; tries++) { const i = Math.floor(rand() * L); if (!seen.has(i)) { seen.add(i); order.push(i); } }
  const sel = selectConstrained(lib, order, order.map((_, k) => k), opts).map((k) => order[k]);
  const perm = [...ws];
  for (let i = perm.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  perm.length = Math.min(perm.length, sel.length);
  while (perm.length < sel.length) perm.push(1);
  return aggregate(lib, L, sel, perm, opts.k0);
}

/** Độ tương đồng tuyệt đối: tỷ lệ cặp ngẫu nhiên có d LỚN hơn (null đã sắp tăng dần). */
export function absoluteSimilarity(d, nullSorted) {
  const n = nullSorted.length;
  if (!n) return null;
  if (d <= nullSorted[0]) return 1;
  if (d >= nullSorted[n - 1]) return 0;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (nullSorted[m] <= d) lo = m; else hi = m; }
  // nội suy tuyến tính giữa hai phân vị kề nhau (bảng phân vị đều 0..1)
  const span = nullSorted[hi] - nullSorted[lo];
  const frac = span > 0 ? (d - nullSorted[lo]) / span : 0;
  return 1 - (lo + frac) / (n - 1);
}

export { HORIZONS };
