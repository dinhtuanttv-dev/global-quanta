import { memo } from 'react';
import BadgeDot from './BadgeDot';
import PinIcon from './PinIcon';
import ReasonTag from './ReasonTag';
import SimilarToTag from './SimilarToTag';
import DeleteButton from './DeleteButton';
import { usePriceTick } from '../../hooks/usePriceTick';
import { formatPct } from '../../utils/formatNumber';
import type { WatchlistStock } from '../../types';

interface Props {
  stock: WatchlistStock;
  isActive: boolean;
  onSelect: (stock: WatchlistStock) => void;
  onTogglePin: (ticker: string) => void;
  onEditReason: (ticker: string, current: string | null) => void;
  onDelete: (ticker: string) => void;
  onContextMenu: (e: React.MouseEvent, stock: WatchlistStock) => void;
}

function WatchlistRow({ stock, isActive, onSelect, onTogglePin, onEditReason, onDelete, onContextMenu }: Props) {
  const livePrice = usePriceTick(stock.price);
  const up = stock.changePct >= 0;
  const rowClass = [
    'sb-row',
    stock.pinned ? 'pinned' : '',
    stock.similarTo ? 'similar-highlight' : '',
    isActive ? 'active-row' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={rowClass} onClick={() => onSelect(stock)} onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, stock); }}>
      <div className="sb-row-top">
        <PinIcon pinned={stock.pinned} onClick={() => onTogglePin(stock.ticker)} />
        <BadgeDot tag={stock.tag} />
        <span className="sb-ticker">{stock.ticker}</span>
        {stock.unread && <span className="unread-dot" title="Có tin mới" />}
        <span className="sb-price num">{livePrice.toLocaleString('vi-VN')}</span>
        <span className={`sb-chg num ${up ? 'up' : 'down'}`}>{formatPct(stock.changePct)}</span>
        <DeleteButton onDelete={() => onDelete(stock.ticker)} />
      </div>
      <div className="sb-row-bottom">
        <span className="sb-sector">{stock.sector}</span>
        <ReasonTag reason={stock.reason} onEdit={() => onEditReason(stock.ticker, stock.reason)} />
        <SimilarToTag similarTo={stock.similarTo} />
        <span className="sb-perf">
          từ lúc thêm <span className={`num ${stock.addedPerfPct >= 0 ? 'up' : 'down'}`}>{formatPct(stock.addedPerfPct)}</span>
        </span>
      </div>
    </div>
  );
}

// So sánh nông theo các field thực sự ảnh hưởng hiển thị — tránh re-render khi
// các mã KHÁC trong danh sách thay đổi (VD: chỉ giá của mã khác nhảy).
export default memo(WatchlistRow, (prev, next) =>
  prev.stock === next.stock && prev.isActive === next.isActive
);
