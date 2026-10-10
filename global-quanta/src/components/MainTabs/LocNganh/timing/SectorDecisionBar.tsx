// Port từ locnganh-timing-engine (ui/decision/DecisionBar.tsx).
import type { DecisionLevel, DecisionState } from '../../../../lib/locnganh/types';

/**
 * DecisionBar — "người dùng chỉ cần nhìn vào là biết khi nào nên mua, khi nào nên quan sát".
 * Nhận thẳng DecisionState đã tính sẵn (backend/decision-engine/compute-decision-state.ts).
 * Không tự suy luận gì thêm — mọi logic quyết định nằm ở tầng tính toán, component này chỉ hiển thị.
 */
const LEVEL_STYLE: Record<DecisionLevel, { bg: string; fg: string; icon: string; word: string }> = {
  FAVORABLE: { bg: 'var(--ct-buy, #1e9e5a)', fg: '#fff', icon: '●', word: 'Thuận lợi để vào' },
  WATCH: { bg: 'var(--ct-warn, #c47a00)', fg: '#fff', icon: '●', word: 'Quan sát' },
  AVOID: { bg: 'var(--ct-grid, #dde3e9)', fg: 'var(--ct-fg, #333)', icon: '○', word: 'Chưa nên' },
};

function CheckRow({ label, passed, detail }: { label: string; passed: boolean | null; detail: string }) {
  const mark = passed === true ? '✔' : passed === false ? '✖' : '·';
  const color = passed === true ? 'var(--ct-buy, #1e9e5a)' : passed === false ? 'var(--ct-today, #d6336c)' : 'var(--ct-muted, #5d6b78)';
  return (
    <li data-testid="decision-check-row" style={{ display: 'flex', gap: 6, fontSize: 12, padding: '1px 0', alignItems: 'baseline' }}>
      <span aria-hidden style={{ color, width: 14, flexShrink: 0 }}>
        {mark}
      </span>
      <span>
        <strong>{label}:</strong> {detail}
      </span>
    </li>
  );
}

export interface DecisionBarProps {
  state: DecisionState;
  ticker?: string;
  className?: string;
}

export function DecisionBar({ state, ticker, className }: DecisionBarProps) {
  const style = LEVEL_STYLE[state.level];
  return (
    <section className={className} aria-label={ticker ? `Trạng thái quyết định — ${ticker}` : 'Trạng thái quyết định'}>
      <div
        data-testid="decision-bar"
        data-level={state.level}
        role="status"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          borderRadius: 8,
          background: style.bg,
          color: style.fg,
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        <span aria-hidden>{style.icon}</span>
        <span data-testid="decision-word">{style.word}</span>
        <span style={{ fontWeight: 400, fontSize: 12, opacity: 0.9 }}>· {Math.round(state.combinedProbability * 100)}%</span>
      </div>

      <p data-testid="decision-headline" style={{ fontSize: 13, margin: '6px 0' }}>
        {state.headline}
      </p>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {state.checks.map((c) => (
          <CheckRow key={c.key} label={c.label} passed={c.passed} detail={c.detail} />
        ))}
      </ul>

      <p style={{ fontSize: 11, color: 'var(--ct-muted, #5d6b78)', margin: '8px 0 0' }}>
        Đây là thông tin định lượng tham khảo, không phải khuyến nghị đầu tư.
      </p>
    </section>
  );
}

export default DecisionBar;
