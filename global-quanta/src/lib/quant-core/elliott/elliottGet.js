/**
 * elliott-get.js  —  Elliott Wave Technique (GET) · ES module, không phụ thuộc thư viện ngoài
 * Nguồn: "Applying Technical Analysis – Elliott Wave Technique", trang T-5 … T-43.
 *
 * Dữ liệu nến: [{ time, open, high, low, close }]  (time tăng dần; dùng được cho cổ phiếu/futures)
 *
 * [quant-core] Tiếp nhận từ src/lib/ta-command-center/detectors/elliott-get.js (Screener Engine v2 / S4).
 * Thay đổi duy nhất: pivot của zigzag có `ci` = chỉ số nến tại đó pivot được XÁC NHẬN (null nếu chưa) —
 * dùng để lọc không nhìn trước: pivot trên bars[0..t] = pivot toàn chuỗi có ci ≤ t.
 *
 * ĐIỂM NÊN ĐỌC TRƯỚC (giáo trình KHÔNG nêu công thức, mình phải chọn – đều chỉnh được qua options):
 *  1. Elliott Oscillator = SMA5 − SMA35 của giá trung bình (H+L)/2  (nhãn "Osc 5 35" trên hình T-17..T-20).
 *  2. Breakout Bands: sách chỉ nói "UP band / LOW band, đặt 80%". Ở đây: band = 80% × đỉnh (đáy) dao động
 *     trong `lookback` nến TRƯỚC đó.
 *  3. Nhận diện điểm đảo chiều (pivot) bằng ZigZag theo % (hoặc ATR). Sách dùng phần mềm GET tự gán nhãn.
 *  4. "Overlap 10–15% ở futures" được hiểu là % của độ dài sóng 1.
 *  5. Các bảng thống kê (12%, 73%, 45%…) là số liệu của tác giả sách, chỉ để tham khảo.
 */

// ───────────────────────────── Hằng số lấy từ sách ─────────────────────────────
export const FIB = {
  w2: [0.5, 0.62],              // T-33
  w3: [1.62, 2.62, 4.25],       // T-34 (phổ biến nhất 1.62 & 2.62)
  w4: [0.24, 0.38, 0.5],        // T-34 (phổ biến nhất 0.24 & 0.38)
  w5Extended: [1, 1.62, 2.62],  // T-35: Sóng 3 > 1.62×S1 → nhân với độ dài sóng 1
  w5Over: [0.62, 1, 1.62],      // T-35/T-42: Sóng 3 < 1.62×S1 → nhân với độ dài 0→3
  zzB: 0.5, zzBmax: 0.75, zzC: [1, 1.62, 2.62],   // T-27
  irrB: [1.15, 1.25], irrC: [1.62, 2.62],         // T-29
};

export const DEFAULTS = {
  fast: 5, slow: 35,
  zigzag: { pct: 0.03, atrPeriod: 14, atrMult: 0 }, // atrMult>0 thì dùng ATR thay %
  fineFactor: 0.4,                 // ngưỡng zigzag "mịn" để phân loại bên trong sóng 2/4
  bands: { pct: 0.8, lookback: 100 },
  market: 'cash',                  // 'cash' (không cho chồng lấn) | 'futures' (cho 10–15%)
  overlapTolerance: { cash: 0, futures: 0.15 },
  osc: { minPullback: 0.9, maxOpposite: 0.38, bandMargin: 0.1 }, // T-15, T-16, T-20
  strictOsc: false,                // true: vi phạm điều kiện dao động → loại cấu trúc
  requireNewExtreme5: true,        // sóng 5 phải vượt đỉnh/đáy sóng 3
  maxPivotsBack: 60,
  flatTol: 0.05,
};

// ───────────────────────────── Tiện ích ─────────────────────────────
const sma = (a, n) => {
  const out = new Array(a.length).fill(NaN); let s = 0;
  for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) out[i] = s / n; }
  return out;
};
const merge = (a, b) => {
  const o = { ...a };
  for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? merge(a[k] || {}, b[k]) : b[k];
  return o;
};
const nearest = (v, arr) => arr.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), arr[0]);

export function atr(c, n = 14) {
  const out = new Array(c.length).fill(NaN); let sum = 0, prev = NaN;
  for (let i = 0; i < c.length; i++) {
    const tr = i === 0 ? c[i].high - c[i].low
      : Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
    if (i < n) { sum += tr; if (i === n - 1) { prev = sum / n; out[i] = prev; } }
    else { prev = (prev * (n - 1) + tr) / n; out[i] = prev; }
  }
  return out;
}

// ───────────────────────────── 1. Elliott Oscillator & Breakout Bands (T-10…T-20) ─────────────────────────────
export function elliottOscillator(c, fast = 5, slow = 35) {
  const m = c.map(x => (x.high + x.low) / 2);
  const f = sma(m, fast), s = sma(m, slow);
  return m.map((_, i) => (isNaN(s[i]) ? NaN : f[i] - s[i]));
}

export function breakoutBands(osc, { pct = 0.8, lookback = 100 } = {}) {
  const up = [], lo = [];
  for (let i = 0; i < osc.length; i++) {
    let mx = 0, mn = 0;
    for (let j = Math.max(0, i - lookback); j < i; j++) {
      const v = osc[j]; if (isNaN(v)) continue;
      if (v > mx) mx = v; if (v < mn) mn = v;
    }
    up.push(mx * pct); lo.push(mn * pct);
  }
  return { up, lo };
}

// ───────────────────────────── 2. Pivot (ZigZag) ─────────────────────────────
export function zigzag(c, { pct = 0.03, atrPeriod = 14, atrMult = 0 } = {}) {
  const n = c.length; if (n < 3) return [];
  const A = atrMult > 0 ? atr(c, atrPeriod) : null;
  const thr = i => (A && !isNaN(A[i]) ? atrMult * A[i] : pct * c[i].close);
  const mk = (i, type, confirmed = true, ci = null) => ({ i, time: c[i].time, type, price: type === 'H' ? c[i].high : c[i].low, confirmed, ci: confirmed ? ci : null });
  const out = []; let dir = 0, hi = 0, lo = 0, ext = 0;
  for (let i = 1; i < n; i++) {
    if (dir === 0) {
      if (c[i].high > c[hi].high) hi = i;
      if (c[i].low < c[lo].low) lo = i;
      if (c[hi].high - c[lo].low >= thr(i)) {
        if (lo < hi || (lo === hi && c[i].close >= c[i].open)) { out.push(mk(lo, 'L', true, i)); dir = 1; ext = hi; }
        else { out.push(mk(hi, 'H', true, i)); dir = -1; ext = lo; }
      }
    } else if (dir === 1) {
      if (c[i].high >= c[ext].high) ext = i;
      else if (c[ext].high - c[i].low >= thr(i)) { out.push(mk(ext, 'H', true, i)); dir = -1; ext = i; }
    } else {
      if (c[i].low <= c[ext].low) ext = i;
      else if (c[i].high - c[ext].low >= thr(i)) { out.push(mk(ext, 'L', true, i)); dir = 1; ext = i; }
    }
  }
  if (dir !== 0) out.push(mk(ext, dir === 1 ? 'H' : 'L', false));
  return out;
}

// ───────────────────────────── 3. Fibonacci / mục tiêu (T-32…T-43) ─────────────────────────────
// Mọi hàm nhận giá thô; hướng suy ra từ vị trí điểm.
export const wave2Zone = (p0, p1) => {
  const s = p1 > p0 ? 1 : -1, w1 = Math.abs(p1 - p0);
  return FIB.w2.map(r => ({ ratio: r, price: p1 - s * r * w1 }));
};
export const wave3Targets = (p0, p1, p2) => {
  const s = p1 > p0 ? 1 : -1, w1 = Math.abs(p1 - p0);
  return FIB.w3.map(r => ({ ratio: r, price: p2 + s * r * w1 }));
};
export const wave4Zones = (p2, p3) => {
  const s = p3 > p2 ? 1 : -1, w3 = Math.abs(p3 - p2);
  return FIB.w4.map(r => ({ ratio: r, price: p3 - s * r * w3 }));
};
/** T-35, T-42, T-43. Điểm xuất phát = cuối sóng 4. */
export function wave5Targets(p0, p1, p2, p3, p4) {
  const s = p1 > p0 ? 1 : -1, w1 = Math.abs(p1 - p0), w3 = Math.abs(p3 - p2), len03 = Math.abs(p3 - p0);
  const r31 = w3 / w1, extended = r31 > 1.62;
  const lv = (ratios, len) => ratios.map(r => ({ ratio: r, price: p4 + s * r * len }));
  return {
    mode: extended ? 'wave3-extended (theo sóng 1)' : 'wave5-over-extends (theo 0→3)',
    ratio31: r31,
    levels: extended ? lv(FIB.w5Extended, w1) : lv(FIB.w5Over, len03),
    // T-43: kể cả khi sóng 3 kéo dài, sóng 5 thường kết thúc trong cửa sổ 62%–100% của 0→3
    window03: { low: p4 + s * 0.62 * len03, high: p4 + s * 1.0 * len03 },
  };
}

// Thống kê của tác giả (T-37, T-38, T-40)
export function statWave2(r) {                                // T-37: 12% ≤38% · 73% trong 50–60% · 15% >62%
  if (r <= 0.38) return { bucket: '≤38%', pct: 12 };
  if (r < 0.5) return { bucket: '38–50%', pct: null };       // sách không nêu
  if (r <= 0.6) return { bucket: '50–60%', pct: 73 };
  if (r <= 0.62) return { bucket: '60–62%', pct: null };     // sách không nêu
  return { bucket: '>62%', pct: 15 };
}
export function statWave3(r) {
  if (r < 1) return { bucket: '<1×S1', pct: 2 };
  if (r < 1.6) return { bucket: '1–1.6×S1', pct: 15 };
  if (r < 1.75) return { bucket: '1.6–1.75×S1', pct: 45 };
  if (r <= 2.62) return { bucket: '1.75–2.62×S1', pct: 30 };
  return { bucket: '>2.62×S1', pct: 8 };
}
export function statWave4(r) {                                // T-40 (dòng cuối ghi "Under 62%" nhưng tổng 15+60+15+10=100 ⇒ hiểu là >62%)
  if (r < 0.24) return { bucket: '<24%', pct: null };
  if (r < 0.3) return { bucket: '24–30%', pct: 15 };
  if (r <= 0.5) return { bucket: '30–50%', pct: 60 };
  if (r <= 0.62) return { bucket: '50–62%', pct: 15 };
  return { bucket: '>62%', pct: 10 };
}

