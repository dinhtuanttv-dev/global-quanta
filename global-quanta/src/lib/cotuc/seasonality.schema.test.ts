import { describe, expect, it } from 'vitest';
import { parseAnnualEarningsCalendar, parseEarningsCycleStats } from './seasonality.schema';

const rp = (o: Record<string, unknown> = {}) => ({ alpha: 6, beta: 3, mean: 6 / 9, ci: [0.4, 0.88], level: 0.9, ...o });
const win = (o: Record<string, unknown> = {}) => ({
  id: 'W1', label: 'W1', entryFrom: -15, entryTo: -5, exitOffset: -1, holdsThroughEx: false,
  nEvents: 9, nEff: 8, meanCarRaw: 0.02, meanCarShrunk: 0.015, netExpectancy: 0.012, netExpectancyLcb: 0.004,
  winRate: 0.7, oosHitRate: null, oosMeanNet: null, fdrQValue: 0.05, selected: true, ...o,
});
const stats = (o: Record<string, unknown> = {}) => ({
  ticker: 'VNM', version: 'v1', asOf: '2026-09-26T00:00:00Z', eventType: 'EARNINGS', quarter: 1,
  windows: [win()], selectedWindowId: 'W1', adjustedPriceBasis: 'ADJ_CLOSE', benchmark: 'VNINDEX',
  reactionProbability: rp(), ...o,
});
const qs = (quarter: number, o: Record<string, unknown> = {}) => ({
  quarter, typicalAnnounceMonth: 4, announceMonthStd: 0.5, reactionProbability: rp(), nEvents: 5, dataStatus: 'CONFIRMED', ...o,
});
const cal = (o: Record<string, unknown> = {}) => ({
  ticker: 'VNM', version: 'v1', asOf: '2026-09-26T00:00:00Z', quarters: [qs(1), qs(2), qs(3), qs(4)], ...o,
});

describe('earningsCycleStatsV3Schema', () => {
  it('chấp nhận dữ liệu hợp lệ', () => {
    expect(parseEarningsCycleStats(stats()).ok).toBe(true);
  });
  it('NO_SIGNAL hợp lệ: không cửa sổ chọn ⇔ reactionProbability null', () => {
    expect(parseEarningsCycleStats(stats({ selectedWindowId: null, reactionProbability: null, windows: [win({ selected: false })] })).ok).toBe(true);
  });
  it('bịa xác suất khi không có tín hiệu bị từ chối', () => {
    const r = parseEarningsCycleStats(stats({ selectedWindowId: null, windows: [win({ selected: false })] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.join('\n')).toContain('không được bịa');
  });
  it('có cửa sổ chọn nhưng thiếu xác suất bị từ chối', () => {
    expect(parseEarningsCycleStats(stats({ reactionProbability: null })).ok).toBe(false);
  });
  it('eventType phải là EARNINGS; quarter 1..4', () => {
    expect(parseEarningsCycleStats(stats({ eventType: 'CASH' })).ok).toBe(false);
    expect(parseEarningsCycleStats(stats({ quarter: 5 })).ok).toBe(false);
    expect(parseEarningsCycleStats(stats({ quarter: 0 })).ok).toBe(false);
  });
  it('hậu nghiệm Beta phải nhất quán: mean sai, ci không chứa mean, ci ngoài [0,1]', () => {
    expect(parseEarningsCycleStats(stats({ reactionProbability: rp({ mean: 0.9 }) })).ok).toBe(false);
    expect(parseEarningsCycleStats(stats({ reactionProbability: rp({ ci: [0.7, 0.9] }) })).ok).toBe(false);
    expect(parseEarningsCycleStats(stats({ reactionProbability: rp({ ci: [0.4, 1.4] }) })).ok).toBe(false);
    expect(parseEarningsCycleStats(stats({ reactionProbability: rp({ alpha: 0 }) })).ok).toBe(false);
  });
  it('selectedWindowId trỏ sai hoặc trỏ cửa sổ selected=false bị từ chối', () => {
    expect(parseEarningsCycleStats(stats({ selectedWindowId: 'X' })).ok).toBe(false);
    expect(parseEarningsCycleStats(stats({ windows: [win({ selected: false })] })).ok).toBe(false);
  });
});

describe('annualEarningsCalendarV3Schema', () => {
  it('chấp nhận 4 quý đúng thứ tự, có/không announceModel', () => {
    expect(parseAnnualEarningsCalendar(cal()).ok).toBe(true);
    const withModel = cal({ quarters: [1, 2, 3, 4].map((q) => qs(q, { announceModel: { mu: 30, scale: 4, dof: 6, n: 5, ci90: [22, 38] } })) });
    expect(parseAnnualEarningsCalendar(withModel).ok).toBe(true);
  });
  it('thiếu quý / sai thứ tự bị từ chối', () => {
    expect(parseAnnualEarningsCalendar(cal({ quarters: [qs(1), qs(2), qs(3)] })).ok).toBe(false);
    expect(parseAnnualEarningsCalendar(cal({ quarters: [qs(2), qs(1), qs(3), qs(4)] })).ok).toBe(false);
  });
  it('tháng ngoài 1..12, std âm, dataStatus lạ bị từ chối', () => {
    expect(parseAnnualEarningsCalendar(cal({ quarters: [qs(1, { typicalAnnounceMonth: 13 }), qs(2), qs(3), qs(4)] })).ok).toBe(false);
    expect(parseAnnualEarningsCalendar(cal({ quarters: [qs(1, { announceMonthStd: -1 }), qs(2), qs(3), qs(4)] })).ok).toBe(false);
    expect(parseAnnualEarningsCalendar(cal({ quarters: [qs(1, { dataStatus: 'GUESS' }), qs(2), qs(3), qs(4)] })).ok).toBe(false);
  });
  it('announceModel sai (scale ≤ 0, ci90 ngược) bị từ chối', () => {
    const bad1 = cal({ quarters: [qs(1, { announceModel: { mu: 30, scale: 0, dof: 6, n: 5, ci90: [22, 38] } }), qs(2), qs(3), qs(4)] });
    const bad2 = cal({ quarters: [qs(1, { announceModel: { mu: 30, scale: 4, dof: 6, n: 5, ci90: [40, 20] } }), qs(2), qs(3), qs(4)] });
    expect(parseAnnualEarningsCalendar(bad1).ok).toBe(false);
    expect(parseAnnualEarningsCalendar(bad2).ok).toBe(false);
  });
  it('rác đầu vào không ném lỗi', () => {
    expect(parseAnnualEarningsCalendar(null).ok).toBe(false);
    expect(parseEarningsCycleStats('x').ok).toBe(false);
  });
});
