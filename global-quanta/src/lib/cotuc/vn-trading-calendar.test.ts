import { describe, expect, it, vi } from 'vitest';
import fixture from './__fixtures__/vn-observed-holidays-2017-2026.json';
import { fetchGatewayHolidays, makeVnTradingCalendar, ruleHolidaySet, tetDate } from './vn-trading-calendar';
import { tradingDaysBetween, toDayNumber } from '../quant-cotuc';
import { vnHolidayCalendar } from './vn-holidays';

// Bộ kiểm chứng DÙNG CHUNG với Market Gateway và Project A (10 năm phiên VN-Index thật).
const OBSERVED = (fixture as { holidays: string[] }).holidays;
const UNPREDICTABLE = ['2018-01-23', '2018-01-24', '2018-12-31', '2019-04-29', '2024-04-29', '2025-05-02', '2026-01-02', '2026-08-31'];

describe('lịch nghỉ tự tính', () => {
  it('quy tắc vs 10 năm phiên thật: khớp 106/106, không đánh nhầm', () => {
    const rule = [...ruleHolidaySet(2017, 2026).keys()].filter((d) => d <= '2026-10-02');
    expect(rule.filter((d) => !OBSERVED.includes(d))).toEqual([]);
    expect(OBSERVED.filter((d) => !rule.includes(d))).toEqual(UNPREDICTABLE);
  });
  it('vnHolidayCalendar đếm đúng qua Tết mọi năm (2026, 2027)', () => {
    expect(tradingDaysBetween('2026-02-13', '2026-02-23', vnHolidayCalendar)).toBe(1);
    expect(tetDate(2027)).toBe('2027-02-06');
    expect(vnHolidayCalendar.isTradingDay(toDayNumber('2027-02-05')!)).toBe(false);
  });
  it('lớp Gateway bắt ngày nghỉ nối', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ from: '2026-01-01', to: '2026-12-31', holidays: [{ date: '2026-08-31' }, { date: '2026-09-01' }, { date: '2026-09-02' }] }))) as unknown as typeof fetch;
    const g = await fetchGatewayHolidays('https://gw.test', '2026-01-01', '2026-12-31', { fetchImpl });
    expect(tradingDaysBetween('2026-08-28', '2026-09-03', makeVnTradingCalendar(g))).toBe(1);
    expect(tradingDaysBetween('2026-08-28', '2026-09-03', vnHolidayCalendar)).toBe(2);
    const bad = await fetchGatewayHolidays('https://gw.test', 'a', 'b', { fetchImpl: (async () => new Response('x', { status: 500 })) as unknown as typeof fetch });
    expect(bad).toBeNull();
  });
});