// ───────────────────────────── 4. Kênh Elliott cho đỉnh sóng 5 (T-36) ─────────────────────────────
export function elliottChannel(p1, p2, p3, p4) {
  // Đường dưới nối đáy sóng 2 và sóng 4; 2 đường trên song song, đi qua đỉnh sóng 1 và sóng 3
  const slope = (p4.price - p2.price) / (p4.i - p2.i);
  return { slope, anchors: { lower: p2, upperW1: p1, upperW3: p3 }, preferred: null };
}
export const channelValue = (ch, name, i) => { const a = ch.anchors[name]; return a.price + ch.slope * (i - a.i); };
export const channelSegments = (ch, endI) =>
  Object.entries(ch.anchors).map(([name, a]) => ({ name, from: { i: a.i, price: a.price }, to: { i: endI, price: channelValue(ch, name, endI) } }));

// ───────────────────────────── 5. Tam giác (T-30) ─────────────────────────────
/** t = 5 pivot a,b,c,d,e xen kẽ. Hội tụ: biên độ co dần + 2 đường biên chụm lại. */
export function detectTriangle(t) {
  if (t.length < 5) return { valid: false };
  const [a, b, c, d, e] = t;
  const L = [b.price - a.price, c.price - b.price, d.price - c.price, e.price - d.price].map(Math.abs);
  const contracting = L[1] < L[0] && L[2] < L[1] && L[3] < L[2];
  const hiSet = a.type === 'H' ? [a, c, e] : [b, d], loSet = a.type === 'H' ? [b, d] : [a, c, e];
  const sl = s => (s[s.length - 1].price - s[0].price) / (s[s.length - 1].i - s[0].i);
  const convergent = sl(hiSet) < sl(loSet);
  return { valid: contracting && convergent, points: t,
    upper: [hiSet[0], hiSet[hiSet.length - 1]], lower: [loSet[0], loSet[loSet.length - 1]] };
}

// ───────────────────────────── 6. Sóng điều chỉnh (T-27…T-30) ─────────────────────────────
/**
 * start = điểm kết thúc sóng xung lực (đầu sóng A); A,B,C = pivot; s = hướng xung lực (+1 lên / −1 xuống).
 * Zig-zag: B ≤ 75% A và C vượt cuối A.  Flat: B về ≈ đầu A (≤100%).  Irregular: B vượt đầu A (>100%).
 */
export function classifyABC(start, A, B, C, s, o = {}) {
  const tol = o.flatTol ?? 0.05;
  const lenA = s * (start.price - A.price);
  if (lenA <= 0) return { kind: 'invalid' };
  const bRatio = s * (B.price - A.price) / lenA;
  const res = { bRatio, lenA };
  if (C) { res.cRatio = s * (B.price - C.price) / lenA; res.cBeyondA = s * C.price < s * A.price; }
  if (bRatio <= FIB.zzBmax) res.kind = (C && !res.cBeyondA) ? 'unconfirmed' : 'zigzag';
  else if (bRatio <= 1 + tol) res.kind = 'flat';
  else res.kind = 'irregular';
  res.family = res.kind === 'zigzag' ? 'simple' : (res.kind === 'flat' || res.kind === 'irregular') ? 'complex' : 'unknown';
  const cRatios = res.kind === 'zigzag' ? FIB.zzC : res.kind === 'irregular' ? FIB.irrC : [1];
  res.bFibNearest = res.kind === 'zigzag' ? FIB.zzB : res.kind === 'irregular' ? nearest(bRatio, FIB.irrB) : 1;
  res.cTargets = cRatios.map(r => ({ ratio: r, price: B.price - s * r * lenA }));
  if (C) res.cFibNearest = nearest(res.cRatio, cRatios);
  return res;
}

/** Phân loại bên trong 1 đoạn (sóng 2 hoặc 4) bằng zigzag mịn. Mang tính heuristic. */
export function classifySegment(c, pa, pb, s, o) {
  const seg = c.slice(pa.i, pb.i + 1);
  if (seg.length < 5) return { family: 'unknown' };
  const zz = o.zigzag;
  const pv = zigzag(seg, { pct: zz.pct * o.fineFactor, atrPeriod: zz.atrPeriod, atrMult: zz.atrMult * o.fineFactor })
    .filter(p => p.i > 0 && p.i < seg.length - 1).map(p => ({ ...p, i: p.i + pa.i }));
  if (pv.length === 2) return { ...classifyABC(pa, pv[0], pv[1], pb, s, o), kindSource: 'fine-zigzag' };
  if (pv.length === 4) {
    const tri = detectTriangle([...pv, pb]);
    if (tri.valid) return { kind: 'triangle', family: 'complex', triangle: tri };
  }
  return pv.length > 2 ? { kind: 'complex-other', family: 'complex' } : { family: 'unknown' };
}

/** Số sóng con trong đoạn [pa, pb] (zigzag mịn): số chặng = số pivot bên trong + 1. Dùng cho cấu trúc sóng A (T-27). */
export function subwaveCount(c, pa, pb, o) {
  const seg = c.slice(pa.i, pb.i + 1);
  if (seg.length < 5) return null;
  const zz = o.zigzag;
  const inner = zigzag(seg, { pct: zz.pct * o.fineFactor, atrPeriod: zz.atrPeriod, atrMult: zz.atrMult * o.fineFactor })
    .filter(p => p.i > 0 && p.i < seg.length - 1 && p.confirmed);
  return inner.length + 1;
}

/**
 * Sóng điều chỉnh sau 5 sóng — đầy đủ theo sách (T-27…T-30):
 *   - classifyABC (zigzag / flat / irregular theo tỷ lệ B);
 *   - cấu trúc sóng A: zigzag ⇒ A có 5 sóng con; flat / irregular ⇒ A có 3 sóng con (T-27). Không khớp ⇒ cờ structureOk=false;
 *   - "phân kỳ góc" ở sóng C: giá C vượt cuối A nhưng dao động yếu hơn ở A (T-27);
 *   - tam giác ở sóng B: 5 pivot a–e sau A hội tụ ⇒ thrust cùng hướng sóng A (T-30).
 * k5 = chỉ số (trong pivots) của đỉnh/đáy sóng 5; s = hướng xung lực (+1 / −1).
 */
export function analyzeCorrection(c, osc, pivots, k5, s, o) {
  const start = pivots[k5], A = pivots[k5 + 1];
  if (!A) return null;
  // Tam giác ở sóng B (T-30): a,b,c,d,e = pivots k5+2 … k5+6, C = k5+7.
  const triPts = pivots.slice(k5 + 2, k5 + 7);
  if (triPts.length === 5 && triPts.every(p => p.confirmed)) {
    const tri = detectTriangle([A, ...triPts.slice(0, 4)]);
    if (tri.valid) {
      const C = pivots[k5 + 7];
      return {
        kind: 'triangle-B', family: 'complex', triangle: tri, lenA: s * (start.price - A.price),
        thrust: { direction: s > 0 ? 'down' : 'up', note: 'Tam giác ở sóng B: thrust cùng hướng sóng A (T-30)' },
        C: C ?? null, aWaves: subwaveCount(c, start, A, o), structureOk: null, cDivergence: null,
      };
    }
  }
  const B = pivots[k5 + 2], C0 = pivots[k5 + 3];
  if (!B) return null;
  const C = C0 && C0.confirmed ? C0 : undefined;
  const res = classifyABC(start, A, B, C, s, o);
  const aWaves = subwaveCount(c, start, A, o);
  res.aWaves = aWaves;
  res.structureOk = aWaves == null || (aWaves !== 3 && aWaves !== 5) ? null
    : res.kind === 'zigzag' ? aWaves === 5 : (res.kind === 'flat' || res.kind === 'irregular') ? aWaves === 3 : null;
  if (C) {
    // Hướng điều chỉnh ngược xung lực: cực trị dao động theo hướng −s.
    const oscA = osExt(osc, -s, start.i, A.i, 'max'), oscC = osExt(osc, -s, B.i, C.i, 'max');
    res.cDivergence = res.cBeyondA && !isNaN(oscA.v) && !isNaN(oscC.v)
      ? { pass: oscC.v < oscA.v, oscA: oscA.v, oscC: oscC.v, note: 'Giá C vượt cuối A nhưng dao động yếu hơn — dấu hiệu kết thúc điều chỉnh (T-27)' }
      : null;
  } else res.cDivergence = null;
  return res;
}

/** Quy tắc luân phiên (T-31). */
export function alternation(f2, f4) {
  if (f2 === 'unknown' || f4 === 'unknown') return { ok: null, note: 'không đủ dữ liệu để phân loại' };
  return { ok: f2 !== f4, expected: f2 === 'simple' ? 'complex' : 'simple' };
}

// ───────────────────────────── 7. Kiểm tra & chấm điểm cấu trúc xung lực ─────────────────────────────
function osExt(osc, s, i0, i1, mode) {
  let b = NaN, bi = -1;
  for (let i = i0; i <= i1; i++) {
    const x = s * osc[i]; if (isNaN(x)) continue;
    if (isNaN(b) || (mode === 'max' ? x > b : x < b)) { b = x; bi = i; }
  }
  return { v: b, i: bi };
}

