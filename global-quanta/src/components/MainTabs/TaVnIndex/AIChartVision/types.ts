// AI Chart Vision v2 — props của khung chính. Kiểu dữ liệu phân tích: src/hooks/useChartVision.ts.
export interface AIChartVisionPanelProps {
  /** Mã đang xem ở TA VN-Index (đồng bộ với Biểu đồ kỹ thuật và các bộ lọc). */
  ticker?: string;
  /** Gọi khi người dùng đổi mã ngay tại AI Chart Vision. */
  onRequestTickerChange?: (ticker: string) => void;
  /** Mở bộ lọc (tab con) đang chứa mã, ví dụ "sepa", "camslim". */
  onOpenScreener?: (tab: string) => void;
}
