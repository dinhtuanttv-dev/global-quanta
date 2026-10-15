// Top 20 v2 — M2: LambdaMART (cây tăng cường dạng xếp hạng, Burges 2010) viết thuần JS, không phụ thuộc ngoài.
//   Mỗi "truy vấn" = một ngày; tài liệu = các mã; nhãn = bậc ngũ phân vị của lợi suất vượt trội 20 phiên trong ngày (0..4).
//   Gradient lambda tối ưu NDCG@k; cây hồi quy độ sâu D, chia nhánh theo histogram (bins theo phân vị), lá = Newton (ΣG/(ΣH+reg)).
// Hàm thuần, tất định (không lấy mẫu ngẫu nhiên).

export const GB_DEFAULTS = Object.freeze({ trees: 100, depth: 3, lr: 0.1, minLeaf: 50, bins: 32, reg: 1, k: 20, sigma: 1 });

/** Ranh giới bins theo phân vị cho từng đặc trưng. X: mảng hàng Float64Array(F). */
function makeBins(X, F, nb) {
  const edges = [];
  for (let f = 0; f < F; f++) {
    const v = X.map((x) => x[f]).sort((a, b) => a - b);
    const e = [];
    for (let b = 1; b < nb; b++) { const q = v[Math.floor((b / nb) * (v.length - 1))]; if (!e.length || q > e[e.length - 1]) e.push(q); }
    edges.push(e);
  }
  return edges;
}
const binOf = (x, e) => { let lo = 0, hi = e.length; while (lo < hi) { const m = (lo + hi) >> 1; if (x > e[m]) lo = m + 1; else hi = m; } return lo; };

/** Gradient lambda & hessian cho một truy vấn (chỉ số tài liệu `ids`). */
function lambdas(ids, labels, scores, G, Hs, { k, sigma }) {
  const n = ids.length;
  const order = [...ids].sort((a, b) => scores[b] - scores[a]);
  const rank = new Map(order.map((d, i) => [d, i]));
  const gain = (l) => 2 ** l - 1, disc = (r) => (r < k ? 1 / Math.log2(r + 2) : 0);
  const ideal = [...ids].map((d) => labels[d]).sort((a, b) => b - a);
  let idcg = 0; for (let i = 0; i < Math.min(k, n); i++) idcg += gain(ideal[i]) * disc(i);
  if (idcg <= 0) return;
  for (let a = 0; a < n; a++) {
    const i = ids[a];
    for (let b = 0; b < n; b++) {
      const j = ids[b];
      if (labels[i] <= labels[j]) continue;
      const ri = rank.get(i), rj = rank.get(j);
      const dNdcg = Math.abs((gain(labels[i]) - gain(labels[j])) * (disc(ri) - disc(rj))) / idcg;
      if (dNdcg === 0) continue;
      const rho = 1 / (1 + Math.exp(sigma * (scores[i] - scores[j])));
      const lam = sigma * rho * dNdcg, h = sigma * sigma * rho * (1 - rho) * dNdcg;
      G[i] += lam; G[j] -= lam; Hs[i] += h; Hs[j] += h;
    }
  }
}

/** Dựng một cây (độ sâu D) trên gradient G/H; trả cấu trúc { f, t, left, right } | { leaf }. */
function buildTree(Xb, G, Hs, rowsIdx, depth, opts, edges) {
  let sg = 0, sh = 0; for (const i of rowsIdx) { sg += G[i]; sh += Hs[i]; }
  const leaf = { leaf: sg / (sh + opts.reg) };
  if (depth === 0 || rowsIdx.length < 2 * opts.minLeaf) return leaf;
  const F = Xb[0].length;
  let best = null;
  const base = (sg * sg) / (sh + opts.reg);
  for (let f = 0; f < F; f++) {
    const nb = edges[f].length + 1;
    const gB = new Float64Array(nb), hB = new Float64Array(nb), cB = new Int32Array(nb);
    for (const i of rowsIdx) { const b = Xb[i][f]; gB[b] += G[i]; hB[b] += Hs[i]; cB[b]++; }
    let gl = 0, hl = 0, cl = 0;
    for (let b = 0; b < nb - 1; b++) {
      gl += gB[b]; hl += hB[b]; cl += cB[b];
      const cr = rowsIdx.length - cl; if (cl < opts.minLeaf || cr < opts.minLeaf) continue;
      const gr = sg - gl, hr = sh - hl;
      const gainV = (gl * gl) / (hl + opts.reg) + (gr * gr) / (hr + opts.reg) - base;
      if (!best || gainV > best.gain) best = { gain: gainV, f, b };
    }
  }
  if (!best || best.gain <= 1e-12) return leaf;
  const L = [], R = [];
  for (const i of rowsIdx) (Xb[i][best.f] <= best.b ? L : R).push(i);
  return { f: best.f, t: best.b < edges[best.f].length ? edges[best.f][best.b] : Infinity, left: buildTree(Xb, G, Hs, L, depth - 1, opts, edges), right: buildTree(Xb, G, Hs, R, depth - 1, opts, edges) };
}

export function predictTree(t, x) { while (t.leaf === undefined) t = x[t.f] <= t.t ? t.left : t.right; return t.leaf; }

/**
 * Huấn luyện. groups: [{ X: Float64Array[] (đặc trưng), labels: number[] }] — mỗi phần tử một ngày.
 * Trả mô hình { trees, lr } dùng predict().
 */
export function trainLambdaMart(groups, opts = GB_DEFAULTS) {
  const X = [], labels = [], qids = [];
  groups.forEach((g, q) => g.X.forEach((x, i) => { X.push(x); labels.push(g.labels[i]); qids.push(q); }));
  const N = X.length; if (!N) return { trees: [], lr: opts.lr };
  const F = X[0].length, edges = makeBins(X, F, opts.bins);
  const Xb = X.map((x) => { const r = new Int32Array(F); for (let f = 0; f < F; f++) r[f] = binOf(x[f], edges[f]); return r; });
  const byQ = new Map(); qids.forEach((q, i) => { if (!byQ.has(q)) byQ.set(q, []); byQ.get(q).push(i); });
  const scores = new Float64Array(N), trees = [];
  const all = Array.from({ length: N }, (_, i) => i);
  for (let t = 0; t < opts.trees; t++) {
    const G = new Float64Array(N), Hs = new Float64Array(N);
    for (const ids of byQ.values()) lambdas(ids, labels, scores, G, Hs, opts);
    const tree = buildTree(Xb, G, Hs, all, opts.depth, opts, edges);
    trees.push(tree);
    for (let i = 0; i < N; i++) scores[i] += opts.lr * predictTree(tree, X[i]);
  }
  return { trees, lr: opts.lr };
}

export function predict(model, x) { let s = 0; for (const t of model.trees) s += model.lr * predictTree(t, x); return s; }

/** NDCG@k của một danh sách (để kiểm thử). */
export function ndcgAt(labels, scores, k = 20) {
  const ord = labels.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const g = (l) => 2 ** l - 1, d = (r) => 1 / Math.log2(r + 2);
  let dcg = 0; for (let i = 0; i < Math.min(k, ord.length); i++) dcg += g(labels[ord[i]]) * d(i);
  const ideal = [...labels].sort((a, b) => b - a);
  let idcg = 0; for (let i = 0; i < Math.min(k, ideal.length); i++) idcg += g(ideal[i]) * d(i);
  return idcg > 0 ? dcg / idcg : 0;
}