export function evaluateImpulse(c, osc, bands, pts, o) {
  const s = pts[0].type === 'L' ? 1 : -1;
  const P = pts.map(p => p.price), d = P.map(x => s * x), I = pts.map(p => p.i);
  const full = pts.length === 6, v = [];
  const w1 = d[1] - d[0], w3 = d[3] - d[2], w5 = full ? d[5] - d[4] : null;
  const tol = o.market === 'futures' ? o.overlapTolerance.futures : o.overlapTolerance.cash;

  if (w1 <= 0) v.push('Sóng 1 sai hướng');
  if (d[2] <= d[0]) v.push('Sóng 2 tạo đỉnh/đáy mới (vượt điểm bắt đầu sóng 1)');            // T-6
  if (d[3] <= d[1]) v.push('Sóng 3 không vượt đỉnh/đáy sóng 1');                              // T-6/T-7
  if (d[4] >= d[3] || d[4] <= d[2]) v.push('Sóng 4 không hợp lệ về vị trí');
  if (d[4] < d[1] - tol * w1) v.push('Sóng 4 chồng lấn sóng 1 (quy tắc 2, T-26)');
  if (full) {
    if (w5 <= 0) v.push('Sóng 5 sai hướng');
    if (o.requireNewExtreme5 && d[5] <= d[3]) v.push('Sóng 5 không vượt sóng 3');             // T-8
    if (w3 < w1 && w3 < w5) v.push('Sóng 3 là sóng ngắn nhất (quy tắc 1, T-26)');
  }

  // Điều kiện dao động
  const checks = {};
  const pk3 = osExt(osc, s, I[2], I[3], 'max');
  if (!isNaN(pk3.v) && pk3.v > 0) {
    const b = s > 0 ? bands.up[pk3.i] : -bands.lo[pk3.i];
    checks.wave3Band = { pass: b > 0 && pk3.v > b * (1 + o.osc.bandMargin), osc: pk3.v, band: b };           // T-20
    const pk1 = osExt(osc, s, I[0], I[1], 'max');
    checks.wave3Strongest = { pass: isNaN(pk1.v) || pk3.v > pk1.v, peak1: pk1.v, peak3: pk3.v };          // T-13/T-17: sóng 3 = dao động mạnh nhất
    const tr4 = osExt(osc, s, I[3], I[4], 'min');
    if (!isNaN(tr4.v)) {
      const pullback = (pk3.v - tr4.v) / pk3.v, opposite = tr4.v < 0 ? -tr4.v / pk3.v : 0;
      checks.wave4Osc = { pass: pullback >= o.osc.minPullback && opposite <= o.osc.maxOpposite, pullback, opposite }; // T-15/T-16
    }
    if (full) {
      const pk5 = osExt(osc, s, I[4], I[5], 'max');
      checks.wave5Divergence = { pass: !isNaN(pk5.v) && pk5.v < pk3.v, peak3: pk3.v, peak5: pk5.v };           // T-13/T-19
    }
  } else checks.insufficientOscData = { pass: false };
  if (o.strictOsc) for (const [k, ch] of Object.entries(checks)) if (!ch.pass) v.push(`Dao động không đạt: ${k}`);

  // Tỷ lệ & thống kê
  const ratios = { w2: (d[1] - d[2]) / w1, w3: w3 / w1, w4: (d[3] - d[4]) / w3 };
  const stats = { w2: statWave2(ratios.w2), w3: statWave3(ratios.w3), w4: statWave4(ratios.w4) };
  if (full) { ratios.w5OverW1 = w5 / w1; ratios.w5Over03 = w5 / (d[3] - d[0]); }

  const targets = { wave5: wave5Targets(P[0], P[1], P[2], P[3], P[4]) };
  const channel = elliottChannel(pts[1], pts[2], pts[3], pts[4]);
  channel.preferred = ratios.w3 > 1.62 ? 'upperW1' : 'upperW3';        // T-36
  const afterWave5 = { firstTarget: P[4] };                              // T-19: sóng 4 trước đó là mục tiêu đầu tiên

  let score = Object.values(checks).filter(x => x.pass).length;
  if (ratios.w2 >= 0.5 && ratios.w2 <= 0.62) score++;
  if (ratios.w3 >= 1.6 && ratios.w3 <= 1.75) score++;
  if (ratios.w4 >= 0.3 && ratios.w4 <= 0.5) score++;

  return { dir: s > 0 ? 'up' : 'down', status: full ? 'complete' : 'wave5-forming', points: pts,
    valid: v.length === 0, violations: v, checks, ratios, stats, targets, channel, afterWave5, score };
}

export function findImpulses(c, osc, bands, pv, o, keepInvalid = false) {
  const out = [], st0 = Math.max(0, pv.length - o.maxPivotsBack);
  const push = e => { if (e.valid || keepInvalid) out.push(e); };
  for (let st = st0; st + 5 <= pv.length; st++) {
    const forming = pv.length - st === 5;
    push(evaluateImpulse(c, osc, bands, pv.slice(st, st + (forming ? 5 : 6)), o));
    // Sóng 4 dạng tam giác (a-b-c-d-e) – T-30
    if (st + 9 <= pv.length) {
      const tri = detectTriangle(pv.slice(st + 4, st + 9));
      if (tri.valid) {
        const f2 = pv.length === st + 9;
        const pts = [...pv.slice(st, st + 4), pv[st + 8], ...(f2 ? [] : [pv[st + 9]])];
        const e = evaluateImpulse(c, osc, bands, pts, o);
        e.wave4Type = 'triangle'; e.triangle = tri;
        e.thrust = { direction: e.dir, note: 'Tam giác ở sóng 4: thrust cùng hướng sóng 3' };
        push(e);
      }
    }
  }
  return out;
}

// ───────────────────────────── 8. Tín hiệu theo thời gian thực ─────────────────────────────
function liveSignals(c, osc, bands, pv, o) {
  const out = [], n = c.length;
  if (pv.length < 4) return out;
  const [p0, p1, p2, p3] = pv.slice(-4);
  const s = p0.type === 'L' ? 1 : -1;
  if (!(s * p2.price > s * p0.price && s * p3.price > s * p1.price && s * p2.price < s * p1.price)) return out;
  // Số gap trong sóng 3 (T-7: "gap là dấu hiệu sóng 3 đang diễn ra")
  let gaps = 0;
  for (let i = p2.i + 1; i <= p3.i; i++) if (s > 0 ? c[i].low > c[i - 1].high : c[i].high < c[i - 1].low) gaps++;
  const pk = osExt(osc, s, p2.i, n - 1, 'max');
  const band = s > 0 ? bands.up[pk.i] : -bands.lo[pk.i];
  out.push({ type: 'wave3', dir: s > 0 ? 'up' : 'down', gaps,
    oscAboveBand: !isNaN(pk.v) && band > 0 && pk.v > band * (1 + o.osc.bandMargin),
    targets: wave3Targets(p0.price, p1.price, p2.price), wave4Zones: wave4Zones(p2.price, p3.price) });
  // Dao động đã về ~0 sau đỉnh sóng 3 ⇒ ứng viên kết thúc sóng 4 (T-18)
  if (pk.v > 0) {
    const now = s * osc[n - 1];
    if (!isNaN(now) && n - 1 > p3.i && (pk.v - now) / pk.v >= o.osc.minPullback && -now / pk.v <= o.osc.maxOpposite)
      out.push({ type: 'wave4-oscillator-pulled-to-zero', note: 'Ứng viên kết thúc sóng 4 (cần giá xác nhận quay lại)' });
  }
  return out;
}

// ───────────────────────────── 9. Hàm tổng hợp ─────────────────────────────
export function analyze(candles, userOpts = {}) {
  const o = merge(DEFAULTS, userOpts);
  const osc = elliottOscillator(candles, o.fast, o.slow);
  const bands = breakoutBands(osc, o.bands);
  const pivots = zigzag(candles, o.zigzag);
  const impulses = findImpulses(candles, osc, bands, pivots, o, !!userOpts.keepInvalid);
  const ranked = impulses.filter(x => x.valid).sort((a, b) =>
    (b.points[b.points.length - 1].i - a.points[a.points.length - 1].i) || (b.score - a.score));
  const best = ranked[0] || null;

  let correction = null;
  if (best && best.status === 'complete') {
    const s = best.dir === 'up' ? 1 : -1, k = pivots.findIndex(p => p.i === best.points[5].i);
    correction = analyzeCorrection(candles, osc, pivots, k, s, o);
  }
  if (best) {                                   // Quy tắc luân phiên cần ≥ sóng 4
    const s = best.dir === 'up' ? 1 : -1, p = best.points;
    const f2 = classifySegment(candles, p[1], p[2], s, o);
    const f4 = best.wave4Type === 'triangle' ? { family: 'complex', kind: 'triangle' } : classifySegment(candles, p[3], p[4], s, o);
    best.alternation = { wave2: f2, wave4: f4, ...alternation(f2.family, f4.family) };
  }
  return { options: o, osc, bands, pivots, impulses: ranked, best, correction,
    signals: liveSignals(candles, osc, bands, pivots, o) };
}

// ───────────────────────────── 10. Adapter cho TradingView Lightweight Charts (v4) ─────────────────────────────
export function toLightweightCharts(res, candles) {
  const T = i => candles[i].time;
  const oscData = [], upBand = [], loBand = [];
  res.osc.forEach((v, i) => {
    if (isNaN(v)) return;
    oscData.push({ time: T(i), value: v, color: v >= 0 ? '#26a69a' : '#ef5350' });
    upBand.push({ time: T(i), value: res.bands.up[i] }); loBand.push({ time: T(i), value: res.bands.lo[i] });
  });
  const markers = [], lines = [], priceLines = [];
  if (res.best) {
    res.best.points.forEach((p, k) => markers.push({ time: p.time, position: p.type === 'H' ? 'aboveBar' : 'belowBar',
      shape: 'circle', color: '#2962ff', text: String(k) }));
    lines.push(res.best.points.map(p => ({ time: p.time, value: p.price })));
    res.best.targets.wave5.levels.forEach(l => priceLines.push({ price: l.price, title: `W5 ${l.ratio}`, color: '#ff9800' }));
    priceLines.push({ price: res.best.afterWave5.firstTarget, title: 'Mục tiêu sau S5 (đáy/đỉnh S4)', color: '#9c27b0' });
  }
  return { oscData, upBand, loBand, markers, lines, priceLines, zigzag: res.pivots.map(p => ({ time: p.time, value: p.price })) };
}

// ───────────────────────────── 11. Fibonacci KHI KÉO SÓNG (bổ sung, không đụng code cũ) ─────────────────────────────
// Dùng trong sự kiện mousemove/crosshair: truyền các mốc đã chốt + vị trí con trỏ ⇒ biết con trỏ đang ở mức Fibonacci nào.
//   anchors.length = 2 → đang kéo sóng 2 | 3 → sóng 3 | 4 → sóng 4 | 5 → sóng 5 | 6 → sóng A | 7 → sóng B | 8 → sóng C
//   anchors = [{i, price, time?}, ...] (có thể lấy thẳng từ res.best.points), cursor = {i, price, time?}
export const FIB_GRID = { ratios: [0.14, 0.25, 0.38, 0.5, 0.618], multiples: [1, 1.618, 2.618, 4.23, 6.85] }; // T-33

const fibLabel = r => (r <= 1 ? `${+(r * 100).toFixed(1)}%` : `×${+r.toFixed(3)}`);
const fibTol = l => Math.max(0.02, l * 0.03);          // sai số để coi là "đang chạm mức"
const pctTxt = r => `${(r * 100).toFixed(1)}%`;

function buildLevels(keys, grid, priceOf, ratio) {
  const m = new Map();
  grid.forEach(r => { if (!keys.some(k => Math.abs(k - r) <= Math.max(0.01, r * 0.01))) m.set(r, { ratio: r, key: false }); }); // bỏ mức lưới trùng mức chính (vd 0.618 vs 0.62)
  keys.forEach(r => m.set(r, { ratio: r, key: true }));        // mức "chính" lấy từ sách đè lên lưới phụ
  return [...m.values()].sort((a, b) => a.ratio - b.ratio).map(l => ({
    ...l, price: priceOf(l.ratio), label: fibLabel(l.ratio),
    hit: Math.abs(ratio - l.ratio) <= fibTol(l.ratio), distance: ratio - l.ratio }));
}

