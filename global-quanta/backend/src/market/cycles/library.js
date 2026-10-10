// Cycle Fingerprint v2 (CF2) — thư viện mẫu theo thời điểm (point-in-time) từ TOÀN BỘ universe.
//
// Mỗi phần tử = một cửa sổ W phiên của một mã kết thúc tại phiên e, kèm:
//   - z: log-giá chuẩn hoá z (W điểm) + PAA (lọc thô) + 5 đặc trưng bối cảnh (core.contextAt)
//   - y: lợi suất log VƯỢT VN-Index từ đóng cửa phiên e+1 tới e+1+h (h = 10/20/40/60)
//   - fwdEndCal: chỉ số lịch (theo VN-Index) của phiên e+1+60 — phần tử chỉ được dùng cho dự báo tại ngày t khi fwdEndCal < cal(t),
//     tức toàn bộ diễn biến 60 phiên sau của nó đã kết thúc TRƯỚC ngày dự báo (không nhìn trước).
// Phần tử được sắp tăng dần theo fwdEndCal -> tập dùng được tại t là một TIỀN TỐ (tìm nhị phân).
import { avgValue, contextAt, paa, zLogWindow } from "./core.js";

export const HORIZONS = Object.freeze([10, 20, 40, 60]);
export const H_MAX = 60;

/** Lịch chủ = các phiên của VN-Index; trả map ngày -> chỉ số và đặc trưng thị trường log(VNI/MA200). */
export function buildCalendar(benchBars) {
  const dates = benchBars.map((b) => b.date), closes = benchBars.map((b) => b.close);
  const calOf = new Map(dates.map((d, i) => [d, i]));
  const market = new Float64Array(dates.length);
  let s = 0;
  for (let i = 0; i < closes.length; i++) {
    s += closes[i]; if (i >= 200) s -= closes[i - 200];
    market[i] = i >= 199 ? Math.log(closes[i] / (s / 200)) : 0;
  }
  return { dates, closes, calOf, market };
}

/**
 * Chuẩn bị chuỗi từng mã: closes/values/dates, chỉ số lịch từng phiên (bỏ phiên không có trong lịch VN-Index),
 * lợi suất 60 phiên và trung vị lợi suất 60 phiên theo ngành tại từng ngày lịch.
 */
export function prepareSeries({ seriesOf, sectorOf, cal }) {
  const tickers = [], prepared = [];
  for (const [ticker, bars] of seriesOf) {
    const kept = bars.filter((b) => b.close > 0 && cal.calOf.has(b.date));
    if (kept.length < 320) continue;
    tickers.push(ticker);
    prepared.push({
      ticker, sector: sectorOf.get(ticker) ?? null,
      dates: kept.map((b) => b.date), closes: kept.map((b) => b.close),
      values: kept.map((b) => (b.value > 0 ? b.value : (b.volume ?? 0) * b.close)),
      cal: Int32Array.from(kept, (b) => cal.calOf.get(b.date)),
    });
  }
  // trung vị lợi suất log 60 phiên theo ngành × ngày lịch
  const bySector = new Map();
  for (const s of prepared) {
    if (!s.sector) continue;
    if (!bySector.has(s.sector)) bySector.set(s.sector, new Map());
    const m = bySector.get(s.sector);
    for (let e = 60; e < s.closes.length; e++) {
      const c = s.cal[e]; if (!m.has(c)) m.set(c, []);
      m.get(c).push(Math.log(s.closes[e] / s.closes[e - 60]));
    }
  }
  const sectorMedian = new Map();
  for (const [sec, m] of bySector) {
    const arr = new Float64Array(cal.dates.length).fill(NaN);
    for (const [c, xs] of m) { if (xs.length < 2) continue; xs.sort((a, b) => a - b); const k = xs.length >> 1; arr[c] = xs.length % 2 ? xs[k] : (xs[k - 1] + xs[k]) / 2; }
    sectorMedian.set(sec, arr);
  }
  return { tickers, prepared, sectorMedian };
}

