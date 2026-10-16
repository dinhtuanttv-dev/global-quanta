// Phân tích chuyên sâu một mặt hàng (C2) — hàm thuần, có test. Chuỗi: [["YYYY-MM-DD" | "YYYY-MM", giá]] tăng dần theo ngày.
// Thống kê mô tả + biến động + quan hệ Việt Nam ↔ thế giới. Quan hệ là THĂM DÒ (tương quan lịch sử), không phải bằng chứng nhân quả.

export const DAILY = { year: 252, vol: 20, corr: 60, leadLag: 250, maxLag: 10 };
export const MONTHLY = { year: 12, vol: 12, corr: 36, leadLag: 60, maxLag: 3 };
const cfg = (freq) => (freq === "month" ? MONTHLY : DAILY);
const r4 = (x) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 1e4) / 1e4);
const pctChg = (a, b) => (a > 0 && b > 0 ? (b / a - 1) * 100 : null);

export function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN; }
export function std(a) {
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
export function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  const mx = mean(x.slice(0, n)), my = mean(y.slice(0, n));
  let c = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) { c += (x[i] - mx) * (y[i] - my); vx += (x[i] - mx) ** 2; vy += (y[i] - my) ** 2; }
  return vx > 0 && vy > 0 ? c / Math.sqrt(vx * vy) : null;
}

/** Lọc theo khoảng: "1y" | "3y" | "5y" | "10y" tính từ điểm cuối. */
export function sliceRange(points, range) {
  if (!points.length) return points;
  const years = { "1y": 1, "3y": 3, "5y": 5, "10y": 10 }[range] ?? 5;
  const last = points.at(-1)[0];
  const y = Number(last.slice(0, 4)) - years;
  const from = `${y}${last.slice(4)}`;
  return points.filter(([d]) => d > from);
}

/** Log lợi suất % giữa các điểm liền kề: [[ngày, r]]. */
export function logReturns(points) {
  const out = [];
  for (let i = 1; i < points.length; i++) if (points[i - 1][1] > 0 && points[i][1] > 0) out.push([points[i][0], Math.log(points[i][1] / points[i - 1][1]) * 100]);
  return out;
}

/** Giá trị gần nhất có ngày <= d (danh sách đã sắp xếp). */
function asOfLookup(points) {
  const dates = points.map((p) => p[0]);
  return (d, strict = false) => {
    let lo = 0, hi = dates.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (strict ? dates[m] < d : dates[m] <= d) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans < 0 ? null : points[ans][1];
  };
}

/** Quy đổi VND: ngày — tỷ giá của ngày đó (hoặc phiên gần nhất trước đó); tháng — trung bình tỷ giá trong tháng (khớp giá TB tháng của Pink Sheet). */
export function toVnd(points, fx, freq) {
  if (!fx?.length) return [];
  if (freq === "month") {
    const by = new Map();
    for (const [d, v] of fx) { const k = d.slice(0, 7); const a = by.get(k) ?? []; a.push(v); by.set(k, a); }
    return points.filter(([p]) => by.has(p)).map(([p, v]) => [p, v * mean(by.get(p))]);
  }
  const at = asOfLookup(fx);
  return points.map(([d, v]) => { const r = at(d); return r ? [d, v * r] : null; }).filter(Boolean);
}

/** Chuỗi ngày -> giá cuối tháng [["YYYY-MM", close]] (bỏ tháng hiện tại chưa đóng nếu `openPeriod`). */
export function monthEnd(points, openPeriod = null) {
  const by = new Map();
  for (const [d, v] of points) by.set(d.slice(0, 7), v);
  return [...by.entries()].filter(([p]) => p !== openPeriod);
}

/** Thống kê mô tả + biến động. */
export function describe(points, freq) {
  const c = cfg(freq);
  if (points.length < 2) return null;
  const [lastDate, last] = points.at(-1);
  const back = (k) => (points.length > k ? pctChg(points.at(-1 - k)[1], last) : null);
  const yearStart = points.filter(([d]) => d.slice(0, 4) < lastDate.slice(0, 4)).at(-1)?.[1] ?? null;
  const yr = points.slice(-c.year).map((p) => p[1]);
  const five = points.slice(-5 * c.year).map((p) => p[1]);
  const rets = logReturns(points).map((r) => r[1]);
  const ann = Math.sqrt(c.year);
  const volNow = rets.length >= c.vol ? std(rets.slice(-c.vol)) * ann : null;
  const volSeries = [];
  const lr = logReturns(points);
  for (let i = c.vol; i <= lr.length; i++) volSeries.push([lr[i - 1][0], r4(std(lr.slice(i - c.vol, i).map((x) => x[1])) * ann)]);
  const volAvg = volSeries.length ? mean(volSeries.slice(-5 * c.year).map((v) => v[1])) : null;
  const peak = Math.max(...five);
  const ddSeries = [];
  let runMax = -Infinity;
  for (const [d, v] of points.slice(-5 * c.year)) { runMax = Math.max(runMax, v); ddSeries.push([d, r4((v / runMax - 1) * 100)]); }
  const changes = freq === "month"
    ? { m1: back(1), m3: back(3), m6: back(6), y1: back(12), y3: back(36), ytd: pctChg(yearStart, last) }
    : { d1: back(1), w1: back(5), m1: back(21), m3: back(63), y1: back(252), ytd: pctChg(yearStart, last) };
  return {
    last, lastDate, changes: Object.fromEntries(Object.entries(changes).map(([k, v]) => [k, r4(v)])),
    high1y: Math.max(...yr), low1y: Math.min(...yr),
    percentile5y: r4((five.filter((v) => v <= last).length / five.length) * 100),
    zScore1y: yr.length > 2 ? r4((last - mean(yr)) / std(yr)) : null,
    drawdown5y: r4((last / peak - 1) * 100),
    vol: { now: r4(volNow), avg5y: r4(volAvg), window: c.vol, unitVi: freq === "month" ? `${c.vol} tháng, năm hoá` : `${c.vol} phiên, năm hoá` },
    volSeries, ddSeries,
    n: points.length,
  };
}