export function fibDrag(anchors, cursor, opts = {}) {
  const o = merge(DEFAULTS, opts), n = anchors.length;
  if (n < 2 || n > 8 || !cursor) return null;
  const P = anchors.map(a => a.price), s = P[1] > P[0] ? 1 : -1, cur = cursor.price;
  const tol = o.market === 'futures' ? o.overlapTolerance.futures : o.overlapTolerance.cash;
  const notes = [], milestones = []; let status = 'ok';
  const warn = t => { notes.push(t); if (status === 'ok') status = 'warning'; };
  const bad = t => { notes.push(t); status = 'invalid'; };
  let wave, baseName, baseLen, ratio, keys, grid, priceOf, stat = null, outsideBook = false, extra = {};

  if (n === 2) {                                                  // SÓNG 2: hồi bao nhiêu % sóng 1 (T-33, T-37)
    wave = '2'; baseName = 'sóng 1'; baseLen = Math.abs(P[1] - P[0]);
    ratio = s * (P[1] - cur) / baseLen; keys = FIB.w2; grid = FIB_GRID.ratios; priceOf = r => P[1] - s * r * baseLen;
    stat = statWave2(ratio);
    milestones.push({ label: 'Điểm bắt đầu sóng 1 (không được thủng)', price: P[0] });
    if (ratio >= 1) bad('Sóng 2 thủng điểm bắt đầu sóng 1 – không hợp lệ (T-6)');
    else if (ratio < 0) warn('Con trỏ chưa hồi về từ đỉnh/đáy sóng 1');
  } else if (n === 3) {                                           // SÓNG 3: bao nhiêu lần sóng 1 (T-34, T-38)
    wave = '3'; baseName = 'sóng 1'; baseLen = Math.abs(P[1] - P[0]);
    ratio = s * (cur - P[2]) / baseLen; keys = FIB.w3; grid = FIB_GRID.multiples; priceOf = r => P[2] + s * r * baseLen;
    stat = statWave3(ratio);
    milestones.push({ label: 'Đỉnh/đáy sóng 1 (vượt = sóng 3 bắt đầu tăng tốc)', price: P[1] });
    if (s * cur <= s * P[1]) warn('Chưa vượt đỉnh/đáy sóng 1 – chưa thể coi là sóng 3 (T-6)');
    else notes.push('Đã vượt đỉnh/đáy sóng 1 (stop bị quét, thường có gap – T-7)');
    if (ratio < 1) warn('Sóng 3 ngắn hơn sóng 1 – chỉ ~2% trường hợp theo thống kê sách');
  } else if (n === 4) {                                           // SÓNG 4: hồi bao nhiêu % sóng 3 (T-34, T-40)
    wave = '4'; baseName = 'sóng 3'; baseLen = Math.abs(P[3] - P[2]);
    ratio = s * (P[3] - cur) / baseLen; keys = FIB.w4; grid = FIB_GRID.ratios; priceOf = r => P[3] - s * r * baseLen;
    stat = statWave4(ratio);
    const w1 = Math.abs(P[1] - P[0]);
    milestones.push({ label: 'Đỉnh/đáy sóng 1 (sóng 4 không nên chồng lấn)', price: P[1] });
    if (s * cur < s * P[1] - tol * w1) bad('Sóng 4 chồng lấn sóng 1 vượt mức cho phép (T-26)');
    else if (s * cur < s * P[1]) warn(`Sóng 4 chồng lấn sóng 1 (chỉ chấp nhận ở futures, ≤${tol * 100}%)`);
    if (ratio >= 1) bad('Sóng 4 thủng điểm bắt đầu sóng 3');
  } else if (n === 5) {                                           // SÓNG 5 (T-35, T-42, T-43)
    wave = '5'; const w1 = Math.abs(P[1] - P[0]), w3 = Math.abs(P[3] - P[2]), len03 = Math.abs(P[3] - P[0]);
    const ext = w3 / w1 > 1.62;
    baseName = ext ? 'sóng 1 (sóng 3 kéo dài)' : 'đoạn 0→3 (sóng 5 over-extend)'; baseLen = ext ? w1 : len03;
    ratio = s * (cur - P[4]) / baseLen; keys = ext ? FIB.w5Extended : FIB.w5Over; grid = FIB_GRID.ratios;
    priceOf = r => P[4] + s * r * baseLen;
    const t5 = wave5Targets(P[0], P[1], P[2], P[3], P[4]);
    milestones.push({ label: 'Đỉnh/đáy sóng 3 (sóng 5 phải vượt)', price: P[3] });
    milestones.push({ label: 'Cửa sổ 62% 0→3 (T-43)', price: t5.window03.low }, { label: 'Cửa sổ 100% 0→3 (T-43)', price: t5.window03.high });
    if (s * cur <= s * P[3]) warn('Chưa vượt sóng 3 – nếu kết thúc ở đây là sóng 5 cắt cụt (sách không đề cập)');
    if (anchors.every(a => a.i != null) && cursor.i != null) {     // Kênh Elliott (T-36)
      const ch = elliottChannel(anchors[1], anchors[2], anchors[3], anchors[4]);
      ch.preferred = w3 / w1 > 1.62 ? 'upperW1' : 'upperW3';
      extra.channel = { preferred: ch.preferred, upperW1: channelValue(ch, 'upperW1', cursor.i), upperW3: channelValue(ch, 'upperW3', cursor.i) };
      notes.push(`Kênh ưu tiên: ${ch.preferred === 'upperW1' ? 'qua đỉnh sóng 1' : 'qua đỉnh sóng 3'}`);
    }
  } else {                                                        // SÓNG ĐIỀU CHỈNH A / B / C
    const p5 = anchors[5];
    if (n === 6) {                                                // A: sách không đưa tỷ lệ → đánh dấu ngoài sách
      wave = 'A'; outsideBook = true; baseName = 'sóng 5'; baseLen = Math.abs(P[5] - P[4]);
      ratio = s * (P[5] - cur) / baseLen; keys = []; grid = FIB_GRID.ratios; priceOf = r => P[5] - s * r * baseLen;
      milestones.push({ label: 'Cuối sóng 4 – mục tiêu đầu tiên sau sóng 5 (T-19)', price: P[4] });
      notes.push('Sách không nêu tỷ lệ cho sóng A; chỉ hiển thị lưới Fibonacci tham khảo. Zig-zag thì A có 5 sóng bên trong (T-27)');
    } else {
      const A = anchors[6], Bp = n === 8 ? anchors[7] : null;
      const res = n === 7 ? classifyABC(p5, A, { price: cur }, undefined, s, o) : classifyABC(p5, A, Bp, { price: cur }, s, o);
      if (res.kind === 'invalid') return { wave: n === 7 ? 'B' : 'C', status: 'invalid', notes: ['Sóng A sai hướng'], levels: [], milestones: [] };
      extra.classification = res.kind;
      if (n === 7) {
        wave = 'B'; baseName = 'sóng A'; baseLen = res.lenA; ratio = res.bRatio;
        keys = [FIB.zzB, FIB.zzBmax, 1, ...FIB.irrB]; grid = []; priceOf = r => A.price + s * r * res.lenA;
        extra.kindNow = res.kind;
        notes.push(`Hiện tại B ≈ ${res.kind === 'zigzag' ? 'Zig-zag (≤75% A)' : res.kind === 'flat' ? 'Flat (75–105% A)' : 'Irregular (>105% A)'}`);
        milestones.push({ label: 'Đầu sóng A (B vượt = Irregular)', price: p5.price });
      } else {
        wave = 'C'; baseName = 'sóng A'; baseLen = res.lenA; ratio = res.cRatio;
        const cr = res.kind === 'zigzag' ? FIB.zzC : res.kind === 'irregular' ? FIB.irrC : [1];
        keys = cr; grid = []; priceOf = r => Bp.price - s * r * res.lenA;
        milestones.push({ label: 'Cuối sóng A (C phải vượt nếu Zig-zag)', price: A.price });
        if (res.kind === 'zigzag' || res.kind === 'unconfirmed') {
          if (!res.cBeyondA) warn('C chưa vượt cuối sóng A – chưa xác nhận Zig-zag');
        }
      }
    }
  }

  const levels = buildLevels(keys, grid, priceOf, ratio);
  const lower = [...levels].reverse().find(l => l.ratio <= ratio) || null;
  const upper = levels.find(l => l.ratio > ratio) || null;
  const near = levels.reduce((b, l) => (Math.abs(l.distance) < Math.abs(b.distance) ? l : b), levels[0]);
  const keyNear = levels.filter(l => l.key).reduce((b, l) => (!b || Math.abs(l.distance) < Math.abs(b.distance) ? l : b), null);

  // Ngữ cảnh dao động (tuỳ chọn): ctx = { osc, bands }
  let oscillator = null;
  if (opts.ctx && opts.ctx.osc && cursor.i != null && [3, 4, 5].includes(n)) {
    const osc = opts.ctx.osc, now = s * osc[cursor.i];
    const pk3 = n === 3 ? { v: now } : osExt(osc, s, anchors[2].i, anchors[3].i, 'max');
    if (!isNaN(now) && pk3.v > 0) {
      if (n === 3 && opts.ctx.bands) {
        const b = s > 0 ? opts.ctx.bands.up[cursor.i] : -opts.ctx.bands.lo[cursor.i];
        oscillator = { type: 'wave3-band', osc: now, band: b, pass: b > 0 && now > b * (1 + o.osc.bandMargin) };
      } else if (n === 4) {
        const pullback = (pk3.v - now) / pk3.v, opposite = now < 0 ? -now / pk3.v : 0;
        oscillator = { type: 'wave4-pullback', pullback, opposite,
          pass: pullback >= o.osc.minPullback && opposite <= o.osc.maxOpposite,
          note: `Dao động đã hồi ${pctTxt(pullback)} từ đỉnh sóng 3 (cần ≥${o.osc.minPullback * 100}%, không quá ${o.osc.maxOpposite * 100}% phía đối diện)` };
      } else if (n === 5) {
        const pk5 = osExt(osc, s, anchors[4].i, cursor.i, 'max');
        oscillator = { type: 'wave5-divergence', peak3: pk3.v, peak5: pk5.v, pass: pk5.v < pk3.v };
      }
    }
  }

  const zoneTxt = lower && upper ? `giữa ${lower.label} và ${upper.label}` : lower ? `trên ${lower.label}` : upper ? `dưới ${upper.label}` : '';
  const hitTxt = near && near.hit ? ` · ĐANG CHẠM ${near.label}` : keyNear ? ` · gần ${keyNear.label} (${keyNear.distance >= 0 ? '+' : ''}${(keyNear.distance * 100).toFixed(1)}%)` : '';
  const statTxt = stat && stat.pct != null ? ` · thống kê sách: ${stat.pct}% (${stat.bucket})` : '';
  const label = `Sóng ${wave} = ${pctTxt(ratio)} ${baseName} · ${zoneTxt}${hitTxt}${statTxt}`;

  return { wave, status, notes, ratio, ratioPct: ratio * 100, base: { name: baseName, length: baseLen },
    zone: { lower, upper }, nearest: near, nearestKey: keyNear, levels, milestones, stat, outsideBook,
    oscillator, label, ...extra };
}

