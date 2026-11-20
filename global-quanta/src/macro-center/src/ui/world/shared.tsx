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

const fmt1 = (v: number) => (Number.isFinite(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}` : '–');

/**
 * Column chart of signed values around a centre line. Highlighted columns get a darker background.
 * G4 (20/11/2026): trục Y (giá trị ở mép trên / 0 / mép dưới), nhãn trục X (xLabel), chú thích khi rê chuột trên từng cột
 * (giá trị + khoảng tin cậy) và bảng thay thế (tableCaption). Chỉ trình bày lại đúng các giá trị được truyền vào.
 */
export function ColumnChart(props: {
  values: number[]; scale: number; half?: number; highlight?: (i: number) => boolean; ci?: { lo: number; hi: number }[]; label: string;
  xLabel?: (i: number) => string; unit?: string; tableCaption?: string;
}) {
  const half = props.half ?? 60;
  const bars = columnBars(props.values, half, props.scale, props.ci);
  const unit = props.unit ?? '%';
  const edge = half / props.scale;
  const tip = (i: number) => `${props.xLabel ? `${props.xLabel(i)}: ` : ''}${fmt1(props.values[i])}${unit}${props.ci?.[i] ? ` (khoảng 90%: ${fmt1(props.ci[i].lo)} đến ${fmt1(props.ci[i].hi)}${unit})` : ''}`;
  return (
    <div className="cols-wrap">
      <div className="cols-y" aria-hidden="true" style={{ height: half * 2 }}>
        <span>{fmt1(edge)}{unit}</span><span>0</span><span>{fmt1(-edge)}{unit}</span>
      </div>
      <div className="cols-main">
        <div className="cols" style={{ height: half * 2 }} role="img" aria-label={props.label}>
          {bars.map((b, i) => (
            <span key={i} className={`col${props.highlight?.(i) ? ' hl' : ''}`} title={tip(i)}>
              <span className={`col-bar ${b.sign === '+' ? 'up' : 'down'}`} style={{ top: b.top, height: b.h }} />
              {b.ciTop !== undefined && <span className="col-ci" style={{ top: b.ciTop, height: b.ciH }} />}
              <span className="col-zero" style={{ top: half }} />
            </span>
          ))}
        </div>
        {props.xLabel && (
          <div className="cols-x" aria-hidden="true">
            {props.values.map((_, i) => <span key={i} className={props.highlight?.(i) ? 'hl' : undefined}>{props.xLabel!(i)}</span>)}
          </div>
        )}
      </div>
      {props.tableCaption && (
        <details className="cols-table">
          <summary>Xem dạng bảng</summary>
          <table>
            <caption className="sr-only">{props.tableCaption}</caption>
            <thead><tr><th scope="col">{props.xLabel ? 'Mốc' : '#'}</th><th scope="col">Giá trị ({unit})</th>{props.ci && <th scope="col">Khoảng 90%</th>}</tr></thead>
            <tbody>
              {props.values.map((v, i) => (
                <tr key={i}><th scope="row">{props.xLabel ? props.xLabel(i) : i}</th><td>{fmt1(v)}</td>{props.ci && <td>{props.ci[i] ? `${fmt1(props.ci[i].lo)} đến ${fmt1(props.ci[i].hi)}` : '–'}</td>}</tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

/** G4: chọn tầm nhìn dạng nút (thay <select>), dùng chung cho chế độ một kịch bản và so sánh. */
export function HorizonPills({ value, onChange, options = [1, 3, 6, 12], idPrefix }: { value: number; onChange: (h: number) => void; options?: number[]; idPrefix: string }) {
  return (
    <div className="frow">
      <span className="flabel" id={`${idPrefix}-lbl`}>Tầm nhìn</span>
      <div className="chips" role="group" aria-labelledby={`${idPrefix}-lbl`}>
        {options.map((h) => <button key={h} type="button" className="chip" aria-pressed={value === h} onClick={() => onChange(h)} data-testid={`${idPrefix}-${h}`}>{h} tháng</button>)}
      </div>
    </div>
  );
}

/** G4: khung chờ tải đúng hình khối thật (tránh trang nhảy khi dữ liệu về), kèm dòng trạng thái cho trình đọc màn hình. */
export function Skeleton({ kind, label, rows = 6 }: { kind: 'cards' | 'table' | 'chart' | 'grid'; label: string; rows?: number }) {
  return (
    <div className={`skel skel-${kind}`} aria-busy="true">
      <p className="sr-only" role="status">{label}</p>
      {kind === 'cards' && Array.from({ length: rows }, (_, i) => <span key={i} className="skel-card"><i /><i /><i /></span>)}
      {kind === 'table' && Array.from({ length: rows }, (_, i) => <span key={i} className="skel-row" />)}
      {kind === 'chart' && <span className="skel-chart" />}
      {kind === 'grid' && Array.from({ length: rows * 10 }, (_, i) => <span key={i} className="skel-cell" />)}
    </div>
  );
}

export function Notice({ text }: { text?: string }) {
  return text ? <p className="notice" role="note">{text}</p> : null;
}