/**
 * Quan hệ giữa lợi suất phía Việt Nam (y, theo phiên/tháng VN) và lợi suất hàng hoá (x).
 * Ngày: x của phiên hàng hoá gần nhất TRƯỚC ngày VN (giá Mỹ/Âu đóng sau giờ VN — không dùng thông tin chưa biết).
 * Tháng: cùng tháng (lag 0) và các trễ 1..maxLag.
 * Trả tương quan hiện tại (cửa sổ corr), beta, tương quan cuộn, bảng trễ dẫn dắt và ngưỡng ~95% (±1,96/√n).
 */
export function relation(commodity, vn, freq) {
  const c = cfg(freq);
  const xr = logReturns(commodity), yr = logReturns(vn);
  if (xr.length < 10 || yr.length < 10) return null;
  let pairs;
  if (freq === "month") {
    const xm = new Map(xr);
    pairs = yr.filter(([p]) => xm.has(p)).map(([p, y]) => [p, xm.get(p), y]);
  } else {
    const at = asOfLookup(xr);
    pairs = yr.map(([d, y]) => { const x = at(d, true); return x == null ? null : [d, x, y]; }).filter(Boolean);
  }
  if (pairs.length < 10) return null;
  const win = pairs.slice(-c.corr);
  const xs = win.map((p) => p[1]), ys = win.map((p) => p[2]);
  const corr = pearson(xs, ys);
  const vx = std(xs) ** 2;
  const cov = xs.reduce((s, x, i) => s + (x - mean(xs)) * (ys[i] - mean(ys)), 0) / (xs.length - 1);
  const rolling = [];
  for (let i = c.corr; i <= pairs.length; i++) {
    const w = pairs.slice(i - c.corr, i);
    rolling.push([w.at(-1)[0], r4(pearson(w.map((p) => p[1]), w.map((p) => p[2])))]);
  }
  // trễ dẫn dắt: x dẫn y k kỳ (k = 0..maxLag) trên cửa sổ leadLag
  const ll = pairs.slice(-c.leadLag);
  const xsAll = ll.map((p) => p[1]), ysAll = ll.map((p) => p[2]);
  const leadLag = [];
  for (let k = 0; k <= c.maxLag; k++) {
    const x = xsAll.slice(0, xsAll.length - k), y = ysAll.slice(k);
    leadLag.push({ lag: k, r: r4(pearson(x, y)), n: x.length });
  }
  const band = 1.96 / Math.sqrt(Math.max(1, win.length));
  const best = leadLag.filter((l) => l.r != null).reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a), leadLag[0]);
  return {
    n: win.length, window: c.corr, corr: r4(corr), beta: vx > 0 ? r4(cov / vx) : null, band: r4(band),
    significant: corr != null && Math.abs(corr) > band,
    rolling: rolling.slice(-5 * c.year), leadLag, bestLag: best,
    basisVi: freq === "month"
      ? `Lợi suất tháng, ${win.length} tháng gần nhất; trễ = số tháng giá hàng hoá đi trước.`
      : `Lợi suất phiên, ${win.length} phiên gần nhất; giá hàng hoá lấy phiên TRƯỚC phiên Việt Nam; trễ = số phiên đi trước.`,
    exploratory: true,
  };
}

/** Quy về 100 tại điểm đầu chung của các chuỗi (để vẽ chung một trục). */
export function rebase(series, from) {
  return series.map((s) => {
    const pts = s.points.filter(([d]) => d >= from);
    const base = pts[0]?.[1];
    return { ...s, rebased: base > 0 ? pts.map(([d, v]) => [d, r4((v / base) * 100)]) : [] };
  });
}

/**
 * Chất lượng chuỗi: khoảng trống dài nhất (ngày lịch), số kỳ biến động |log r| > ngưỡng (10% ngày / 25% tháng) — với hợp đồng
 * tương lai kỳ gần, một phần là bước nhảy khi nối kỳ hạn, không phải biến động giá thật.
 */
export function quality(points, freq) {
  if (points.length < 2) return null;
  const toMs = (d) => (d.length === 7 ? Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, 1) : Date.parse(`${d}T00:00:00Z`));
  let maxGap = 0, gapAt = null;
  for (let i = 1; i < points.length; i++) { const g = (toMs(points[i][0]) - toMs(points[i - 1][0])) / 86_400_000; if (g > maxGap) { maxGap = g; gapAt = points[i - 1][0]; } }
  const thr = freq === "month" ? 25 : 10;
  const big = logReturns(points).filter(([, r]) => Math.abs(r) > thr);
  return { first: points[0][0], last: points.at(-1)[0], n: points.length, maxGapDays: Math.round(maxGap), maxGapAfter: gapAt, bigMoves: big.length, bigMoveThresholdPct: thr, lastBigMove: big.at(-1)?.[0] ?? null };
}

