// CH3 (29/10/2026) — "Quạt dự phóng có điều kiện" cho kỳ sự kiện hiện tại (D3: quạt lịch sử, gắn nhãn trung thực).
// Mẫu rất nhỏ (6–9 đợt) nên mỗi bước dùng ước lượng hợp với mẫu nhỏ:
//   1. Tương tự (analog): đường CAR theo ngày của từng đợt cũ từ mốc đầu tới "phiên hôm nay" so với kỳ hiện tại —
//      khoảng cách RMS; trọng số = nhân Gauss exp(−d²/2h²) (h = trung vị d, "median heuristic") × suy giảm theo thời gian
//      0,5^(tuổi / chu kỳ bán rã). Cỡ mẫu hiệu dụng Kish n_eff = (Σw)² / Σw².
//   2. Phân vị: Harrell–Davis CÓ TRỌNG SỐ (Akinshin 2023, "Weighted quantile estimators"): Q_p = Σ W_i x_(i),
//      W_i = I_{t_i}(a, b) − I_{t_{i−1}}(a, b), a = p(n*+1), b = (1−p)(n*+1), n* = n_eff, t_i = trọng số tích luỹ —
//      ổn định hơn phân vị thực nghiệm nhiều lần khi n nhỏ; trọng số đều -> đúng Harrell–Davis cổ điển (đối chiếu scipy).
//   3. Hiệu chỉnh phù hợp (CQR — Romano, Patterson & Candès 2019) bằng bỏ-một-đợt (LOO): điểm lệch s_j = max(lo_j − y_j, y_j − hi_j),
//      nới dải thêm Q = phần tử thứ ⌈(n+1)(1−α)⌉ của s -> bảo đảm độ phủ biên ≥ 1 − α dưới giả định hoán đổi được.
//      Báo cả độ phủ LOO trước / sau hiệu chỉnh. Không đủ mẫu (⌈(n+1)(1−α)⌉ > n) -> nói rõ, không nới giả.
//   4. Xác suất lãi ròng > 0 tới phiên thoát: hậu nghiệm Beta(1 + n_eff·p̂, 1 + n_eff·(1 − p̂)) với p̂ = tỉ lệ thắng có trọng số.
// Nguồn: tăng trưởng TƯƠNG LAI lấy từ CAR v3 (giá tổng lợi suất); đường QUÁ KHỨ tới hôm nay tính từ giá đóng cửa (chỉ trước sự kiện —
// chưa có cổ tức xen giữa). Tất cả là phân phối lịch sử có điều kiện, KHÔNG phải dự báo đã kiểm định.
import type { EventStudy } from "./timingSim";
import { eventIndex, type DailyBar } from "./timingSpace";