/** Chuyển kết quả fibDrag thành price lines để vẽ (tương thích Lightweight Charts createPriceLine). */
export function fibDragToChart(info) {
  if (!info) return { priceLines: [], label: '' };
  const lines = info.levels.map(l => ({ price: l.price, title: l.label + (l.key ? ' ★' : ''),
    color: l.hit ? '#ff1744' : l.key ? '#ff9800' : '#9e9e9e', lineStyle: l.key ? 0 : 2 }));
  info.milestones.forEach(m => lines.push({ price: m.price, title: m.label, color: '#2962ff', lineStyle: 1 }));
  return { priceLines: lines, label: info.label, status: info.status };
}

/**
 * Ví dụ gắn vào Lightweight Charts v4 (CHƯA kiểm thử với thư viện thật – cần thử trên web của bạn).
 * getAnchors(): trả về các mốc đã chốt tại thời điểm hiện tại. onUpdate(info, chartData) để bạn cập nhật UI.
 */
export function makeFibDragHandler(chart, series, candles, getAnchors, onUpdate, opts = {}) {
  const idx = new Map(candles.map((c, i) => [c.time, i]));
  const h = param => {
    const A = getAnchors();
    if (!A || A.length < 2 || !param.point || param.time == null) return;
    const price = series.coordinateToPrice(param.point.y), i = idx.get(param.time);
    if (price == null || i == null) return;
    const info = fibDrag(A, { i, price, time: param.time }, opts);
    if (info) onUpdate(info, fibDragToChart(info));
  };
  chart.subscribeCrosshairMove(h);
  return () => chart.unsubscribeCrosshairMove(h);
}

// ═════════════════════════════ NÂNG CẤP PRO (bước 1–5) – chỉ thêm mới, không sửa code cũ ═════════════════════════════

// ───────────────────────────── 12. Đa bậc sóng (multi-degree) + liệt kê kịch bản ─────────────────────────────
export const DEGREES = [
  { name: 'minor', k: 0.5 }, { name: 'intermediate', k: 1 }, { name: 'major', k: 2 }, { name: 'primary', k: 4 },
]; // k nhân với zigzag.pct: bậc nhỏ nhạy hơn, bậc lớn thô hơn

/** findImpulses + thêm kịch bản "sóng 5 đang chạy" (sóng 4 đã xác nhận, sóng 5 chưa vượt sóng 3). */
export function findScenarios(c, osc, bands, pv, o, keepInvalid = false) {
  const out = findImpulses(c, osc, bands, pv, o, keepInvalid);
  const st0 = Math.max(0, pv.length - o.maxPivotsBack);
  for (let st = st0; st + 6 === pv.length; st++) {
    if (!pv[st + 4].confirmed || pv[st + 5].confirmed) continue;
    if (out.some(e => e.valid && e.points.length === 6 && e.points[0].i === pv[st].i)) continue;
    const e = evaluateImpulse(c, osc, bands, pv.slice(st, st + 5), o);
    e.provisional = pv[st + 5];                 // đỉnh/đáy tạm thời của sóng 5 đang chạy
    if (e.valid || keepInvalid) out.push(e);
  }
  return out;
}

/** Sóng 5 đang chạy và sóng 4 đã được xác nhận? (dùng cho backtest & cảnh báo) */
export const isWave5Live = sc =>
  sc.points[4].confirmed && (!!sc.provisional || (sc.points.length === 6 && !sc.points[5].confirmed));

/** Điểm lồng ghép: sóng 1/3/5 nên chứa xung lực bậc nhỏ cùng chiều; sóng 2/4 không nên chứa. */
export function nestingScore(sc, lower) {
  const p = sc.points, waves = [[0, 1, 'm'], [1, 2, 'c'], [2, 3, 'm'], [3, 4, 'c']];
  if (p.length === 6) waves.push([4, 5, 'm']);
  let motive = 0, covered = 0, conflicts = 0;
  for (const [a, b, kind] of waves) {
    const i0 = p[a].i, i1 = p[b].i, len = i1 - i0; if (len <= 0) continue;
    const hit = lower.some(x => {
      if (x.dir !== sc.dir) return false;
      const f = x.points[0].i, l = x.points[x.points.length - 1].i;
      return f >= i0 - 0.15 * len && l <= i1 + 0.15 * len && (Math.min(i1, l) - Math.max(i0, f)) / len >= 0.6;
    });
    if (kind === 'm') { motive++; if (hit) covered++; } else if (hit) conflicts++;
  }
  const score = motive ? Math.max(0, Math.min(1, covered / motive - 0.25 * conflicts)) : 0.5;
  return { score, covered, motive, conflicts };
}

export function multiDegreeScenarios(c, osc, bands, o, degrees = DEGREES) {
  const per = degrees.map(d => {
    const zz = { ...o.zigzag, pct: o.zigzag.pct * d.k, atrMult: o.zigzag.atrMult ? o.zigzag.atrMult * d.k : 0 };
    const pivots = zigzag(c, zz), idx = new Map(pivots.map((p, k) => [p.i, k]));
    const scenarios = findScenarios(c, osc, bands, pivots, o).filter(x => x.valid).map(sc => {
      sc.degree = d.name; sc.degreeK = d.k;
      sc.pivotsAfter = pivots.length - 1 - idx.get(sc.points[sc.points.length - 1].i);
      if (sc.points.length === 6 && sc.points[5].confirmed) {
        const k = idx.get(sc.points[5].i), s = sc.dir === 'up' ? 1 : -1;
        sc.correction = analyzeCorrection(c, osc, pivots, k, s, o);
      }
      return sc;
    });
    return { degree: d.name, k: d.k, pivots, scenarios };
  });
  per.forEach((dg, di) => {
    const lower = per.slice(0, di).flatMap(x => x.scenarios);
    dg.scenarios.forEach(sc => { sc.nesting = di === 0 ? { score: null } : nestingScore(sc, lower); });
  });
  return per;
}

// ───────────────────────────── 13. Xếp hạng kịch bản theo xác suất (không chỉ 1 đáp án) ─────────────────────────────
// Bảng xác suất mặc định = số liệu của sách (T-37, T-38, T-40). Có thể thay bằng bảng hiệu chỉnh từ dữ liệu VN (Mục 15).
export const STAT_TABLES = {
  w2: [{ max: 0.38, p: 0.12 }, { max: 0.5, p: null }, { max: 0.6, p: 0.73 }, { max: 0.62, p: null }, { max: Infinity, p: 0.15 }], // T-37: 73% là 50–60%
  w3: [{ max: 1, p: 0.02 }, { max: 1.6, p: 0.15 }, { max: 1.75, p: 0.45 }, { max: 2.62, p: 0.30 }, { max: Infinity, p: 0.08 }],
  w4: [{ max: 0.24, p: null }, { max: 0.3, p: 0.15 }, { max: 0.5, p: 0.60 }, { max: 0.62, p: 0.15 }, { max: Infinity, p: 0.10 }],
};
// Trọng số là ước lượng ban đầu (heuristic). Dùng fitScenarioModel() để hiệu chỉnh từ backtest.
export const DEFAULT_MODEL = { bias: 0, logp: 1.0, osc: 1.5, nest: 1.0, alt: 0.5 };

export function probOf(table, r, nullP = 0.05, floor = 0.01) {
  const b = table.find(x => r <= x.max) || table[table.length - 1];
  return Math.max(floor, b.p == null ? nullP : b.p);
}

export function scenarioFeatures(c, sc, tables = STAT_TABLES, o = DEFAULTS) {
  const lg = (t, r) => Math.log(probOf(t, r));
  const logp = (lg(tables.w2, sc.ratios.w2) + lg(tables.w3, sc.ratios.w3) + lg(tables.w4, sc.ratios.w4)) / 3;
  const ch = Object.values(sc.checks).filter(x => 'pass' in x);
  const osc = ch.length ? ch.filter(x => x.pass).length / ch.length : 0;
  const s = sc.dir === 'up' ? 1 : -1, p = sc.points;
  const f2 = classifySegment(c, p[1], p[2], s, o);
  const f4 = sc.wave4Type === 'triangle' ? { family: 'complex' } : classifySegment(c, p[3], p[4], s, o);
  const al = alternation(f2.family, f4.family);
  return { logp, osc, nest: sc.nesting?.score ?? 0.5, alt: al.ok === null ? 0.5 : al.ok ? 1 : 0, alternation: al };
}

/** Mức vô hiệu hoá: giá chạm mức này thì cách đếm sai. */
export function invalidationOf(sc) {
  const s = sc.dir === 'up' ? 1 : -1, p = sc.points;
  if (isWave5Live(sc) || sc.status === 'wave5-forming')
    return { price: p[4].price, side: s > 0 ? 'below' : 'above', reason: 'Thủng cực trị sóng 4 → sóng 4 chưa xong / cách đếm sai', overlapLevel: p[1].price };
  return { price: p[5].price, side: s > 0 ? 'above' : 'below', reason: 'Vượt cực trị sóng 5 → sóng 5 chưa kết thúc', overlapLevel: p[1].price };
}

export function rankScenarios(c, per, o, pro = {}) {
  const tables = pro.statTables || STAT_TABLES, m = { ...DEFAULT_MODEL, ...(pro.model || {}) };
  const topN = pro.topN ?? 5, T = pro.temperature ?? 1, maxAfter = pro.maxPivotsAfter ?? 3;
  const all = per.flatMap(dg => dg.scenarios).filter(sc => sc.pivotsAfter <= maxAfter);
  if (!all.length) return [];
  all.forEach(sc => {
    const f = scenarioFeatures(c, sc, tables, o); sc.features = f;
    sc.modelScore = m.bias + m.logp * f.logp + m.osc * f.osc + m.nest * f.nest + m.alt * f.alt;
    sc.invalidation = invalidationOf(sc);
  });
  const mx = Math.max(...all.map(x => x.modelScore));
  const Z = all.reduce((a, x) => a + Math.exp((x.modelScore - mx) / T), 0);
  all.forEach(x => { x.weight = Math.exp((x.modelScore - mx) / T) / Z; });
  return all.sort((a, b) => b.weight - a.weight).slice(0, topN);
}

