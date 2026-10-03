import { describe, expect, it } from 'vitest';
import { parseTimingSignals } from './timing-signals.schema';

const row = (over: Record<string, unknown> = {}) => ({
  ticker: 'REE', action: 'TOO_EARLY', tdToEx: 39, window: { entryFrom: -25, entryTo: -15, exitOffset: 3 }, expectedNetReturn: 0.01,
  nEvents: 10, fdrQValue: 0.05, confidence: 'LOW', dateStatus: 'ESTIMATED', earnings: { revenueGrowthYoY: 0.1, profitGrowthYoY: 0.2, conflict: 'NONE' }, ...over,
});
const bulk = (signals: unknown[]) => ({ version: 'v3-p5', asOf: '2026-10-03T00:00:00Z', signals });

describe('parseTimingSignals (danh mục ~300 mã)', () => {
  it('cửa sổ SAU GDKHQ (W4 +3..+6) hợp lệ', () => {
    const r = parseTimingSignals(bulk([row({ ticker: 'PNJ', action: 'IN_WINDOW', tdToEx: -4, window: { entryFrom: 3, entryTo: 6, exitOffset: 10 } })]));
    expect(r.ok && r.data.signals).toHaveLength(1);
  });
  it('một dòng sai hợp đồng chỉ bị bỏ riêng, không làm hỏng cả bảng', () => {
    const r = parseTimingSignals(bulk([row(), row({ ticker: 'BAD', earnings: { revenueGrowthYoY: 9, profitGrowthYoY: null, conflict: 'NONE' } }), row({ ticker: 'FPT' }), row()]));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.signals.map((s) => s.ticker)).toEqual(['REE', 'FPT']);
    expect(r.dropped).toHaveLength(2);
    expect(r.dropped[0]).toContain('BAD');
    expect(r.dropped[1]).toContain('trùng');
  });
  it('vỏ sai (thiếu asOf) vẫn báo lỗi', () => {
    expect(parseTimingSignals({ version: 'v', signals: [] }).ok).toBe(false);
  });
});
