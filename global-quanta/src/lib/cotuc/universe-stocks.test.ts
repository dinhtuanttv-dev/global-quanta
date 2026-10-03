import { describe, expect, it } from 'vitest';
import { buildUniverseStocks, trailingCashDividend, trailingYieldPct } from './universe-stocks';
import type { DividendLifecycleEvent } from '../../hooks/useDividendEvents';

const cash = (ticker: string, ex: string, v: number): DividendLifecycleEvent => ({
  ticker, eventType: 'CASH', eventTitleVi: '', publicDate: null, agmDate: null, exrightDate: ex, recordDate: null, settlementDate: null, valuePerShare: v, exerciseRatio: null,
});

describe('cổ tức 12 tháng + tỷ suất', () => {
  // MWG thật (VNDirect): 1.000đ GDKHQ 24/07/2025, 1.000đ 29/07/2026, 1.000đ 07/10/2026 (sắp tới).
  const ev = [cash('MWG', '2025-07-24', 1000), cash('MWG', '2026-07-29', 1000), cash('MWG', '2026-10-07', 1000), cash('MWG', '2026-07-29', 1000)];
  it('chỉ cộng đợt đã GDKHQ trong 365 ngày, bỏ trùng, bỏ đợt chưa tới', () => {
    expect(trailingCashDividend(ev, '2026-10-03')).toBe(1000);
    expect(trailingCashDividend(ev, '2026-10-08')).toBe(2000);
    expect(trailingCashDividend([], '2026-10-03')).toBeNull();
  });
  it('tỷ suất % làm tròn 1 chữ số; thiếu giá -> null', () => {
    expect(trailingYieldPct(2000, 80000)).toBe(2.5);
    expect(trailingYieldPct(2000, 0)).toBeNull();
    expect(trailingYieldPct(null, 80000)).toBeNull();
  });
});

describe('buildUniverseStocks', () => {
  it('bỏ mã đã có (17 mã gốc), điền ngày/giá/tỷ suất thật, đánh dấu isUniverseOnly', () => {
    const rows = buildUniverseStocks({
      universe: [{ ticker: 'FPT' }, { ticker: 'PNJ', name: 'Vàng bạc Phú Nhuận', industry: 'Bán lẻ', avgValue20: 2e11 }, { ticker: 'VIC', avgValue20: 1e9 }],
      exclude: new Set(['FPT']),
      lifecycleEventsMap: { PNJ: [cash('PNJ', '2026-05-20', 1400), cash('PNJ', '2025-12-10', 600)] },
      realDatesMap: { PNJ: { exDate: '2026-05-20', agmDate: '2026-04-20', paymentDate: '2026-06-05' } },
      prices: { PNJ: 80000 },
      today: '2026-10-03',
    });
    expect(rows.map((r) => r.ticker)).toEqual(['PNJ', 'VIC']);
    const pnj = rows[0];
    expect(pnj).toMatchObject({ name: 'Vàng bạc Phú Nhuận', sector: 'Bán lẻ', price: 80000, dividendYield: 2.5, dividendAmount: 1400,
      exDividendDate: '20/05/2026', agmDate: '20/04/2026', paymentDate: '05/06/2026', marketCap: 'Large', isUniverseOnly: true });
    expect(rows[1]).toMatchObject({ dividendYield: 0, exDividendDate: '', marketCap: 'Small' });
  });
});

import { isSpecialDividend } from './universe-stocks';
describe('cổ tức đặc biệt', () => {
  const ev = (pairs: [string, number][]) => pairs.map(([d, v]) => cash('X', d, v));
  it('12 tháng gần nhất ≥ 2× trung vị các năm trước -> ĐB', () => {
    expect(isSpecialDividend(ev([['2026-06-01', 5000], ['2025-06-01', 1500], ['2024-06-01', 1500], ['2023-06-01', 1200]]), '2026-10-03')).toBe(true);
    expect(isSpecialDividend(ev([['2026-06-01', 1600], ['2025-06-01', 1500], ['2024-06-01', 1500]]), '2026-10-03')).toBe(false);
  });
  it('thiếu lịch sử -> không gắn cờ', () => {
    expect(isSpecialDividend(ev([['2026-06-01', 9000]]), '2026-10-03')).toBe(false);
  });
});