// ───────────────────────────── 14. Hội tụ Fibonacci (confluence) đa kịch bản / đa bậc ─────────────────────────────
export function fibConfluence(scenarios, { tolPct = 0.005, horizonI = null } = {}) {
  const L = [], add = (price, w, src, deg) => { if (isFinite(price)) L.push({ price, w, src, deg }); };
  for (const sc of scenarios) {
    const w = sc.weight ?? 1, deg = sc.degree || 'main';
    if (isWave5Live(sc) || sc.status === 'wave5-forming') {
      sc.targets.wave5.levels.forEach(l => add(l.price, w, `${deg} S5 ×${l.ratio}`, deg));
      add(sc.targets.wave5.window03.low, w * 0.5, `${deg} S5 cửa sổ 62% 0→3`, deg);
      add(sc.targets.wave5.window03.high, w * 0.5, `${deg} S5 cửa sổ 100% 0→3`, deg);
      if (horizonI != null) {
        add(channelValue(sc.channel, sc.channel.preferred, horizonI), w * 0.6, `${deg} kênh ${sc.channel.preferred}`, deg);
      }
    } else {
      add(sc.afterWave5.firstTarget, w * 0.7, `${deg} đáy/đỉnh sóng 4 (mục tiêu đầu tiên)`, deg);
      if (sc.correction && sc.correction.cTargets && sc.correction.cFibNearest === undefined)
        sc.correction.cTargets.forEach(t => add(t.price, w * 0.6, `${deg} C ×${t.ratio}`, deg));
    }
  }
  L.sort((a, b) => a.price - b.price);
  const clusters = [];
  for (const x of L) {
    const cl = clusters[clusters.length - 1];
    if (cl && Math.abs(x.price - cl.price) <= tolPct * x.price) {
      cl.price = (cl.price * cl.weight + x.price * x.w) / (cl.weight + x.w);
      cl.weight += x.w; cl.count++; cl.sources.push(x.src); cl.degrees.add(x.deg);
      cl.low = Math.min(cl.low, x.price); cl.high = Math.max(cl.high, x.price);
    } else clusters.push({ price: x.price, weight: x.w, count: 1, sources: [x.src], degrees: new Set([x.deg]), low: x.price, high: x.price });
  }
  return clusters.map(cl => ({ ...cl, degrees: [...cl.degrees] })).sort((a, b) => b.weight - a.weight);
}

export function nearestCluster(clusters, price, tolPct = 0.01) {
  let best = null;
  for (const cl of clusters) {
    const d = Math.abs(cl.price - price);
    if (d <= tolPct * price && (!best || d < best.d)) best = { cluster: cl, d };
  }
  return best ? best.cluster : null;
}

