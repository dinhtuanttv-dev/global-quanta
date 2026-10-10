// Port từ locnganh-timing-engine (ui/decision/DecisionBar.test.tsx).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '../../../../test/rtl-lite';
import { DecisionBar } from './SectorDecisionBar';
import type { DecisionState } from '../../../../lib/locnganh/types';

afterEach(cleanup);

function state(o: Partial<DecisionState> = {}): DecisionState {
  return {
    level: 'FAVORABLE',
    headline: 'Thuận lợi để vào — xác suất tổng hợp 72%',
    checks: [
      { key: 'inWindow', label: 'Đang trong vùng mua', passed: true, detail: 'Đang trong vùng mua' },
      { key: 'probability', label: 'Xác suất tổng hợp đủ cao', passed: true, detail: '72%' },
      { key: 'liquidity', label: 'Thanh khoản đủ', passed: null, detail: 'Chưa kiểm tra' },
    ],
    combinedProbability: 0.72,
    disclaimer: 'NOT_INVESTMENT_ADVICE',
    ...o,
  };
}

describe('DecisionBar', () => {
  it('FAVORABLE: chữ "Thuận lợi để vào", màu xanh (data-level), có phần trăm', () => {
    render(<DecisionBar state={state()} />);
    const bar = screen.getByTestId('decision-bar');
    expect(bar.getAttribute('data-level')).toBe('FAVORABLE');
    expect(screen.getByTestId('decision-word').textContent).toBe('Thuận lợi để vào');
    expect(bar.textContent).toContain('72%');
  });

  it('KHÔNG BAO GIỜ dùng chữ "MUA" — dùng "Thuận lợi để vào" để tránh hiểu là lệnh', () => {
    render(<DecisionBar state={state()} />);
    expect(document.body.textContent!.toUpperCase()).not.toContain('MUA NGAY');
    expect(screen.getByTestId('decision-word').textContent).not.toMatch(/^MUA$/i);
  });

  it('WATCH: hiển thị "Quan sát"', () => {
    render(<DecisionBar state={state({ level: 'WATCH', headline: 'Quan sát — còn thiếu: Xác suất tổng hợp đủ cao' })} />);
    expect(screen.getByTestId('decision-word').textContent).toBe('Quan sát');
    expect(screen.getByTestId('decision-bar').getAttribute('data-level')).toBe('WATCH');
  });

  it('AVOID: hiển thị "Chưa nên"', () => {
    render(<DecisionBar state={state({ level: 'AVOID', headline: 'Chưa nên vào — Đã qua sự kiện' })} />);
    expect(screen.getByTestId('decision-word').textContent).toBe('Chưa nên');
  });

  it('checklist hiện đúng dấu ✔/✖/· theo passed true/false/null', () => {
    render(<DecisionBar state={state()} />);
    const rows = screen.getAllByTestId('decision-check-row');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('✔');
    expect(rows[2].textContent).toContain('·'); // liquidity: passed = null
  });

  it('luôn hiện headline và disclaimer', () => {
    render(<DecisionBar state={state()} />);
    expect(screen.getByTestId('decision-headline').textContent).toContain('Thuận lợi để vào');
    expect(document.body.textContent).toContain('không phải khuyến nghị đầu tư');
  });

  it('checklist rỗng vẫn render được, không crash', () => {
    render(<DecisionBar state={state({ checks: [] })} />);
    expect(screen.queryAllByTestId('decision-check-row')).toHaveLength(0);
  });
});
