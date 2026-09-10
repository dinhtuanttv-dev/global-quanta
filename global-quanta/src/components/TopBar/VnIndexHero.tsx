import { useEffect, useRef, useState } from 'react';
import Sparkline from './Sparkline';
import IndexCompareDropdown from './IndexCompareDropdown';
import { usePriceTick } from '../../hooks/usePriceTick';
import { usePriceFlash } from '../../hooks/usePriceFlash';
import { useIndicesCompare } from '../../hooks/useIndicesCompare';
import { generateCompareNote } from '../../utils/generateCompareNote';
import { formatSignedInt, formatPct } from '../../utils/formatNumber';
import type { VnIndexData } from '../../types';

interface Props {
  data: VnIndexData;
  valueMethodology?: string | null;
}

export default function VnIndexHero({ data, valueMethodology }: Props) {
  const livePrice = usePriceTick(data.value);
  const flash = usePriceFlash(Math.round(livePrice * 10));
  const up = data.changePct >= 0;
  const compare = useIndicesCompare();
  const note = generateCompareNote(data.changePct, compare);

  // FIX (2026-09-10): dropdown gio bam-de-mo (khong con ":hover" tu dong -
  // de bi kich hoat ngoai y muon khi chuot dung gan thanh dia chi phia
  // tren, gay "che mat thanh tab, khong dieu khien duoc" nhu da bao cao).
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div className="vn-hero" ref={rootRef}>
      <button
        type="button"
        className="vn-hero-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Xem so sánh VN-INDEX với HNX-Index, UPCOM"
      >
        <div className="vn-hero-main">
          <span className="vn-hero-name">VN-INDEX <span className="vn-hero-caret">{open ? '▴' : '▾'}</span></span>
          <div className="vn-hero-valrow">
            <span className={`vn-hero-val num ${flash ? `flash-${flash}` : ''}`}>{livePrice.toFixed(1)}</span>
            <span className={`vn-hero-chg num ${up ? 'up' : 'down'}`}>
              {formatSignedInt(data.changeAbs)} ({formatPct(data.changePct)})
            </span>
          </div>
        </div>
      </button>
      <Sparkline data={data.sparkline} width={76} height={28} color={up ? 'positive' : 'negative'} />
      <div className="vn-hero-meta">
        <span>KL <b>{data.volumeShares}</b></span>
        <span
          className={valueMethodology ? "vn-hero-gt-estimated" : undefined}
          title={valueMethodology ?? undefined}
        >
          GT <b>{data.valueVND}</b>{valueMethodology && <span className="vn-hero-info-icon">ⓘ</span>}
        </span>
      </div>
      {open && (
        <IndexCompareDropdown compare={compare} note={note} loading={compare.length === 0} onClose={() => setOpen(false)} />
      )}
    </div>
  );
}