/** Đặc trưng của cửa sổ kết thúc tại e (dùng cho cả phần tử thư viện lẫn truy vấn). */
export function windowFeatures(s, e, { W, M, cal, sectorMedian }) {
  if (e - W + 1 < 0) return null;
  const sm = s.sector ? sectorMedian.get(s.sector) : null;
  const med = sm ? sm[s.cal[e]] : NaN;
  const ctx = contextAt(s, e, { marketLogMa200: cal.market[s.cal[e]], sectorMedianRet60: Number.isFinite(med) ? med : null });
  if (!ctx) return null;
  const z = zLogWindow(s.closes, e - W + 1, e);
  return { z, paa: paa(z, M), ctx };
}

/** Lợi suất log vượt VN-Index từ đóng cửa e+1 tới e+1+h (null nếu thiếu). */
export function excessLog(s, e, h, cal) {
  const a = e + 1, b = e + 1 + h;
  if (b >= s.closes.length) return null;
  const ia = s.cal[a], ib = s.cal[b];
  return Math.log(s.closes[b] / s.closes[a]) - Math.log(cal.closes[ib] / cal.closes[ia]);
}

/**
 * Dựng thư viện. `stride` = bước giữa các điểm cuối cửa sổ (các cửa sổ liền kề gần như trùng nhau).
 * `minValue` = GTGD TB60 tối thiểu tại e (đồng). Trả cấu trúc mảng phẳng (Float32/Int32) đã sắp theo fwdEndCal.
 */
export function buildLibrary(prep, cal, { W = 30, M = 10, stride = 2, minValue = 5e9 } = {}) {
  const { prepared, sectorMedian } = prep;
  const rows = [];
  const sectorIds = new Map();
  prepared.forEach((s, tid) => {
    const sid = s.sector == null ? -1 : (sectorIds.has(s.sector) ? sectorIds.get(s.sector) : (sectorIds.set(s.sector, sectorIds.size), sectorIds.size - 1));
    for (let e = 251; e + 1 + H_MAX < s.closes.length; e += stride) {
      if (avgValue(s.values, e) < minValue) continue;
      const f = windowFeatures(s, e, { W, M, cal, sectorMedian });
      if (!f) continue;
      const y = HORIZONS.map((h) => excessLog(s, e, h, cal));
      if (y.some((v) => v == null || !Number.isFinite(v))) continue;
      const d = s.dates[e];
      rows.push({ tid, sid, endCal: s.cal[e], fwdEndCal: s.cal[e + 1 + H_MAX], month: Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1, f, y });
    }
  });
  rows.sort((a, b) => a.fwdEndCal - b.fwdEndCal || a.tid - b.tid || a.endCal - b.endCal);
  const N = rows.length, H = HORIZONS.length, C = 5;
  const lib = {
    W, M, N, H, C, stride, minValue,
    tickers: prepared.map((s) => s.ticker), sectors: [...sectorIds.keys()],
    tid: new Int32Array(N), sid: new Int16Array(N), endCal: new Int32Array(N), fwdEndCal: new Int32Array(N), month: new Int32Array(N),
    z: new Float32Array(N * W), paa: new Float32Array(N * M), ctx: new Float32Array(N * C), y: new Float32Array(N * H),
    // tổng tiền tố của y và số lần y > 0 (μ0, p0 theo thời điểm)
    ySum: new Float64Array((N + 1) * H), yUp: new Float64Array((N + 1) * H),
  };
  rows.forEach((r, i) => {
    lib.tid[i] = r.tid; lib.sid[i] = r.sid; lib.endCal[i] = r.endCal; lib.fwdEndCal[i] = r.fwdEndCal; lib.month[i] = r.month;
    lib.z.set(r.f.z, i * W); lib.paa.set(r.f.paa, i * M); lib.ctx.set(r.f.ctx, i * C); lib.y.set(r.y, i * H);
    for (let h = 0; h < H; h++) {
      lib.ySum[(i + 1) * H + h] = lib.ySum[i * H + h] + r.y[h];
      lib.yUp[(i + 1) * H + h] = lib.yUp[i * H + h] + (r.y[h] > 0 ? 1 : 0);
    }
  });
  return lib;
}

/** Số phần tử dùng được cho dự báo tại ngày lịch c (fwdEndCal < c) — tìm nhị phân trên mảng đã sắp. */
export function eligiblePrefix(lib, c) {
  let lo = 0, hi = lib.N;
  while (lo < hi) { const m = (lo + hi) >> 1; if (lib.fwdEndCal[m] < c) lo = m + 1; else hi = m; }
  return lo;
}
