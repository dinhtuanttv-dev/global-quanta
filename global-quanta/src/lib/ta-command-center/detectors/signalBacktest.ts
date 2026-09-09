import type { OhlcvBar } from "../types";

// ĐÃ THÊM — Tái dùng nguyên lý Pattern Backtest Engine (đã xây cho AI
// Chart Vision, patternBacktest.js) áp dụng cho các tín hiệu SMC/VSA/
// Wyckoff trên chính biểu đồ TA VN-Index: mỗi lần tín hiệu xuất hiện
// trong lịch sử, xem giá di chuyển thế nào sau đó N phiên — biến tín hiệu
// từ "cảm tính" thành "có bằng chứng thống kê thật" trên chính mã đang
// xem, đúng tinh thần minh bạch xuyên suốt dự án (không bịa số, mẫu quá
// nhỏ phải cảnh báo rõ).

export interface SignalBacktestResult {
  signalLabel: string;
  sampleSize: number;
  successRatePct: number | null;
  avgReturnPct: number | null;
  lowSampleWarning: boolean;
}

const MIN_RELIABLE_SAMPLE = 5;

/**
 * @param bars Toàn bộ nến (không cắt bớt) — dùng để backtest.
 * @param signalDates Ngày xảy ra tín hiệu (càng nhiều lần trong quá khứ
 *   càng tốt — dùng bản "Full" của detector, không dùng bản đã cắt bớt
 *   cho hiển thị UI).
 * @param direction Hướng kỳ vọng của tín hiệu ("bullish" = kỳ vọng giá
 *   tăng sau đó, "bearish" = kỳ vọng giá giảm).
 * @param lookaheadBars Số phiên nhìn về sau để đo kết quả (mặc định 10).
 */
export function backtestSignalDates(
  bars: OhlcvBar[],
  signalDates: string[],
  direction: "bullish" | "bearish",
  signalLabel: string,
  lookaheadBars: number = 10
): SignalBacktestResult {
  const dateIndex = new Map(bars.map((b, i) => [b.date, i]));
  const returns: number[] = [];

  for (const date of signalDates) {
    const idx = dateIndex.get(date);
    if (idx === undefined) continue;
    const targetIdx = idx + lookaheadBars;
    if (targetIdx >= bars.length) continue; // chưa đủ dữ liệu tương lai để đo — bỏ qua, không bịa
    const entryClose = bars[idx].close;
    const exitClose = bars[targetIdx].close;
    if (entryClose <= 0) continue;
    const returnPct = ((exitClose - entryClose) / entryClose) * 100;
    returns.push(direction === "bullish" ? returnPct : -returnPct); // chuẩn hóa: dương = đúng kỳ vọng
  }

  if (returns.length === 0) {
    return { signalLabel, sampleSize: 0, successRatePct: null, avgReturnPct: null, lowSampleWarning: true };
  }

  const successCount = returns.filter((r) => r > 0).length;
  const successRatePct = Math.round((successCount / returns.length) * 1000) / 10;
  const avgReturnPct = Math.round((returns.reduce((s, r) => s + r, 0) / returns.length) * 100) / 100;

  return {
    signalLabel,
    sampleSize: returns.length,
    successRatePct,
    avgReturnPct,
    lowSampleWarning: returns.length < MIN_RELIABLE_SAMPLE,
  };
}
