import { memo } from 'react';
import { formatPct } from '../../utils/formatNumber';
import type { IndexCompareItem } from '../../hooks/useIndicesCompare';

interface Props {
  compare: IndexCompareItem[];
  note: string;
  loading: boolean;
  onClose: () => void;
}

// FIX (2026-09-10): doi tu ":hover" (de bi kich hoat ngoai y muon khi chuot
// vo tinh dung gan VN-INDEX, VD sau khi go URL o thanh dia chi ngay phia
// tren) sang bam-de-mo/dong co chu dich, co nut dong ro rang - nguoi dung
// hoan toan kiem soat duoc, khong con bi "che mat thanh tab" ngoai y muon.
function IndexCompareDropdown({ compare, note, loading, onClose }: Props) {
  return (
    <div className="vn-hero-dropdown vn-hero-dropdown--open" onClick={(e) => e.stopPropagation()}>
      <div className="vhd-header">
        <div className="vhd-title">SO SÁNH CHỈ SỐ</div>
        <button type="button" className="vhd-close-btn" onClick={onClose} aria-label="Đóng">✕</button>
      </div>

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
