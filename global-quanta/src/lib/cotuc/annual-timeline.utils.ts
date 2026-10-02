import { announceDensity } from './announce-date-model';
import type { AnnouncePredictive } from './announce-date-model';
import type { ISODate, Quarter } from './timing-types';

/** Năm tham chiếu không nhuận: mọi vị trí trên trục 12 tháng là "ngày thứ mấy trong năm" (0..364). */
export const YEAR_DAYS = 365;
const MONTH_STARTS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]; // ngày bắt đầu mỗi tháng (năm không nhuận)
export const MONTH_LABELS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];

/** Ngày cuối kỳ báo cáo (lịch) theo quý, quy về ngày thứ mấy trong năm không nhuận: 31/3, 30/6, 30/9, 31/12. */
export const QUARTER_END_DOY: Record<Quarter, number> = { 1: 89, 2: 180, 3: 272, 4: 364 };

export function monthStartDoy(month1to12: number): number {
  return MONTH_STARTS[Math.min(11, Math.max(0, month1to12 - 1))];
}

/** Ngày thứ mấy trong năm (0-based) của một ISO date, quy về năm không nhuận (29/2 → 28/2). null nếu sai định dạng. */
export function dayOfYear(iso: ISODate): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const doy = MONTH_STARTS[month - 1] + day - 1;
  return Math.min(doy, YEAR_DAYS - 1);
}

/** Vị trí trên trục năm của ngày công bố = cuối kỳ + `offsetDays`, có vòng lịch (Q4 công bố tháng 1-2 → đầu trục). */
export function positionOnYear(quarter: Quarter, offsetDays: number): number {
  const raw = QUARTER_END_DOY[quarter] + offsetDays;
  return ((raw % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
}

export interface CurvePointXY {
  doy: number;
  density: number;
}

/**
 * Đường mật độ xác suất của ngày công bố trên trục năm, lấy mẫu mỗi `stepDays` ngày trong
 * [loDay, hiDay] ngày sau cuối kỳ. Trả về NHIỀU đoạn: một đoạn mới bắt đầu mỗi lần vị trí vòng
 * qua ranh giới năm (để vẽ Q4 trải từ tháng 12 sang tháng 1 mà không có đường nối ngang cả năm).
 */
export function densitySegments(model: AnnouncePredictive, quarter: Quarter, loDay = 0, hiDay = 100, stepDays = 1): CurvePointXY[][] {
  const segments: CurvePointXY[][] = [];
  let current: CurvePointXY[] = [];
  let prevDoy = -1;
  for (let d = loDay; d <= hiDay; d += stepDays) {
    const doy = positionOnYear(quarter, d);
    if (prevDoy >= 0 && doy < prevDoy) {
      segments.push(current);
      current = [];
    }
    current.push({ doy, density: announceDensity(model, d) });
    prevDoy = doy;
  }
  if (current.length) segments.push(current);
  return segments;
}

/** Mật độ lớn nhất trong mọi đoạn — dùng để chuẩn hoá chiều cao. */
export function peakDensity(segmentsPerQuarter: CurvePointXY[][][]): number {
  let peak = 0;
  for (const segs of segmentsPerQuarter) for (const seg of segs) for (const p of seg) if (p.density > peak) peak = p.density;
  return peak;
}

/** Số ngày từ cuối kỳ báo cáo GẦN NHẤT (≤ hôm nay) của `quarter` đến hôm nay — dùng làm `elapsedDays`. */
export function elapsedDaysSinceQuarterEnd(todayIso: ISODate, quarter: Quarter): number | null {
  const today = dayOfYear(todayIso);
  if (today === null) return null;
  const end = QUARTER_END_DOY[quarter];
  return today >= end ? today - end : today + YEAR_DAYS - end;
}

/** Độ đậm vùng theo xác suất phản ứng dương: null (không đủ bằng chứng) ⇒ mờ nhạt cố định. */
export function fillOpacityForProbability(mean: number | null): number {
  if (mean === null || !Number.isFinite(mean)) return 0.1;
  return Math.max(0.12, Math.min(0.6, 0.12 + (mean - 0.4) * 1.2));
}

export function formatDoy(doy: number): string {
  let m = 11;
  while (m > 0 && MONTH_STARTS[m] > doy) m--;
  return `${doy - MONTH_STARTS[m] + 1}/${m + 1}`;
}

/** Đổi ngày-trong-năm (0..364) sang vị trí tháng liên tục [1, 13): 0 → 1,0 (1/1); 31 → 2,0 (1/2); 364 → ~13,0. */
export function doyToMonthPosition(doy: number): number {
  const d = Math.min(YEAR_DAYS - 1e-9, Math.max(0, doy));
  let m = 11;
  while (m > 0 && MONTH_STARTS[m] > d) m--;
  const len = (m === 11 ? YEAR_DAYS : MONTH_STARTS[m + 1]) - MONTH_STARTS[m];
  return m + 1 + (d - MONTH_STARTS[m]) / len;
}
