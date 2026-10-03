import { describe, expect, it } from 'vitest';
import type { TimelineRow } from './cotuc/buy-timeline';
import { buyWindowEvents, pickRadarBuyRows, ringOf, upcomingBuyChips } from './radarTimeline';

const row = (over: Partial<TimelineRow>): TimelineRow => ({
  id: `${over.ticker ?? 'FPT'}:${over.windowId ?? 'w3'}:${over.kind ?? 'DIVIDEND'}`, ticker: 'FPT', sector: null, kind: 'DIVIDEND', tier: 'VALIDATED', status: 'UPCOMING',
  eventLabel: 'GDKHQ', eventDate: '2026-11-20', eventDateBasis: 'ESTIMATED', windowId: 'w3', windowLabel: 'W3', entryFrom: -25, entryTo: -15, exitOffset: 3,
  entryFromDate: '2026-10-16', entryToDate: '2026-10-30', exitDate: '2026-11-25', sessionsToEntry: 9, nEvents: 9, winRate: 0.78, probability: null,
  netExpectancy: 0.024, netExpectancyLcb: 0.01, fdrQValue: 0.05, decisionLevel: null, missing: [], ...over,
});

describe('chỉ mã CÓ TRÊN RADAR mới được tích hợp', () => {
  const rows = [
    row({ ticker: 'FPT' }),
    row({ ticker: 'VCB', kind: 'EARNINGS', tier: 'NEAR', windowId: 'e1', sessionsToEntry: 4, entryFromDate: '2026-10-09', missing: ['q-value 0.99 > 0.1'] }),
    row({ ticker: 'PNJ', status: 'IN_WINDOW', sessionsToEntry: 0, entryFromDate: '2026-10-01' }),
    row({ ticker: 'MWG', status: 'PASSED' }),
  ];

  it('mã trong Timeline nhưng không có trên Radar bị bỏ qua hoàn toàn', () => {
    const m = pickRadarBuyRows(rows, ['FPT', 'HPG', 'MWG']);
    expect([...m.keys()]).toEqual(['FPT']); // VCB, PNJ không trên Radar; MWG đã qua vùng mua
    expect(pickRadarBuyRows(rows, []).size).toBe(0);
  });

  it('mỗi mã lấy vùng mua đáng nói nhất: trong vùng > đạt kiểm định > sớm hơn', () => {
    const m = pickRadarBuyRows([
      row({ ticker: 'FPT', tier: 'NEAR', entryFromDate: '2026-10-06', sessionsToEntry: 1, kind: 'EARNINGS' }),
      row({ ticker: 'FPT', entryFromDate: '2026-10-16' }),
      row({ ticker: 'FPT', status: 'IN_WINDOW', tier: 'NEAR', kind: 'EARNINGS', windowId: 'e2' }),
    ], ['fpt']);
    expect(m.get('FPT')!.row.status).toBe('IN_WINDOW');
    const m2 = pickRadarBuyRows([row({ ticker: 'FPT', tier: 'NEAR', entryFromDate: '2026-10-06' }), row({ ticker: 'FPT', entryFromDate: '2026-10-16' })], ['FPT']);
    expect(m2.get('FPT')!.row.tier).toBe('VALIDATED');
  });

  it('vòng: trong vùng / ≤ 5 phiên / gần đạt / còn xa', () => {
    expect(ringOf(row({ status: 'IN_WINDOW' }))).toBe('in');
    expect(ringOf(row({ sessionsToEntry: 5 }))).toBe('soon');
    expect(ringOf(row({ sessionsToEntry: 9 }))).toBe('later');
    expect(ringOf(row({ tier: 'NEAR', status: 'IN_WINDOW' }))).toBe('near');
  });

  it('dải 10 phiên tới chỉ gồm mã trên Radar, trong vùng hoặc ≤ 10 phiên', () => {
    const m = pickRadarBuyRows([...rows, row({ ticker: 'HPG', sessionsToEntry: 25, entryFromDate: '2026-11-10' })], ['FPT', 'VCB', 'PNJ', 'HPG']);
    expect(upcomingBuyChips(m).map((x) => x.row.ticker)).toEqual(['PNJ', 'VCB', 'FPT']);
  });

  it('sự kiện/thông báo chỉ cho bậc đạt kiểm định; khoá thông báo gắn vùng mua (không lặp mỗi ngày)', () => {
    const m = pickRadarBuyRows([
      row({ ticker: 'PNJ', status: 'IN_WINDOW', entryFromDate: '2026-10-01' }),
      row({ ticker: 'FPT', sessionsToEntry: 2 }),
      row({ ticker: 'VCB', tier: 'NEAR', status: 'IN_WINDOW' }),
      row({ ticker: 'HPG', sessionsToEntry: 7 }),
    ], ['PNJ', 'FPT', 'VCB', 'HPG']);
    const ev = buyWindowEvents(m);
    expect(ev.map((e) => `${e.kind}:${e.ticker}`)).toEqual(['enter_buy_window:PNJ', 'buy_window_soon:FPT']);
    expect(ev[0].text).toBe('PNJ vào vùng mua cổ tức W3 (01/10→30/10)');
    expect(ev[0].notifyKey).toBe('buy-in|PNJ|DIVIDEND|2026-10-01');
  });
});
