// TOPBAR — dải vĩ mô cuộn ngang (spec §6.3): nút ‹ › chỉ hiện khi còn ticker ngoài khung nhìn (không để mask che mất gợi ý),
// cuộn được bằng chuột / chạm / bàn phím (vùng cuộn nhận focus, phím ← →).
import { useCallback, useEffect, useRef, useState } from 'react';
import MacroTickerItem from './MacroTickerItem';
import type { Block, MacroData } from '../../hooks/useTopbar';

export default function MacroStrip({ blocks, labels }: { blocks: Block<MacroData>[]; labels: string[] }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState({ left: false, right: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdge({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);
  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener('scroll', update, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => { el.removeEventListener('scroll', update); ro?.disconnect(); };
  }, [update, blocks.length]);
  const by = (dx: number) => ref.current?.scrollBy({ left: dx, behavior: 'smooth' });
  return (
    <div className="tb-macro">
      {edge.left && <button type="button" className="tb-scroll tb-scroll-l" aria-label="Cuộn vĩ mô sang trái" onClick={() => by(-180)}>‹</button>}
      <div ref={ref} className="tickers ticker-strip" role="region" aria-label="Vĩ mô" tabIndex={0} data-testid="tb-macro-strip"
        onKeyDown={(e) => { if (e.key === 'ArrowRight') by(180); else if (e.key === 'ArrowLeft') by(-180); }}>
        {blocks.map((m, i) => <MacroTickerItem key={labels[i]} block={m} fallbackLabel={labels[i]} />)}
      </div>
      {edge.right && <button type="button" className="tb-scroll tb-scroll-r" aria-label="Cuộn vĩ mô sang phải" onClick={() => by(180)}>›</button>}
    </div>
  );
}