// ---------- hàm đặc biệt ----------
const LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < 8; i++) a += LANCZOS[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
/** Phân số liên tục của hàm beta không đầy đủ (Lentz cải tiến). */
function betacf(a: number, b: number, x: number): number {
  const FPMIN = 1e-300, EPS = 3e-16;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
/** Hàm beta không đầy đủ chuẩn hoá I_x(a, b). */
export function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

// ---------- ước lượng ----------
export const kish = (w: number[]) => { const s = w.reduce((a, b) => a + b, 0), s2 = w.reduce((a, b) => a + b * b, 0); return s2 > 0 ? (s * s) / s2 : 0; };

/** Phân vị Harrell–Davis có trọng số (Akinshin 2023). Trọng số đều -> HD cổ điển. */
export function weightedHD(xs: number[], ws: number[], p: number): number | null {
  const pairs = xs.map((x, i) => [x, ws[i]] as const).filter(([x, w]) => Number.isFinite(x) && w > 0).sort((a, b) => a[0] - b[0]);
  if (!pairs.length) return null;
  if (pairs.length === 1) return pairs[0][0];
  const tot = pairs.reduce((s, [, w]) => s + w, 0);
  const n = kish(pairs.map(([, w]) => w));
  const a = p * (n + 1), b = (1 - p) * (n + 1);
  let t = 0, prev = 0, q = 0;
  for (const [x, w] of pairs) { t += w / tot; const cur = ibeta(Math.min(1, t), a, b); q += (cur - prev) * x; prev = cur; }
  return q;
}

/** CAR log theo ngày (giá đóng cửa so VN-Index), neo 0 tại `from`; chỉ các phiên ≤ `to`. Map offset -> CAR. */
export function dailyCar(bars: DailyBar[], indexClose: Map<string, number>, center: number, from: number, to: number): Map<number, number> {
  const out = new Map<number, number>();
  const a = bars[center + from], ia = a ? indexClose.get(a.date) : undefined;
  if (!a?.close || !ia) return out;
  for (let k = from; k <= to; k++) {
    const b = bars[center + k], ib = b ? indexClose.get(b.date) : undefined;
    if (b?.close && ib) out.set(k, Math.log(b.close / a.close) - Math.log(ib / ia));
  }
  return out;
}

export interface FanPoint { offset: number; lo: number; mid: number; hi: number; loAdj: number | null; hiAdj: number | null }
export interface AnalogWeight { eventDate: string; distance: number | null; weight: number }
export interface AnalogFan {
  todayOff: number; anchorCar: number; level: number;
  weights: AnalogWeight[]; nEff: number; bandwidth: number | null;
  /** Lợi suất vượt tích luỹ (exp(CAR) − 1) dự phóng tại các mốc v3 sau hôm nay. */
  points: FanPoint[];
  /** Độ phủ LOO của dải tại phiên thoát: trước / sau hiệu chỉnh CQR (sau = LOO lồng, ngoài mẫu; null = không đủ mẫu). */
  coverage: { exitOffset: number; raw: number | null; adjusted: number | null; n: number } | null;
  /** Xác suất lãi ròng (sau phí) > 0 nếu mua HÔM NAY và thoát ở phiên thoát của cửa sổ. */
  pWin: { exitOffset: number; mean: number; lo: number; hi: number } | null;
  conformalFeasible: boolean;
}

export interface FanOpts { level?: number; halfLifeYears?: number; today?: string }

type EvPrep = { eventDate: string; pre: Map<number, number>; v3: Map<number, number> };

/** Trọng số analog của các đợt `pool` so với đường `cur` (đều nhau nếu không tính được khoảng cách). */
function analogWeights(pool: EvPrep[], cur: Map<number, number>, from: number, to: number, refDate: string, halfLife: number) {
  const ds = pool.map((e) => {
    let s = 0, n = 0;
    for (let k = from; k <= to; k++) { const a = e.pre.get(k), b = cur.get(k); if (a != null && b != null) { s += (a - b) ** 2; n++; } }
    return n >= 5 ? Math.sqrt(s / n) : null;
  });
  const valid = ds.filter((d): d is number => d != null).sort((a, b) => a - b);
  const h = valid.length ? Math.max(1e-4, valid[Math.floor(valid.length / 2)]) : null;
  const ref = Date.parse(refDate);
  const ws = pool.map((e, i) => {
    const age = Math.max(0, (ref - Date.parse(e.eventDate)) / (365.25 * 86_400_000));
    const kern = ds[i] == null || h == null ? 1 : Math.exp(-(ds[i]! ** 2) / (2 * h * h));
    return kern * 0.5 ** (age / halfLife);
  });
  return { ds, ws, h };
}

/** Dải phân vị có trọng số của tăng trưởng CAR từ `lastOff` tới mỗi mốc tương lai. */
function bandsFor(pool: EvPrep[], ws: number[], horizons: number[], lastOff: number, level: number) {
  return horizons.map((o) => {
    const xs: number[] = [], w: number[] = [];
    pool.forEach((e, i) => { const fut = e.v3.get(o), now = e.pre.get(lastOff); if (fut != null && now != null) { xs.push(fut - now); w.push(ws[i]); } });
    const a = (1 - level) / 2;
    return { offset: o, lo: weightedHD(xs, w, a), mid: weightedHD(xs, w, 0.5), hi: weightedHD(xs, w, 1 - a) };
  });
}

/**
 * Quạt dự phóng cho kỳ hiện tại. `lastOff` = phiên của nến ngày cuối (≤ 0, trước sự kiện). `exitOffset` = phiên thoát của cửa sổ đang xem.
 * Cần ≥ 4 đợt có đủ dữ liệu; nếu không -> null.
 */
export function analogFan(es: EventStudy, bars: DailyBar[], indexBars: DailyBar[], lastOff: number, exitOffset: number | null, opts: FanOpts = {}): AnalogFan | null {
  const level = opts.level ?? 0.8, halfLife = opts.halfLifeYears ?? 3;
  const offs = es.offsets, from = offs[0];
  if (lastOff > 0 || lastOff < from || !bars.length) return null;
  const idx = new Map(indexBars.filter((b) => b.close).map((b) => [b.date, b.close!]));
  // Kỳ hiện tại: nến cuối = phiên lastOff.
  const last = bars.length - 1;
  const cur = dailyCar(bars, idx, last - lastOff, from, lastOff);
  if (cur.size < 5 || !cur.has(lastOff)) return null;
  const prep: EvPrep[] = es.events.flatMap((e) => {
    const c = eventIndex(bars, e.eventDate);
    if (c < 0 || Date.parse(bars[c].date) - Date.parse(e.eventDate) > 5 * 86_400_000) return [];
    const pre = dailyCar(bars, idx, c, from, Math.min(lastOff, -1));
    if (!pre.has(lastOff)) return [];
    const v3 = new Map<number, number>();
    e.car.forEach((v, i) => { if (v != null) v3.set(offs[i], v); });
    return [{ eventDate: e.eventDate, pre, v3 }];
  });
  if (prep.length < 4) return null;
  const horizons = offs.filter((o) => o > lastOff);
  const refDate = opts.today ?? bars[last].date;
  const { ds, ws, h } = analogWeights(prep, cur, from, lastOff, refDate, halfLife);
  const raw = bandsFor(prep, ws, horizons, lastOff, level);

  // CQR bỏ-một-đợt: mỗi đợt j làm "kỳ hiện tại", dải dựng từ các đợt còn lại (trọng số tính lại theo đường của j).
  const alpha = 1 - level;
  const scores = new Map<number, number[]>(horizons.map((o) => [o, []]));
  const hitsRaw = new Map<number, { hit: number; n: number }>(horizons.map((o) => [o, { hit: 0, n: 0 }]));
  prep.forEach((pj, j) => {
    const pool = prep.filter((_, i) => i !== j);
    const wj = analogWeights(pool, pj.pre, from, lastOff, pj.eventDate, halfLife).ws;
    bandsFor(pool, wj, horizons, lastOff, level).forEach((b) => {
      const fut = pj.v3.get(b.offset), now = pj.pre.get(lastOff);
      if (fut == null || now == null || b.lo == null || b.hi == null) return;
      const y = fut - now;
      scores.get(b.offset)!.push(Math.max(b.lo - y, y - b.hi));
      const hr = hitsRaw.get(b.offset)!; hr.n++; if (y >= b.lo && y <= b.hi) hr.hit++;
    });
  });
  const conformalQ = (s: number[]) => { const k = Math.ceil((s.length + 1) * (1 - alpha)); return k <= s.length ? [...s].sort((a, b) => a - b)[k - 1] : null; };
  const anchor = cur.get(lastOff)!;
  const points: FanPoint[] = raw.filter((b) => b.lo != null && b.mid != null && b.hi != null).map((b) => {
    const q = conformalQ(scores.get(b.offset)!);
    return {
      offset: b.offset, lo: Math.expm1(anchor + b.lo!), mid: Math.expm1(anchor + b.mid!), hi: Math.expm1(anchor + b.hi!),
      loAdj: q == null ? null : Math.expm1(anchor + b.lo! - Math.max(0, q)), hiAdj: q == null ? null : Math.expm1(anchor + b.hi! + Math.max(0, q)),
    };
  });

  let coverage: AnalogFan["coverage"] = null;
  if (exitOffset != null && exitOffset > lastOff && scores.has(exitOffset)) {
    const s = scores.get(exitOffset)!, q = conformalQ(s), hr = hitsRaw.get(exitOffset)!;
    // Độ phủ SAU hiệu chỉnh đo ngoài mẫu (LOO lồng): Q tính lại khi bỏ đợt j rồi mới xét đợt j — không dùng lại chính điểm hiệu chỉnh.
    const nested = s.map((sj, j) => { const qj = conformalQ(s.filter((_, i) => i !== j)); return qj == null ? null : sj <= Math.max(0, qj) ? 1 : 0; });
    const ok = nested.filter((x): x is 0 | 1 => x != null);
    coverage = { exitOffset, n: s.length, raw: hr.n ? hr.hit / hr.n : null, adjusted: q == null || ok.length < s.length ? null : ok.reduce<number>((a, b) => a + b, 0) / ok.length };
  }
  let pWin: AnalogFan["pWin"] = null;
  if (exitOffset != null && exitOffset > lastOff) {
    let sw = 0, sWin = 0;
    const wv: number[] = [];
    prep.forEach((e, i) => { const fut = e.v3.get(exitOffset), now = e.pre.get(lastOff); if (fut == null || now == null) return; sw += ws[i]; wv.push(ws[i]); if (Math.expm1(fut - now) - es.costPerRoundTrip > 0) sWin += ws[i]; });
    if (sw > 0) {
      const ne = kish(wv), ph = sWin / sw, a = 1 + ne * ph, b = 1 + ne * (1 - ph);
      pWin = { exitOffset, mean: a / (a + b), lo: betaQuantile(0.05, a, b), hi: betaQuantile(0.95, a, b) };
    }
  }
  return {
    todayOff: lastOff, anchorCar: anchor, level, nEff: kish(ws), bandwidth: h,
    weights: prep.map((e, i) => ({ eventDate: e.eventDate, distance: ds[i], weight: ws[i] / ws.reduce((s, w) => s + w, 0) })),
    points, coverage, pWin, conformalFeasible: Math.ceil((prep.length + 1) * (1 - alpha)) <= prep.length,
  };
}

/** Phân vị Beta bằng chia đôi trên I_x(a, b) (60 vòng -> sai số < 1e-15). */
export function betaQuantile(p: number, a: number, b: number): number {
  let lo = 0, hi = 1;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (ibeta(m, a, b) < p) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
