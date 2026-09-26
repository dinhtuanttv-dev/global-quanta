import type { BacktestWindow, CyclePathsV3, CycleStatsV3 } from './timing-types';

export const MIN_BAND_N = 4; // dưới ngưỡng này không vẽ dải phân vị (quá ít đợt)
export const DEFAULT_X_DOMAIN: [number, number] = [-40, 15];

export interface CurvePoint {
  offset: number;
  n: number;
  mean: number | null;
  p5: number | null;
  p25: number | null;
  p75: number | null;
  p95: number | null;
}

/** Phân vị nội suy tuyến tính. `sorted` phải tăng dần. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Tổng hợp các đợt lịch sử thành trung bình + phân vị theo từng offset. Bỏ qua null/NaN. */
export function buildCurve(paths: CyclePathsV3): CurvePoint[] {
  return paths.offsets.map((offset, i) => {
    const vals = paths.eventPaths
      .map((e) => e.car[i])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (vals.length === 0) {
      return { offset, n: 0, mean: null, p5: null, p25: null, p75: null, p95: null };
    }
    const sorted = [...vals].sort((a, b) => a - b);
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    const band = vals.length >= MIN_BAND_N;
    return {
      offset,
      n: vals.length,
      mean,
      p5: band ? percentile(sorted, 0.05) : null,
      p25: band ? percentile(sorted, 0.25) : null,
      p75: band ? percentile(sorted, 0.75) : null,
      p95: band ? percentile(sorted, 0.95) : null,
    };
  });
}

/** Cửa sổ được chọn: phải khớp selectedWindowId VÀ có cờ selected (đã qua cổng thống kê). */
export function selectedWindow(stats: CycleStatsV3 | null): BacktestWindow | null {
  if (!stats || stats.selectedWindowId === null) return null;
  const w = stats.windows.find((x) => x.id === stats.selectedWindowId);
  return w && w.selected ? w : null;
}

export type Position =
  | 'UNKNOWN'
  | 'POST_EX'
  | 'NO_SIGNAL'
  | 'TOO_EARLY'
  | 'IN_WINDOW'
  | 'WINDOW_PASSED';

/**
 * Vị trí hiện tại so với vùng mua. Cùng quy ước với optimizeDividendTiming (v3, mục 2.2):
 * k = -tdToEx; k < 0: trước GDKHQ; k > 0: đã qua GDKHQ.
 */
export function positionOf(k: number | null, w: BacktestWindow | null): Position {
  if (k === null || !Number.isFinite(k)) return 'UNKNOWN';
  if (k > 0) return 'POST_EX';
  if (!w) return 'NO_SIGNAL';
  if (k < w.entryFrom) return 'TOO_EARLY';
  if (k <= w.entryTo) return 'IN_WINDOW';
  return 'WINDOW_PASSED';
}

export const POSITION_TEXT: Record<Position, string> = {
  UNKNOWN: 'Chưa có ngày GDKHQ',
  POST_EX: 'Đã qua GDKHQ',
  NO_SIGNAL: 'Chưa có thời điểm mua có lợi thế thống kê',
  TOO_EARLY: 'Chưa tới vùng mua',
  IN_WINDOW: 'Đang trong vùng mua',
  WINDOW_PASSED: 'Đã qua vùng mua',
};

/** Offset của một mốc so với GDKHQ (ngày GD). Cả hai đầu vào tính từ hôm nay. */
export function markerOffset(tdToTarget: number | null, tdToEx: number | null): number | null {
  if (tdToTarget === null || tdToEx === null) return null;
  return tdToTarget - tdToEx;
}

/** Độ đậm vùng mua theo kỳ vọng ròng cận dưới, giới hạn 0,10–0,35. */
export function shadeOpacity(lcb: number): number {
  if (!Number.isFinite(lcb)) return 0.1;
  return Math.max(0.1, Math.min(0.35, 0.1 + lcb * 8));
}

export function formatPct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return 'N/A';
  const s = (v * 100).toFixed(digits).replace('.', ',');
  return (v >= 0 ? '+' : '') + s + '%';
}

/** Vạch chia đẹp cho trục. */
export function niceTicks(lo: number, hi: number, target = 5): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / target;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let i = Math.ceil(lo / step); i * step <= hi + 1e-12; i++) out.push(i * step + 0); // +0 chuẩn hoá -0
  return out;
}

/** Miền trục X: theo offsets của paths; nếu không có paths thì mặc định, mở rộng để chứa cửa sổ và hôm nay. */
export function xDomain(
  paths: CyclePathsV3 | null,
  win: BacktestWindow | null,
  todayOffset: number | null,
): [number, number] {
  if (paths && paths.offsets.length > 1) {
    return [Math.min(...paths.offsets), Math.max(...paths.offsets)];
  }
  const vals = [...DEFAULT_X_DOMAIN];
  if (win) vals.push(win.entryFrom, win.entryTo, win.exitOffset);
  if (todayOffset !== null && Number.isFinite(todayOffset)) vals.push(todayOffset);
  return [Math.floor(Math.min(...vals) / 5) * 5, Math.ceil(Math.max(...vals) / 5) * 5];
}

/** Miền trục Y: bao gồm p5..p95, trung bình, đợt hiện tại và mốc 0. */
export function yDomain(curve: CurvePoint[], current: (number | null)[] | null): [number, number] {
  const vals: number[] = [];
  for (const p of curve) {
    for (const v of [p.mean, p.p5, p.p95]) if (v !== null && Number.isFinite(v)) vals.push(v);
  }
  for (const v of current ?? []) if (typeof v === 'number' && Number.isFinite(v)) vals.push(v);
  if (vals.length === 0) return [-0.05, 0.05];
  let lo = Math.min(0, ...vals);
  let hi = Math.max(0, ...vals);
  if (hi - lo < 0.02) {
    lo -= 0.01;
    hi += 0.01;
  }
  const pad = (hi - lo) * 0.06;
  return [lo - pad, hi + pad];
}

/** Dòng mô tả cho một offset (dùng cho thanh thông tin và trình đọc màn hình). */
export function describeOffset(
  p: CurvePoint | undefined,
  offset: number,
  current: number | null,
  w: BacktestWindow | null,
): string {
  const parts = [`k = ${offset}`];
  if (w && offset >= w.entryFrom && offset <= w.entryTo) parts.push('trong vùng mua');
  if (!p || p.mean === null) {
    parts.push('chưa có dữ liệu CAR');
  } else {
    parts.push(`CAR TB ${formatPct(p.mean)}`);
    if (p.p25 !== null && p.p75 !== null) parts.push(`25–75%: ${formatPct(p.p25)} đến ${formatPct(p.p75)}`);
    if (p.p5 !== null && p.p95 !== null) parts.push(`5–95%: ${formatPct(p.p5)} đến ${formatPct(p.p95)}`);
    parts.push(`n=${p.n}`);
  }
  if (current !== null) parts.push(`đợt này ${formatPct(current)}`);
  return parts.join(' · ');
}
