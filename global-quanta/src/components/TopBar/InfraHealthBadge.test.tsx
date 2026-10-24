import { describe, expect, it } from 'vitest';
import { describeCotuc, describeBudget, type DbBudget } from './InfraHealthBadge';

const base: DbBudget = {
  supabaseEgress: {
    day: '2026-10-20',
    today: { mb: 4.2, requests: 120, blocked: 0 },
    budget: { softMb: 150, hardMb: 300, jobMb: 500, monthlyQuotaMb: 3584, status: 'ok' },
    monthToDate: { mb: 80, projectedMb: 210, quotaPct: 5.9 },
    byTag: [{ key: 'job:scanUniverse', mb: 2.1, requests: 30 }],
  },
  warehouse: { enabled: true, disk: true, ramMb: 40, ramCapMb: 96 },
};

describe('describeBudget', () => {
  it('xanh khi trong hạn mức, nêu kho đệm đĩa bền', () => {
    const b = describeBudget(base);
    expect(b.tone).toBe('ok');
    expect(b.label).toBe('● Kho 6%');
    expect(b.title).toContain('kho đệm đĩa bền');
  });
  it('vàng khi dự báo ≥ 80% hạn mức, đỏ khi bị chặn', () => {
    expect(describeBudget({ ...base, supabaseEgress: { ...base.supabaseEgress, monthToDate: { mb: 2000, projectedMb: 3100, quotaPct: 86.5 } } }).tone).toBe('warn');
    expect(describeBudget({ ...base, supabaseEgress: { ...base.supabaseEgress, budget: { ...base.supabaseEgress.budget, status: 'blocked' } } }).tone).toBe('blocked');
  });
});

describe('B4: sức khoẻ Timeline điểm mua', () => {
  const now = Date.parse('2026-10-26T05:00:00Z');
  const h = (over: Record<string, unknown> = {}) => ({
    store: { tables: { decision: { rows: 281, updatedAt: '2026-10-26T04:05:00Z' } } },
    buyTiming: { failures: 0, lastError: null, parity: { mismatches: 0, projectA: 40, gateway: 40, at: '2026-10-26T04:10:00Z' }, localError: null },
    scanner: { enabled: true, timing: { lastPassAt: null, pausedUntil: null, lastError: null } }, ...over,
  });
  it('bình thường: số mã, giờ cập nhật (giờ VN), khớp Project A', () => {
    expect(describeCotuc(h() as never, now)).toEqual({ ok: true, text: 'Timeline điểm mua: 281 mã, cập nhật 11:05 26/10 · khớp Project A' });
  });
  it('bất thường: kho rỗng / lệch Project A / quét tạm dừng', () => {
    expect(describeCotuc(h({ store: { tables: { decision: { rows: 0, updatedAt: null } } } }) as never, now).ok).toBe(false);
    expect(describeCotuc(h({ buyTiming: { failures: 0, lastError: null, localError: null, parity: { mismatches: 3, projectA: 40, gateway: 41, at: 'x' } } }) as never, now).text).toContain('lệch Project A 3 dòng');
    expect(describeCotuc(h({ scanner: { enabled: true, timing: { lastPassAt: null, pausedUntil: '2026-10-26T05:30:00Z', lastError: 'x' } } }) as never, now).text).toContain('quét tạm dừng tới 12:30 26/10');
  });
});
