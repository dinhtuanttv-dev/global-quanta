import { useState, type ReactNode } from 'react';

// Khung thẻ cột phải — QUANTA UI v2 U2: tiêu đề theo chuẩn nút tab menu chính (.q-title: Inter 13px / 600, chữ thường), chip AI trung tính;
// thu gọn được (nhớ theo trình duyệt).
export const CARD_STYLE = { background: 'var(--q-surface-2)', border: '1px solid var(--q-line-2)' } as const;

export function AiChip() {
  return <span className="text-[11px] font-semibold px-1.5 py-px rounded border border-white/15 bg-white/5 text-q-text-2">AI</span>;
}

export default function Card({ id, title, right, children, className = '' }: { id: string; title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  const key = `gq.insight.collapsed.${id}`;
  const [collapsed, setCollapsed] = useState(() => { try { return window.localStorage.getItem(key) === '1'; } catch { return false; } });
  const toggle = () => {
    setCollapsed((v) => { try { window.localStorage.setItem(key, v ? '0' : '1'); } catch { /* bỏ qua */ } return !v; });
  };
  return (
    <section className={`rounded-xl ${className}`} style={CARD_STYLE} aria-label={typeof title === 'string' ? title : id}>
      <div className="flex flex-wrap items-center gap-2 px-3 pt-2.5 pb-2">
        <button type="button" onClick={toggle} aria-expanded={!collapsed}
          className="q-title flex items-center gap-2 whitespace-nowrap hover:text-q-accent-strong focus:outline-none focus-visible:ring-2 focus-visible:ring-q-accent rounded">
          <span className="text-[11px] text-q-text-3 w-2">{collapsed ? '▸' : '▾'}</span>
          {title}
        </button>
        {right && <div className="ml-auto flex min-w-0 max-w-full items-center gap-2">{right}</div>}
      </div>
      {!collapsed && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}
