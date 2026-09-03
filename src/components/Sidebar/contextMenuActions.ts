/**
 * contextMenuActions.ts (NEW)
 * ────────────────────────────────────────────────────────────────
 * Hoàn thiện đủ 5 hành động ContextMenu (báo cáo phân tích gốc ghi nhận
 * "right-click menu (5 actions)" có sẵn trong UI thật).
 *
 * 2 hành động thêm — chọn dựa trên dữ liệu ĐÃ CÓ SẴN trong kiến trúc,
 * không cần thêm store action mới nào lạ:
 *   4. "Đánh dấu đã đọc" — dùng lại markRead(ticker), action đã tồn
 *      tại. Chỉ bật khi stock.unread === true.
 *   5. "Sao chép mã" — tiện ích phổ quát (Clipboard API), không phụ
 *      thuộc store.
 *
 * Tách thành pure function để TEST ĐƯỢC ĐỘC LẬP — không cần render
 * ContextMenu hay Sidebar để kiểm tra đúng label/disabled/thứ tự.
 *
 * LƯU Ý: file này tạm thời không import từ ContextMenu.tsx (vì
 * ContextMenu.tsx hiện tại dùng prop riêng lẻ, chưa có ContextMenuAction
 * type). Khi Sidebar được nâng cấp ở bước sau, sẽ chuyển sang import
 * type ContextMenuAction từ ContextMenu. Hiện tại định nghĩa type cục bộ.
 */
import type { WatchlistStock } from '../../types';

export interface ContextMenuAction {
  key: string;
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

export interface ContextMenuHandlers {
  onSelect: (ticker: string) => void;
  onTogglePin: (ticker: string) => void;
  onDelete: (ticker: string) => void;
  onMarkRead: (ticker: string) => void;
  onCopyTicker: (ticker: string) => void | Promise<void>;
  onAlert?: (ticker: string) => void;
  onEditNote?: (ticker: string) => void;
  onViewOnRadar?: (ticker: string) => void;
}

/** Mở rộng local — tương thích với types.patch.ts (chưa áp dụng) */
type WatchlistStockWithSaving = WatchlistStock & { isSaving?: boolean };

export function buildContextMenuActions(
  stock: WatchlistStock,
  handlers: ContextMenuHandlers,
): ContextMenuAction[] {
  const stockWithSaving = stock as WatchlistStockWithSaving;
  return [
    {
      key: 'select',
      label: 'Xem chi tiết',
      onSelect: () => handlers.onSelect(stock.ticker),
    },
    {
      key: 'pin',
      label: stock.pinned ? 'Bỏ ghim' : 'Ghim',
      disabled: stockWithSaving.isSaving,
      onSelect: () => handlers.onTogglePin(stock.ticker),
    },
    {
      key: 'markRead',
      label: 'Đánh dấu đã đọc',
      // Vô hiệu hoá thay vì ẩn — giữ số lượng item ổn định giúp
      // roving focus không bị lệch chỉ số khi mở lại menu.
      disabled: !stock.unread,
      onSelect: () => handlers.onMarkRead(stock.ticker),
    },
    {
      key: 'copy',
      label: 'Sao chép mã',
      onSelect: () => handlers.onCopyTicker(stock.ticker),
    },
    {
      key: 'delete',
      label: 'Xoá khỏi danh sách',
      destructive: true,
      disabled: stockWithSaving.isSaving,
      onSelect: () => handlers.onDelete(stock.ticker),
    },
  ];
}
