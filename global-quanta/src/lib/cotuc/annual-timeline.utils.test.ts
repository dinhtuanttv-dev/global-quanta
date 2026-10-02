import { describe, expect, it } from 'vitest';
import {
  QUARTER_END_DOY,
  YEAR_DAYS,
  dayOfYear,
  densitySegments,
  elapsedDaysSinceQuarterEnd,
  fillOpacityForProbability,
  formatDoy,
  monthStartDoy,
  peakDensity,
  positionOnYear,
} from './annual-timeline.utils';
import type { AnnouncePredictive } from './announce-date-model';

const model: AnnouncePredictive = { mu: 30, scale: 5, dof: 6, n: 8 };

describe('dayOfYear / formatDoy', () => {
  it('mốc đầu/cuối năm và giữa năm', () => {
    expect(dayOfYear('2026-01-01')).toBe(0);
    expect(dayOfYear('2026-12-31')).toBe(364);
    expect(dayOfYear('2026-03-31')).toBe(QUARTER_END_DOY[1]);
    expect(dayOfYear('2026-06-30')).toBe(QUARTER_END_DOY[2]);
    expect(dayOfYear('2026-09-30')).toBe(QUARTER_END_DOY[3]);
  });
  it('29/2 năm nhuận không vượt biên; sai định dạng ⇒ null', () => {
    expect(dayOfYear('2024-02-29')).toBe(59); // quy về 1/3 của năm không nhuận, không ném lỗi
    expect(dayOfYear('29/2/2024')).toBeNull();
    expect(dayOfYear('2026-13-01')).toBeNull();
  });
  it('formatDoy là nghịch đảo của dayOfYear', () => {
    expect(formatDoy(0)).toBe('1/1');
    expect(formatDoy(89)).toBe('31/3');
    expect(formatDoy(364)).toBe('31/12');
    expect(formatDoy(dayOfYear('2026-07-15') as number)).toBe('15/7');
  });
  it('monthStartDoy kẹp tháng ngoài 1..12', () => {
    expect(monthStartDoy(1)).toBe(0);
    expect(monthStartDoy(12)).toBe(334);
    expect(monthStartDoy(99)).toBe(334);
    expect(monthStartDoy(-3)).toBe(0);
  });
});

describe('positionOnYear (vòng lịch)', () => {
  it('Q1 +20 ngày = 20/4; Q4 +28 ngày quay về tháng 1 (không vượt 364)', () => {
    expect(formatDoy(positionOnYear(1, 20))).toBe('20/4');
    const q4 = positionOnYear(4, 28);
    expect(q4).toBeLessThan(60);
    expect(formatDoy(q4)).toBe('28/1');
  });
  it('luôn nằm trong [0, 365) kể cả offset âm hoặc rất lớn', () => {
    for (const off of [-500, -1, 0, 1, 400, 5000]) {
      const p = positionOnYear(3, off);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(YEAR_DAYS);
    }
  });
});

describe('densitySegments', () => {
  it('Q1 không vòng lịch ⇒ đúng 1 đoạn, x tăng dần', () => {
    const segs = densitySegments(model, 1, 0, 60);
    expect(segs).toHaveLength(1);
    for (let i = 1; i < segs[0].length; i++) expect(segs[0][i].doy).toBeGreaterThan(segs[0][i - 1].doy);
  });
  it('Q4 công bố dài qua ranh giới năm ⇒ tách thành 2 đoạn (không có đường nối ngang cả năm)', () => {
    const segs = densitySegments({ mu: 30, scale: 8, dof: 6, n: 8 }, 4, 0, 80);
    expect(segs.length).toBe(2);
    expect(segs[1][0].doy).toBeLessThan(segs[0][segs[0].length - 1].doy);
  });
  it('mật độ đạt đỉnh gần mu và không âm', () => {
    const seg = densitySegments(model, 2, 0, 80)[0];
    const best = seg.reduce((a, b) => (b.density > a.density ? b : a));
    expect(best.doy).toBe(positionOnYear(2, 30));
    expect(seg.every((p) => p.density >= 0)).toBe(true);
  });
  it('peakDensity lấy lớn nhất qua mọi quý/đoạn', () => {
    const a = densitySegments(model, 1);
    const b = densitySegments({ ...model, scale: 2 }, 2); // hẹp hơn ⇒ đỉnh cao hơn
    expect(peakDensity([a, b])).toBeGreaterThan(peakDensity([a]));
    expect(peakDensity([])).toBe(0);
  });
});

describe('elapsedDaysSinceQuarterEnd', () => {
  it('sau cuối quý: số ngày đã trôi; trước cuối quý: tính từ cuối quý của năm trước', () => {
    expect(elapsedDaysSinceQuarterEnd('2026-04-20', 1)).toBe(20);
    expect(elapsedDaysSinceQuarterEnd('2026-01-28', 4)).toBe(28);
    expect(elapsedDaysSinceQuarterEnd('2026-02-01', 3)).toBe(dayOfYear('2026-02-01')! + YEAR_DAYS - QUARTER_END_DOY[3]);
    expect(elapsedDaysSinceQuarterEnd('bad', 1)).toBeNull();
  });
});

describe('fillOpacityForProbability', () => {
  it('null/NaN ⇒ mờ cố định 0,1; tăng theo xác suất; kẹp [0,12; 0,6]', () => {
    expect(fillOpacityForProbability(null)).toBe(0.1);
    expect(fillOpacityForProbability(Number.NaN)).toBe(0.1);
    expect(fillOpacityForProbability(0.9)).toBeGreaterThan(fillOpacityForProbability(0.6));
    expect(fillOpacityForProbability(0)).toBe(0.12);
    expect(fillOpacityForProbability(1)).toBe(0.6);
  });
});

import { doyToMonthPosition } from './annual-timeline.utils';

describe('doyToMonthPosition', () => {
  it('đầu tháng ↔ số nguyên, giữa tháng ↔ nửa, đơn điệu và nằm trong [1,13)', () => {
    expect(doyToMonthPosition(0)).toBeCloseTo(1, 10);
    expect(doyToMonthPosition(31)).toBeCloseTo(2, 10); // 1/2
    expect(doyToMonthPosition(334)).toBeCloseTo(12, 10); // 1/12
    expect(doyToMonthPosition(89)).toBeCloseTo(3 + 30 / 31, 8); // 31/3
    let prev = 0;
    for (let d = 0; d < 365; d += 5) {
      const v = doyToMonthPosition(d);
      expect(v).toBeGreaterThan(prev);
      expect(v).toBeLessThan(13);
      prev = v;
    }
  });
  it('ngoài biên được kẹp', () => {
    expect(doyToMonthPosition(-10)).toBeCloseTo(1, 10);
    expect(doyToMonthPosition(9999)).toBeLessThan(13);
  });
});
