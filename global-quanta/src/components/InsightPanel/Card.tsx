import { useState, type ReactNode } from 'react';

// Khung thẻ thống nhất với tab Siêu Quét AI: nền tối trong suốt, viền mảnh, bo góc, tiêu đề cyan,
// chip AI tím; thu gọn được (nhớ theo trình duyệt).
export const CARD_STYLE = { background: 'rgba(13,17,26,0.75)', border: '1px solid rgba(255,255,255,0.06)' } as const;

export function AiChip() {
  return <span className="text-[9px] font-semibold px-1.5 py-px rounded border border-violet-500/40 bg-violet-500/15 text-violet-200">AI</span>;
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
          className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-cyan-400 hover:text-cyan-300 focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400 rounded">
          <span className="text-[10px] text-slate-500 w-2">{collapsed ? '▸' : '▾'}</span>
          {title}
        </button>
        {right && <div className="ml-auto flex min-w-0 max-w-full items-center gap-2">{right}</div>}
      </div>
      {!collapsed && <div className="px-3 pb-3">{children}</div>}
    </section>
  );
}
