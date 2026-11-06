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
      exDividendDate: '20/05/2026', agmDate: '20/04/2026', paymentDate: '05/06/2026', isUniverseOnly: true });
    expect(rows[1]).toMatchObject({ dividendYield: 0, exDividendDate: '' });
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

import { calcCatalystScore, DIVIDEND_STOCKS, detectRiskFlags, filterVerdict, DEFAULT_FILTER, getTradePhase, riskDataReady } from '../quant-cotuc';
describe('BL0 dữ liệu sạch', () => {
  it('17 mã gốc không còn số liệu viết tay: mọi số = 0 / rỗng, không điểm xúc tác mặc định, không xu hướng', () => {
    expect(DIVIDEND_STOCKS).toHaveLength(17);
    for (const s of DIVIDEND_STOCKS) {
      expect([s.price, s.pe, s.roe, s.dividendYield, s.payoutRatio, s.debtEquity, s.growth, s.fscore, s.rsi, s.dividendAmount]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      expect([s.pros, s.cons, s.exDividendDate, s.paymentDate, s.agmDate, s.catalystScore, s.priceTrend]).toEqual([[], [], '', '', '', null, null]);
      expect(Object.keys(s)).not.toEqual(expect.arrayContaining(['agmAgenda']));
    }
  });
  it('không có dữ liệu thật -> không cảnh báo giả, không điểm xúc tác, bộ lọc xu hướng = thiếu dữ liệu', () => {
    const s = { ...DIVIDEND_STOCKS[0] };
    expect(riskDataReady(s)).toBe(false);
    expect(detectRiskFlags(s)).toEqual([]);
    expect(calcCatalystScore(s)).toBeNull();
    expect(filterVerdict(s, { ...DEFAULT_FILTER, trend: 'UP', hideStaleEvents: false })).toBe('MISSING_DATA');
    expect(filterVerdict({ ...s, priceTrend: 'UP' }, { ...DEFAULT_FILTER, trend: 'UP', hideStaleEvents: false })).toBe('PASS');
    expect(filterVerdict({ ...s, priceTrend: 'DOWN' }, { ...DEFAULT_FILTER, trend: 'UP', hideStaleEvents: false })).toBe('FAIL');
  });
  it('cảnh báo chỉ dùng số thật; giai đoạn "tăng nóng" cần xu hướng giá thật', () => {
    const s = { ...DIVIDEND_STOCKS[0], fundamentalsReal: true, pe: 25, debtEquity: 1.2, rsi: 65 };
    expect(detectRiskFlags(s)).toEqual(['Đòn bẩy nợ cao (>0.8x)', 'P/E cao hơn trung bình (>18x)']);
    const d = new Date(Date.now() + 10 * 864e5); const vn = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    expect(getTradePhase({ ...s, exDividendDate: vn, priceTrend: 'UP' }).status).toBe('RUN_UP');
    expect(getTradePhase({ ...s, exDividendDate: vn, priceTrend: null }).status).toBe('ACCUMULATION');
    expect(calcCatalystScore({ ...s, catalystScore: 6, priceTrend: 'UP' })).toBe(7.5); // 6 + 1,5 (xu hướng tăng); RSI 65 ngoài 45–62
  });
});
