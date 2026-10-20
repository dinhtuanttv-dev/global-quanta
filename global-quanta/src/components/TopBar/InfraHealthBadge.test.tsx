import { describe, expect, it } from 'vitest';
import { describeBudget, type DbBudget } from './InfraHealthBadge';

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
