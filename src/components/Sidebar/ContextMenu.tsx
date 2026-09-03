import { useEffect, useRef, KeyboardEvent } from 'react';
import type { WatchlistStock } from '../../types';
import { buildContextMenuActions, type ContextMenuAction, type ContextMenuHandlers } from './contextMenuActions';

interface Props {
  x: number;
  y: number;
  stock: WatchlistStock;
  onClose: () => void;
  handlers: ContextMenuHandlers;
}

export default function ContextMenu({ x, y, stock, onClose, handlers }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const items: ContextMenuAction[] = buildContextMenuActions(stock, handlers);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [onClose]);

  // Keyboard navigation (roving focus) — dùng cho accessibility
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = items.filter((item) => !item.disabled);
    const currentIndex = list.findIndex((item) => item.key === (e.target as HTMLElement)?.getAttribute('data-key'));

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        {
          const next = (currentIndex + 1) % list.length;
          const nextEl = document.querySelector(`[data-key="${list[next].key}"]`) as HTMLElement;
          nextEl?.focus();
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        {
          const prev = (currentIndex - 1 + list.length) % list.length;
          const prevEl = document.querySelector(`[data-key="${list[prev].key}"]`) as HTMLElement;
          prevEl?.focus();
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  return (
    <div
      ref={ref}
      className="sb-ctx-menu"
      style={{ left: x, top: y }}
      onKeyDown={handleKeyDown}
      role="menu"
      aria-orientation="vertical"
    >
      {items.map((item) => (
        <div
          key={item.key}
          data-key={item.key}
          className={`sb-ctx-item${item.destructive ? ' sb-ctx-item--danger' : ''}${item.disabled ? ' sb-ctx-item--disabled' : ''}`}
          style={item.destructive && !item.disabled ? { color: 'var(--negative)' } : undefined}
          onClick={() => {
            if (!item.disabled) {
              item.onSelect();
              onClose();
            }
          }}
          tabIndex={item.disabled ? -1 : 0}
          role="menuitem"
          aria-disabled={item.disabled}
        >
          {item.label}
        </div>
      ))}
    </div>
  );
}