// ───────────────────────────── 15. Backtest walk-forward, đo "lợi thế thật" so với ngẫu nhiên ─────────────────────────────
export function seededRng(seed = 1) {              // mulberry32
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function outcome(c, t, s, level, stop, horizon) {
  const end = Math.min(c.length - 1, t + horizon);
  for (let j = t + 1; j <= end; j++) {
    if (s > 0 ? c[j].low < stop : c[j].high > stop) return { hit: false, invalid: true, bars: j - t };   // bảo thủ: stop xét trước
    if (s > 0 ? c[j].high >= level : c[j].low <= level) return { hit: true, invalid: false, bars: j - t };
  }
  return { hit: false, invalid: false, bars: null };
}

/**
 * Chạy lại phân tích tại từng thời điểm t chỉ với dữ liệu ≤ t (KHÔNG nhìn tương lai), ghi lại mục tiêu sóng 5
 * rồi xem giá có chạm mục tiêu trước khi thủng mức vô hiệu hoá không. Mỗi mục tiêu có 5 mức "ngẫu nhiên" cùng khoảng cách (±30%) làm đối chứng.
 */
export function walkForward(candles, userOpts = {}, wf = {}) {
  const o = merge(DEFAULTS, userOpts), n = candles.length;
  const { step = 3, warmup = 150, window = 500, horizon = 60, seed = 1, nullDraws = 5 } = wf;
  const from = wf.from ?? warmup, to = Math.min(wf.to ?? n - 1 - horizon, n - 1 - horizon);
  const osc = elliottOscillator(candles, o.fast, o.slow), bands = breakoutBands(osc, o.bands);
  const rng = seededRng(seed), seen = new Set(), samples = [];
  for (let t = from; t <= to; t += step) {
    const lo = Math.max(0, t - window + 1);
    const pv = zigzag(candles.slice(lo, t + 1), o.zigzag).map(p => ({ ...p, i: p.i + lo }));
    if (pv.length < 6) continue;
    for (const sc of findScenarios(candles, osc, bands, pv, o).filter(x => x.valid && isWave5Live(x))) {
      const key = `${sc.points[4].i}|${sc.dir}`; if (seen.has(key)) continue; seen.add(key);
      const s = sc.dir === 'up' ? 1 : -1, entry = candles[t].close, stop = sc.points[4].price;
      const levels = sc.targets.wave5.levels.map(l => {
        const d = s * (l.price - entry);
        if (d <= 0) return { ratio: l.ratio, price: l.price, passed: true };
        const r = outcome(candles, t, s, l.price, stop, horizon);
        let base = 0;
        for (let k = 0; k < nullDraws; k++) base += outcome(candles, t, s, entry + s * d * (0.7 + 0.6 * rng()), stop, horizon).hit ? 1 : 0;
        return { ratio: l.ratio, price: l.price, passed: false, ...r, baseRate: base / nullDraws };
      });
      samples.push({ t, dir: sc.dir, p4i: sc.points[4].i, mode: sc.targets.wave5.mode, levels,
        features: scenarioFeatures(candles, sc, STAT_TABLES, o) });
    }
  }
  return samples;
}

export function summarizeSamples(samples) {
  const g = new Map(); let N = 0, H = 0, B = 0, I = 0;
  for (const sm of samples) for (const lv of sm.levels) {
    if (lv.passed) continue;
    const k = `${sm.mode} | ×${lv.ratio}`, x = g.get(k) || { n: 0, hits: 0, inv: 0, base: 0 };
    x.n++; x.hits += lv.hit ? 1 : 0; x.inv += lv.invalid ? 1 : 0; x.base += lv.baseRate; g.set(k, x);
    N++; H += lv.hit ? 1 : 0; B += lv.baseRate; I += lv.invalid ? 1 : 0;
  }
  const stat = x => { const r = x.hits / x.n, b = x.base / x.n, z = b > 0 && b < 1 ? (r - b) / Math.sqrt(b * (1 - b) / x.n) : null;
    return { n: x.n, hitRate: r, invalidRate: x.inv / x.n, baseRate: b, lift: b > 0 ? r / b : null, z }; };
  return {
    rows: [...g.entries()].map(([key, x]) => ({ key, ...stat(x) })),
    overall: N ? stat({ n: N, hits: H, inv: I, base: B }) : null,
    caveat: 'Các mẫu chồng lấn theo thời gian nên z-score bị phóng đại; chỉ coi là chỉ báo thô. Cần kiểm tra trên nhiều mã & nhiều giai đoạn.',
  };
}

/** Chọn ngưỡng ZigZag bằng walk-forward: tối ưu trên 60% đầu, báo cáo trên 40% sau (out-of-sample). */
export function tuneZigzag(candles, pcts = [0.02, 0.03, 0.04, 0.06], userOpts = {}, wf = {}) {
  const n = candles.length, horizon = wf.horizon ?? 60, warmup = wf.warmup ?? 150;
  const cut = Math.floor(n * 0.6), minN = wf.minN ?? 20;
  const table = pcts.map(pct => {
    const opts = merge(userOpts, { zigzag: { pct } });
    const tr = summarizeSamples(walkForward(candles, opts, { ...wf, from: warmup, to: cut })).overall;
    const te = summarizeSamples(walkForward(candles, opts, { ...wf, from: cut, to: n - 1 - horizon })).overall;
    return { pct, train: tr, test: te };
  });
  const ok = table.filter(r => r.train && r.train.n >= minN && r.train.lift != null);
  const best = ok.sort((a, b) => b.train.lift - a.train.lift)[0] || null;
  return { table, best, note: 'best chọn theo train; test là kết quả out-of-sample – nếu test lift ≈ 1 thì không có lợi thế.' };
}

// ───────────────────────────── 16. Hiệu chỉnh theo thị trường (VN) từ dữ liệu lịch sử ─────────────────────────────
/** Thu thập tỷ lệ sóng 2/3/4/5 từ các xung lực hợp lệ, hoàn chỉnh, không chồng nhau trong toàn bộ lịch sử. */
export function collectRatios(candles, userOpts = {}) {
  const o = merge(DEFAULTS, userOpts);
  const osc = elliottOscillator(candles, o.fast, o.slow), bands = breakoutBands(osc, o.bands);
  const pv = zigzag(candles, o.zigzag);
  const all = findImpulses(candles, osc, bands, pv, { ...o, maxPivotsBack: Infinity })
    .filter(x => x.valid && x.status === 'complete' && x.points[5].confirmed)
    .sort((a, b) => a.points[0].i - b.points[0].i);
  const chosen = []; let lastEnd = -1;
  for (const x of all) if (x.points[0].i >= lastEnd) { chosen.push(x); lastEnd = x.points[5].i; }
  return { n: chosen.length, w2: chosen.map(x => x.ratios.w2), w3: chosen.map(x => x.ratios.w3), w4: chosen.map(x => x.ratios.w4),
    w5: chosen.map(x => ({ mode: x.targets.wave5.mode, ratio: x.targets.wave5.mode.startsWith('wave3-extended') ? x.ratios.w5OverW1 : x.ratios.w5Over03 })),
    note: 'Có selection bias: chỉ thấy các cấu trúc thoả quy tắc. Dùng để so sánh tương đối với bảng sách, không phải xác suất tuyệt đối.' };
}

/** Bảng xác suất mới theo cùng các khoảng (bucket) của sách, làm mịn Laplace. null nếu quá ít mẫu. */
export function calibrateStatTables(ratios, { minN = 30, alpha = 1 } = {}) {
  if (ratios.n < minN) return null;
  const mk = (tbl, arr) => {
    const cnt = tbl.map(() => 0);
    arr.forEach(r => { cnt[tbl.findIndex(b => r <= b.max)]++; });
    const tot = arr.length + alpha * tbl.length;
    return tbl.map((b, k) => ({ max: b.max, p: (cnt[k] + alpha) / tot, n: cnt[k] }));
  };
  return { n: ratios.n, tables: { w2: mk(STAT_TABLES.w2, ratios.w2), w3: mk(STAT_TABLES.w3, ratios.w3), w4: mk(STAT_TABLES.w4, ratios.w4) } };
}

/** Pha trộn bảng sách (tiên nghiệm, trọng số k mẫu) với bảng dữ liệu thật: ít mẫu → gần sách, nhiều mẫu → gần dữ liệu. */
export function blendTables(book, calib, k = 50) {
  const out = {};
  for (const key of Object.keys(book)) out[key] = book[key].map((b, j) => {
    const c = calib.tables[key][j], n = calib.n;
    return { max: b.max, p: b.p == null ? c.p : (n * c.p + k * b.p) / (n + k) };
  });
  return out;
}

/** Hồi quy logistic: đặc trưng kịch bản → xác suất chạm mục tiêu đầu tiên. Trả về trọng số cho `pro.model`. */
export function fitScenarioModel(samples, feats = ['logp', 'osc', 'alt'], { iters = 3000, lr = 0.1, l2 = 0.01 } = {}) {
  const rows = samples.map(s => ({ s, lv: s.levels.find(l => !l.passed) })).filter(r => r.lv);
  if (rows.length < 50) return null;
  const X = rows.map(r => [1, ...feats.map(f => r.s.features[f])]), y = rows.map(r => (r.lv.hit ? 1 : 0));
  const w = new Array(X[0].length).fill(0);
  for (let it = 0; it < iters; it++) {
    const g = new Array(w.length).fill(0);
    X.forEach((x, k) => { const p = 1 / (1 + Math.exp(-x.reduce((a, v, j) => a + v * w[j], 0))); x.forEach((v, j) => { g[j] += (p - y[k]) * v; }); });
    for (let j = 0; j < w.length; j++) w[j] -= lr * (g[j] / X.length + (j ? l2 * w[j] : 0));
  }
  const weights = { bias: w[0] }; feats.forEach((f, j) => { weights[f] = w[j + 1]; });
  return { weights, n: rows.length, baseRate: y.reduce((a, b) => a + b, 0) / y.length };
}

// ───────────────────────────── 17. Hàm tổng hợp PRO + kéo sóng có hội tụ ─────────────────────────────
/**
 * analyzePro = analyze (cũ, giữ nguyên) + đa bậc sóng + xếp hạng kịch bản + hội tụ Fibonacci.
 * userOpts.pro = { degrees, topN, model, statTables, temperature, maxPivotsAfter, projectBars, confluenceTol }
 */
export function analyzePro(candles, userOpts = {}) {
  const base = analyze(candles, userOpts), o = base.options, pro = userOpts.pro || {};
  const per = multiDegreeScenarios(candles, base.osc, base.bands, o, pro.degrees || DEGREES);
  const scenarios = rankScenarios(candles, per, o, pro);
  const horizonI = candles.length - 1 + (pro.projectBars ?? 20), tol = pro.confluenceTol ?? 0.005;
  const confluence = fibConfluence(scenarios, { tolPct: tol, horizonI });
  return { ...base,
    degrees: per.map(d => ({ degree: d.degree, k: d.k, pivots: d.pivots, scenarioCount: d.scenarios.length })),
    scenarios, confluence, confluenceTol: tol };
}

/** fibDrag + cho biết giá con trỏ có nằm trong cụm hội tụ Fibonacci nào (từ analyzePro). */
export function fibDragPro(anchors, cursor, opts = {}, pro = null) {
  const info = fibDrag(anchors, cursor, opts);
  if (info && pro) {
    const cl = nearestCluster(pro.confluence, cursor.price, (pro.confluenceTol ?? 0.005) * 2);
    info.confluence = cl;
    if (cl) info.label += ` · HỘI TỤ ${cl.count} mức/${cl.degrees.length} bậc (trọng số ${cl.weight.toFixed(2)})`;
  }
  return info;
}

// ═════════════════════════════ NÂNG CẤP: KHỐI LƯỢNG + TỶ LỆ THỜI GIAN – chỉ thêm mới, không sửa code cũ ═════════════════════════════
// LƯU Ý: giáo trình GET (T-5…T-43) KHÔNG có phần khối lượng và thời gian. Các quy tắc ở Mục 18–19 lấy từ quy ước phổ biến
// của lý thuyết sóng Elliott/Fibonacci thời gian, là GIẢ THUYẾT cần kiểm chứng bằng Mục 21 (evaluateFilter) trước khi tin dùng.
// Nến cần có trường `volume`; nếu thiếu, các hàm khối lượng tự bỏ qua (score = null).

// ───────────────────────────── 18. Xác nhận bằng khối lượng ─────────────────────────────
export const hasVolume = c => c.length > 0 && c.every(x => Number.isFinite(x.volume));

/** Khối lượng trung bình/nến của đoạn (i0, i1]. */
export function legStats(c, i0, i1) {
  const bars = i1 - i0; if (bars <= 0) return null;
  let sum = 0; for (let j = i0 + 1; j <= i1; j++) sum += c[j].volume;
  return { bars, sum, avg: sum / bars };
}
/** Mức khối lượng nền: trung bình n nến kết thúc tại i. */
export function baselineVol(c, i, n = 50) {
  const a = Math.max(0, i - n + 1); let s = 0; for (let j = a; j <= i; j++) s += c[j].volume;
  return s / (i - a + 1);
}

/**
 * Kiểm tra khối lượng cho 1 kịch bản. endI = nến hiện tại (để tính đoạn sóng 5 đang chạy mà không nhìn tương lai).
 * Quy tắc (giả thuyết): sóng 3 có vol/nến ≥ sóng 1; sóng 3 là mạnh nhất; sóng 5 yếu hơn sóng 3 (phân kỳ khối lượng);
 * sóng 2, 4 co lại so với sóng xung lực liền trước; có đột biến vol khi vượt đỉnh/đáy sóng 1.
 */
export function scenarioVolume(c, sc, endI, { spike = 1.5, minBars5 = 3 } = {}) {
  if (!hasVolume(c)) return { has: false, score: null, checks: {} };
  const p = sc.points, s = sc.dir === 'up' ? 1 : -1, base = baselineVol(c, p[0].i, 50) || 1;
  const end5 = p.length === 6 ? p[5].i : Math.min(endI, c.length - 1);
  const L = [null, legStats(c, p[0].i, p[1].i), legStats(c, p[1].i, p[2].i), legStats(c, p[2].i, p[3].i),
    legStats(c, p[3].i, p[4].i), legStats(c, p[4].i, end5)];
  const rel = L.map(x => (x ? x.avg / base : null)), checks = {};
  if (L[1] && L[3]) checks.wave3GteWave1 = { pass: L[3].avg >= L[1].avg, w1: rel[1], w3: rel[3] };
  if (L[2] && L[1]) checks.wave2Contracts = { pass: L[2].avg < L[1].avg, w1: rel[1], w2: rel[2] };
  if (L[4] && L[3]) checks.wave4Contracts = { pass: L[4].avg < L[3].avg, w3: rel[3], w4: rel[4] };
  if (L[5] && L[5].bars >= minBars5 && L[3]) checks.wave5WeakerThanWave3 = { pass: L[5].avg < L[3].avg, w3: rel[3], w5: rel[5] };
  // đột biến khối lượng khi giá vượt đỉnh/đáy sóng 1
  let j = -1; for (let k = p[2].i + 1; k <= p[3].i; k++) if (s * c[k].close > s * p[1].price) { j = k; break; }
  if (j > 0) { let mx = 0; for (let k = Math.max(0, j - 1); k <= Math.min(c.length - 1, j + 2); k++) mx = Math.max(mx, c[k].volume);
    checks.breakoutSpike = { pass: mx / base >= spike, ratio: mx / base }; }
  const v = Object.values(checks);
  return { has: true, base, legs: L.slice(1).map((x, k) => x && { wave: k + 1, bars: x.bars, avg: x.avg, rel: rel[k + 1] }),
    checks, score: v.length ? v.filter(x => x.pass).length / v.length : null };
}

// ───────────────────────────── 19. Tỷ lệ về thời gian (Fibonacci time) ─────────────────────────────
export const TIME_RATIOS = [0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.618];

const _nullCache = new Map();
/** Xác suất một tỷ lệ thời gian NGẪU NHIÊN (đều theo log trong [0.25, 4]) tình cờ nằm trong sai số của một mức Fibonacci.
 *  Giá trị này rất cao ⇒ "khớp Fibonacci thời gian" ít có ý nghĩa nếu không so với đường cơ sở này. */
export function timeNullCoverage(tol = 0.15, lo = 0.25, hi = 4) {
  const key = `${tol}|${lo}|${hi}`; if (_nullCache.has(key)) return _nullCache.get(key);
  let hit = 0; const N = 4000, a = Math.log(lo), b = Math.log(hi);
  for (let k = 0; k < N; k++) { const r = Math.exp(a + (b - a) * (k + 0.5) / N); if (TIME_RATIOS.some(f => Math.abs(r / f - 1) <= tol)) hit++; }
  const v = hit / N; _nullCache.set(key, v); return v;
}

export function timeRatio(dur, base, tol = 0.15) {
  if (!(dur > 0) || !(base > 0)) return null;
  const ratio = dur / base, nearestR = TIME_RATIOS.reduce((b, f) => (Math.abs(Math.log(ratio / f)) < Math.abs(Math.log(ratio / b)) ? f : b), TIME_RATIOS[0]);
  const err = ratio / nearestR - 1;
  return { ratio, nearest: nearestR, err, within: Math.abs(err) <= tol };
}

/** Thời lượng (số nến) các sóng và các cặp tỷ lệ hoàn chỉnh. `edge` = tỷ lệ khớp − xác suất khớp ngẫu nhiên. */
export function timeProfile(sc, endI, { tol = 0.15 } = {}) {
  const p = sc.points, d = [null];
  for (let k = 1; k <= 4; k++) d[k] = p[k].i - p[k - 1].i;
  if (p.length === 6 && p[5].confirmed) d[5] = p[5].i - p[4].i;
  const defs = [['S2/S1', 2, 1], ['S3/S1', 3, 1], ['S4/S2', 4, 2], ['S4/S3', 4, 3], ['S5/S1', 5, 1], ['S5/S3', 5, 3]];
  const pairs = defs.filter(([, a, b]) => d[a] > 0 && d[b] > 0).map(([name, a, b]) => ({ name, ...timeRatio(d[a], d[b], tol) }));
  const cov = timeNullCoverage(tol), score = pairs.length ? pairs.filter(x => x.within).length / pairs.length : null;
  return { durations: d.slice(1), pairs, score, nullCoverage: cov, edge: score == null ? null : score - cov,
    elapsedWave5: p.length === 5 || (p.length === 6 && !p[5].confirmed) ? endI - p[4].i : null };
}

/** Cửa sổ thời gian dự kiến kết thúc sóng 5 (giả thuyết): 0.618/1/1.618 × thời lượng sóng 1, và 0.382/0.618/1 × thời lượng sóng 3. */
export function timeTargets(sc, endI) {
  const p = sc.points; if (!(isWave5Live(sc) || sc.status === 'wave5-forming')) return null;
  const d1 = p[1].i - p[0].i, d3 = p[3].i - p[2].i, st = p[4].i;
  const mk = (r, base, name) => ({ bar: Math.round(st + r * base), ratio: r, basis: name });
  const levels = [...[0.618, 1, 1.618].map(r => mk(r, d1, 'sóng 1')), ...[0.382, 0.618, 1].map(r => mk(r, d3, 'sóng 3'))]
    .sort((a, b) => a.bar - b.bar);
  const elapsed = endI - st, first = levels[0].bar - st, last = levels[levels.length - 1].bar - st;
  return { levels, elapsed, stage: elapsed < first ? 'trước cửa sổ' : elapsed <= last ? 'trong cửa sổ' : 'quá cửa sổ' };
}

/** Gom các mốc thời gian của nhiều kịch bản thành cụm (sai số tolBars nến). */
export function timeConfluence(scenarios, { tolBars = 3 } = {}) {
  const L = [];
  scenarios.forEach(sc => { const w = sc.weight ?? 1; (sc.timeTargets ? sc.timeTargets.levels : []).forEach(l =>
    L.push({ bar: l.bar, w, src: `${sc.degree || 'main'} ×${l.ratio} ${l.basis}` })); });
  L.sort((a, b) => a.bar - b.bar);
  const cl = [];
  for (const x of L) {
    const c = cl[cl.length - 1];
    if (c && Math.abs(x.bar - c.bar) <= tolBars) { c.bar = (c.bar * c.weight + x.bar * x.w) / (c.weight + x.w); c.weight += x.w; c.count++; c.sources.push(x.src); }
    else cl.push({ bar: x.bar, weight: x.w, count: 1, sources: [x.src] });
  }
  return cl.sort((a, b) => b.weight - a.weight);
}

/** Ô thời gian–giá: ghép cụm giá hội tụ với cụm thời gian hội tụ; trọng số = tích hai trọng số. */
export function timePriceCells(priceClusters, timeClusters, topN = 5) {
  const out = [];
  priceClusters.slice(0, 6).forEach(pc => timeClusters.slice(0, 6).forEach(tc =>
    out.push({ price: pc.price, bar: Math.round(tc.bar), weight: pc.weight * tc.weight, priceSources: pc.sources, timeSources: tc.sources })));
  return out.sort((a, b) => b.weight - a.weight).slice(0, topN);
}

// ───────────────────────────── 20. Đặc trưng mở rộng + backtest có khối lượng/thời gian ─────────────────────────────
export const DEFAULT_MODEL_FULL = { ...DEFAULT_MODEL, vol: 0.5, time: 0.3 }; // trọng số khởi điểm (heuristic) – cần hiệu chỉnh

export function scenarioFeaturesFull(c, sc, endI, tables = STAT_TABLES, o = DEFAULTS, tol = 0.15) {
  const f = scenarioFeatures(c, sc, tables, o);
  const v = scenarioVolume(c, sc, endI), t = timeProfile(sc, endI, { tol });
  return { ...f, vol: v.score ?? 0.5, time: t.score ?? 0.5, timeEdge: t.edge, volChecks: v.checks };
}

/** Giống walkForward nhưng mẫu có thêm đặc trưng vol/time (tính chỉ với dữ liệu ≤ t, không nhìn tương lai). */
export function walkForwardFull(candles, userOpts = {}, wf = {}) {
  const o = merge(DEFAULTS, userOpts), n = candles.length;
  const { step = 3, warmup = 150, window = 500, horizon = 60, seed = 1, nullDraws = 5 } = wf;
  const from = wf.from ?? warmup, to = Math.min(wf.to ?? n - 1 - horizon, n - 1 - horizon);
  const osc = elliottOscillator(candles, o.fast, o.slow), bands = breakoutBands(osc, o.bands);
  const rng = seededRng(seed), seen = new Set(), samples = [];
  for (let t = from; t <= to; t += step) {
    const lo = Math.max(0, t - window + 1);
    const pv = zigzag(candles.slice(lo, t + 1), o.zigzag).map(p => ({ ...p, i: p.i + lo }));
    if (pv.length < 6) continue;
    for (const sc of findScenarios(candles, osc, bands, pv, o).filter(x => x.valid && isWave5Live(x))) {
      const key = `${sc.points[4].i}|${sc.dir}`; if (seen.has(key)) continue; seen.add(key);
      const s = sc.dir === 'up' ? 1 : -1, entry = candles[t].close, stop = sc.points[4].price;
      const levels = sc.targets.wave5.levels.map(l => {
        const d = s * (l.price - entry);
        if (d <= 0) return { ratio: l.ratio, price: l.price, passed: true };
        const r = outcome(candles, t, s, l.price, stop, horizon);
        let base = 0;
        for (let k = 0; k < nullDraws; k++) base += outcome(candles, t, s, entry + s * d * (0.7 + 0.6 * rng()), stop, horizon).hit ? 1 : 0;
        return { ratio: l.ratio, price: l.price, passed: false, ...r, baseRate: base / nullDraws };
      });
      samples.push({ t, dir: sc.dir, p4i: sc.points[4].i, mode: sc.targets.wave5.mode, levels,
        features: scenarioFeaturesFull(candles, sc, t, STAT_TABLES, o, wf.timeTol ?? 0.15) });
    }
  }
  return samples;
}

/**
 * Kiểm chứng một bộ lọc: so tỷ lệ chạm mục tiêu của nhóm THỎA điều kiện với nhóm KHÔNG thỏa (cùng đối chứng ngẫu nhiên).
 * Ví dụ: evaluateFilter(samples, f => f.vol >= 0.6) cho biết xác nhận khối lượng có thật sự cải thiện kết quả không.
 */
export function evaluateFilter(samples, pred) {
  const yes = samples.filter(s => pred(s.features, s)), no = samples.filter(s => !pred(s.features, s));
  const A = summarizeSamples(yes).overall, B = summarizeSamples(no).overall;
  return { pass: A, fail: B, nPass: yes.length, nFail: no.length,
    deltaHitRate: A && B ? A.hitRate - B.hitRate : null, deltaLift: A && B && A.lift != null && B.lift != null ? A.lift - B.lift : null,
    note: 'Chỉ có ý nghĩa khi cả hai nhóm đều có đủ mẫu (khuyến nghị ≥ 100 mục tiêu mỗi nhóm, gộp nhiều mã).' };
}

// ───────────────────────────── 21. analyzeFull + kéo sóng đầy đủ ─────────────────────────────
/**
 * analyzeFull = analyzePro + khối lượng + thời gian. Xếp hạng lại kịch bản bằng DEFAULT_MODEL_FULL (hoặc pro.model),
 * thêm cửa sổ thời gian, hội tụ thời gian và ô thời gian–giá.
 * userOpts.pro.time = { tol }, userOpts.pro.timeTolBars (mặc định 3).
 */
export function analyzeFull(candles, userOpts = {}) {
  const pro0 = userOpts.pro || {}, topN = pro0.topN ?? 5, T = pro0.temperature ?? 1;
  const pr = analyzePro(candles, { ...userOpts, pro: { ...pro0, topN: Math.max(20, topN * 4) } });
  const endI = candles.length - 1, m = { ...DEFAULT_MODEL_FULL, ...(pro0.model || {}) }, vol = hasVolume(candles);
  const tol = pro0.time && pro0.time.tol != null ? pro0.time.tol : 0.15;
  pr.scenarios.forEach(sc => {
    sc.volume = vol ? scenarioVolume(candles, sc, endI) : { has: false, score: null, checks: {} };
    sc.time = timeProfile(sc, endI, { tol }); sc.timeTargets = timeTargets(sc, endI);
    const f = sc.features; f.vol = sc.volume.score ?? 0.5; f.time = sc.time.score ?? 0.5;
    sc.modelScore = m.bias + m.logp * f.logp + m.osc * f.osc + m.nest * f.nest + m.alt * f.alt + m.vol * f.vol + m.time * f.time;
  });
  if (pr.scenarios.length) {
    const mx = Math.max(...pr.scenarios.map(x => x.modelScore));
    const Z = pr.scenarios.reduce((a, x) => a + Math.exp((x.modelScore - mx) / T), 0);
    pr.scenarios.forEach(x => { x.weight = Math.exp((x.modelScore - mx) / T) / Z; });
    pr.scenarios.sort((a, b) => b.weight - a.weight); pr.scenarios.length = Math.min(topN, pr.scenarios.length);
  }
  const horizonI = endI + (pro0.projectBars ?? 20);
  pr.confluence = fibConfluence(pr.scenarios, { tolPct: pr.confluenceTol, horizonI });
  pr.timeConfluence = timeConfluence(pr.scenarios, { tolBars: pro0.timeTolBars ?? 3 });
  pr.timePriceCells = timePriceCells(pr.confluence, pr.timeConfluence);
  pr.hasVolume = vol;
  return pr;
}

/** Thời lượng đang kéo so với các sóng trước (theo tỷ lệ Fibonacci thời gian). */
export function timeDrag(anchors, cursor, tol = 0.15) {
  const n = anchors.length; if (n < 2 || n > 5 || cursor.i == null || anchors.some(a => a.i == null)) return null;
  const d = [null]; for (let k = 1; k < n; k++) d[k] = anchors[k].i - anchors[k - 1].i;
  const dur = cursor.i - anchors[n - 1].i;
  const refs = { 2: [['S1', 1]], 3: [['S1', 1]], 4: [['S2', 2], ['S3', 3]], 5: [['S1', 1], ['S3', 3]] }[n];
  const items = refs.map(([name, k]) => ({ vs: name, ...timeRatio(dur, d[k], tol) })).filter(x => x.ratio != null);
  return { wave: String(n), bars: dur, items, nullCoverage: timeNullCoverage(tol) };
}

/** fibDragPro + khối lượng của đoạn đang kéo + tỷ lệ thời gian. candles cần có volume để có phần khối lượng. */
export function fibDragFull(anchors, cursor, opts = {}, pro = null, candles = null) {
  const info = fibDragPro(anchors, cursor, opts, pro);
  if (!info) return info;
  const n = anchors.length;
  const td = timeDrag(anchors, cursor, opts.timeTol ?? 0.15);
  if (td && td.items.length) {
    info.time = td; const it = td.items[0];
    info.label += ` · thời gian ${td.bars} nến = ${it.ratio.toFixed(2)}×${it.vs}${it.within ? ` (≈${it.nearest})` : ''}`;
  }
  if (candles && hasVolume(candles) && cursor.i != null && anchors.every(a => a.i != null) && n >= 2 && n <= 5) {
    const cur = legStats(candles, anchors[n - 1].i, cursor.i), prev = legStats(candles, anchors[n - 2].i, anchors[n - 1].i);
    const base = baselineVol(candles, anchors[0].i, 50) || 1;
    if (cur && prev) {
      const rule = { 2: ['lower', 'sóng 2 nên co khối lượng so với sóng 1'], 3: ['higher', 'sóng 3 nên ≥ khối lượng sóng 1'],
        4: ['lower', 'sóng 4 nên co khối lượng so với sóng 3'], 5: ['lower', 'sóng 5 nên yếu hơn sóng 3'] }[n];
      let ref = prev;
      if (n === 5) ref = legStats(candles, anchors[2].i, anchors[3].i);
      if (n === 3) ref = legStats(candles, anchors[0].i, anchors[1].i);
      if (ref) {
        const pass = rule[0] === 'lower' ? cur.avg < ref.avg : cur.avg >= ref.avg;
        info.volume = { rel: cur.avg / base, vsRef: cur.avg / ref.avg, pass, rule: rule[1] };
        info.label += ` · KL ${pass ? 'đạt' : 'chưa đạt'} (${(cur.avg / ref.avg).toFixed(2)}× sóng tham chiếu)`;
      }
    }
  }
  return info;
}