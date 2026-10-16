import type { EvidenceTier } from '../../world-types';
import { TIER_MEANING_VI } from '../../world-types';
import { ciBar, columnBars, tierLabelVi } from '../../world-view';

export function EvidenceChip({ tier }: { tier: EvidenceTier | 'pending' }) {
  const title = tier === 'pending' ? 'Chưa đủ phiên sau sự kiện để đo' : TIER_MEANING_VI[tier];
  return <span className={`ev ev-${tier}`} title={title}>{tierLabelVi(tier)}</span>;
}

/** Track centred at 0 with a confidence bar and a point; hollow point = interval contains 0. */
export function CiTrack({ est, lo, hi, range, label }: { est: number; lo: number; hi: number; range: number; label: string }) {
  const b = ciBar(est, lo, hi, range);
  return (
    <span className="ci-track" role="img" aria-label={label}>
      <span className="ci-zero" />
      <span className={`ci-bar ${b.sign === '+' ? 'up' : 'down'}`} style={{ left: `${b.lo}%`, width: `${b.w}%` }} />
      <span className={`ci-dot ${b.sign === '+' ? 'up' : 'down'}${b.conclusive ? '' : ' hollow'}`} style={{ left: `${b.pos}%` }} />
    </span>
  );
}

/** Column chart of signed values around a centre line. Highlighted columns get a darker background. */
export function ColumnChart(props: { values: number[]; scale: number; half?: number; highlight?: (i: number) => boolean; ci?: { lo: number; hi: number }[]; label: string }) {
  const half = props.half ?? 60;
  const bars = columnBars(props.values, half, props.scale, props.ci);
  return (
    <div className="cols" style={{ height: half * 2 }} role="img" aria-label={props.label}>
      {bars.map((b, i) => (
        <span key={i} className={`col${props.highlight?.(i) ? ' hl' : ''}`}>
          <span className={`col-bar ${b.sign === '+' ? 'up' : 'down'}`} style={{ top: b.top, height: b.h }} />
          {b.ciTop !== undefined && <span className="col-ci" style={{ top: b.ciTop, height: b.ciH }} />}
          <span className="col-zero" style={{ top: half }} />
        </span>
      ))}
    </div>
  );
}

export function Notice({ text }: { text?: string }) {
  return text ? <p className="notice" role="note">{text}</p> : null;
}
