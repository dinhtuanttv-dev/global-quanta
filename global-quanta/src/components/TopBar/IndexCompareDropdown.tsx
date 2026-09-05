import { memo } from 'react';
import { formatPct } from '../../utils/formatNumber';
import type { IndexCompareItem } from '../../hooks/useIndicesCompare';

interface Props {
  compare: IndexCompareItem[];
  note: string;
  loading: boolean;
}

function IndexCompareDropdown({ compare, note, loading }: Props) {
  return (
    <div className="vn-hero-dropdown">
      <div className="vhd-title">SO SÁNH CHỈ SỐ</div>

      {loading && compare.length === 0 && (
        <div className="vhd-skeleton">
          {[0, 1, 2].map((i) => <div className="vhd-skeleton-row" key={i} />)}
        </div>
      )}

      {compare.length > 0 && (
        <div className="vhd-rows">
          {compare.map((c) => (
            <div className="vhd-row" key={c.index}>
              <span className="vhd-row-label">{c.index}</span>
              <span className="num vhd-row-val">{c.value.toLocaleString('vi-VN')}</span>
              <span className={`num vhd-row-chg ${c.changePct >= 0 ? 'up' : 'down'}`}>
                <span className="vhd-row-arrow">{c.changePct >= 0 ? '▲' : '▼'}</span>
                {formatPct(c.changePct)}
              </span>
            </div>
          ))}
        </div>
      )}

      {compare.length === 0 && !loading && (
        <div className="vhd-empty">Chưa có dữ liệu so sánh — thử lại sau.</div>
      )}

      <div className="vhd-note">
        <span className="vhd-note-icon">◆</span>
        {note}
      </div>
    </div>
  );
}

export default memo(IndexCompareDropdown);
