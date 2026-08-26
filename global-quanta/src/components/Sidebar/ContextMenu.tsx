import { useEffect, useRef } from 'react';
import type { WatchlistStock } from '../../types';

interface Props {
  x: number;
  y: number;
  stock: WatchlistStock;
  onClose: () => void;
  onAlert: (ticker: string) => void;
  onEditNote: (ticker: string) => void;
  onViewOnRadar: (ticker: string) => void;
  onTogglePin: (ticker: string) => void;
  onDelete: (ticker: string) => void;
}

export default function ContextMenu({ x, y, stock, onClose, onAlert, onEditNote, onViewOnRadar, onTogglePin, onDelete }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [onClose]);

  const items = [
    { label: `⏰ Đặt cảnh báo cho ${stock.ticker}`, action: () => onAlert(stock.ticker) },
    { label: '📝 Thêm/sửa ghi chú', action: () => onEditNote(stock.ticker) },
    { label: '⌖ Xem trên Radar', action: () => onViewOnRadar(stock.ticker) },
    { label: stock.pinned ? '📌 Bỏ ghim' : '📌 Ghim mã này', action: () => onTogglePin(stock.ticker) },
    { label: '🗑 Xoá khỏi danh sách', action: () => onDelete(stock.ticker), danger: true },
  ];

  return (
    <div ref={ref} className="sb-ctx-menu" style={{ left: x, top: y }}>
      {items.map((item) => (
        <div
          key={item.label}
          className="sb-ctx-item"
          style={item.danger ? { color: 'var(--negative)' } : undefined}
          onClick={() => { item.action(); onClose(); }}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}
