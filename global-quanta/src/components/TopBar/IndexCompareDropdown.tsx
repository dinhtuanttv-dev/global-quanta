import type { VnIndexCompare } from '../../types';
import { formatPct } from '../../utils/formatNumber';

interface Props {
  compare: VnIndexCompare[];
  note: string;
}

export default function IndexCompareDropdown({ compare, note }: Props) {
  return (
    <div className="vn-hero-dropdown">
      <div className="vhd-title">SO SÁNH CHỈ SỐ</div>
      {compare.map((c) => (
        <div className="vhd-row" key={c.index}>
          <span>{c.index}</span>
          <span className="num">{c.value.toLocaleString('vi-VN')}</span>
          <span className={`num ${c.changePct >= 0 ? 'up' : 'down'}`}>{formatPct(c.changePct)}</span>
        </div>
      ))}
      <div className="vhd-note">⚠ {note}</div>
    </div>
  );
}
