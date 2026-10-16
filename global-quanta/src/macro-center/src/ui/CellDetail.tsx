import { fmtNum, fmtQ } from '../macro-filter';
import type { CellDetailPayload } from './types';

export function Sparkline({ values, band, label }: { values: number[]; band?: [number, number]; label: string }) {
  if (values.length < 2) return null;
  const W = 300;
  const H = 80;
  const all = [...values, ...(band ?? []), 0];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (values.length - 1)) * (W - 4) + 2;
  const y = (v: number) => H - 4 - ((v - lo) / span) * (H - 8);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} preserveAspectRatio="none">
      {band && <rect className="band" x="0" width={W} y={y(band[1])} height={Math.max(y(band[0]) - y(band[1]), 0)} />}
      <line className="zero" x1="0" x2={W} y1={y(0)} y2={y(0)} />
      <path className="line" d={d} />
    </svg>
  );
}

export function CellDetail(props: { detail: CellDetailPayload | null; loading: boolean; error: string | null; sentence: string; onClose: () => void }) {
  const { detail: d } = props;
  if (props.loading) return <p className="state" role="status">Đang tính độ ổn định và khoảng tin cậy…</p>;
  if (props.error) return <p className="state" role="alert">{props.error}</p>;
  if (!d) return <p className="state">Chọn một ô trong ma trận để xem chi tiết, độ ổn định theo thời gian và khoảng tin cậy.</p>;
  const first = d.rolling.dates[0];
  const last = d.rolling.dates[d.rolling.dates.length - 1];
  return (
    <div className="detail">
      <h2>{d.factor} → {d.target}</h2>
      <p>{props.sentence}</p>
      <dl>
        <dt>Hệ số β</dt><dd>{fmtNum(d.beta, 3)}</dd>
        <dt>Sai số chuẩn (HAC)</dt><dd>{fmtNum(d.se, 3)}</dd>
        <dt>Thống kê t</dt><dd>{fmtNum(d.t, 2)}</dd>
        <dt>p chưa hiệu chỉnh</dt><dd>{fmtQ(d.p)}</dd>
        <dt>Khoảng tin cậy bootstrap 95%</dt><dd>{fmtNum(d.bootstrapCI[0], 2)} đến {fmtNum(d.bootstrapCI[1], 2)}</dd>
        <dt>Số quan sát, độ trễ</dt><dd>{d.nobs}, {d.lag} tháng</dd>
      </dl>
      <Sparkline values={d.rolling.beta} label={`Hệ số β trượt 48 tháng của ${d.factor} lên ${d.target} từ ${first} đến ${last}`} band={d.bootstrapCI} />
      <p className="muted">Hệ số trượt 48 tháng, {first} đến {last}. Đường nét đứt là mức 0; vùng mờ là khoảng tin cậy toàn mẫu.</p>
      <button type="button" className="btn ghost" onClick={props.onClose}>Đóng chi tiết</button>
    </div>
  );
}
