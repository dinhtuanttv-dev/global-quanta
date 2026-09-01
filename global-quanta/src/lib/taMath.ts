/**
 * Công thức lõi cho Tab TA VN-Index. Toàn bộ hàm ở đây là PURE FUNCTION
 * (không side-effect, không gọi API) — dễ unit-test độc lập, và được tối
 * ưu độ phức tạp thuật toán rõ ràng (ghi chú Big-O ở từng hàm).
 */

import type {
  OhlcBar,
  ChartEvent,
  EventStat,
  MaturityLevel,
  ConfluenceSource,
  EliteScoreBreakdown,
} from '../types/taVnIndex';

// ---------------------------------------------------------------
// Tra cứu nến theo thời gian — O(1) thay vì O(n) mỗi lần gọi
// ---------------------------------------------------------------

/**
 * Xây index map { time -> vị trí trong mảng } một lần duy nhất — O(n).
 * Mọi lượt tra cứu barsBetween/eventStats sau đó là O(1) thay vì
 * findIndex lặp lại O(n) cho mỗi sự kiện (tránh O(n·m) khi có nhiều sự kiện).
 */
export function buildTimeIndex(bars: OhlcBar[]): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < bars.length; i += 1) {
    map.set(bars[i].time, i);
  }
  return map;
}

/** % thay đổi giữa 2 mức giá — an toàn chia 0. */
export function pctChange(fromClose: number, toClose: number): number {
  if (fromClose === 0) return 0;
  return ((toClose - fromClose) / fromClose) * 100;
}

/**
 * Tính số nến + % biến động từ mỗi sự kiện tới phiên hiện tại — O(n + m)
 * tổng thể (n = số nến, m = số sự kiện) nhờ dùng index map thay vì tra
 * cứu tuyến tính lặp lại.
 */
export function computeEventStats(bars: OhlcBar[], events: ChartEvent[]): EventStat[] {
  if (bars.length === 0) return [];
  const timeIndex = buildTimeIndex(bars);
  const lastBar = bars[bars.length - 1];
  const lastIdx = bars.length - 1;

  const stats: EventStat[] = [];
  for (const ev of events) {
    const idx = timeIndex.get(ev.time);
    if (idx === undefined) continue; // bỏ qua sự kiện không khớp phiên nào (dữ liệu lỗi)
    const bar = bars[idx];
    stats.push({
      ...ev,
      barsSinceEvent: lastIdx - idx,
      pctChangeToNow: { value: pctChange(bar.close, lastBar.close), source: 'HARD_DATA' },
    });
  }
  return stats;
}

/** Tìm nến có giá đóng cửa thấp nhất — O(n), 1 lần duyệt. */
export function findTrough(bars: OhlcBar[]): OhlcBar | null {
  if (bars.length === 0) return null;
  return bars.reduce((min, b) => (b.close < min.close ? b : min), bars[0]);
}

// ---------------------------------------------------------------
// ADX — phân giải hướng có độ trễ (hysteresis) chống nhiễu khi +DI/-DI
// gần bằng nhau (tránh tín hiệu "nhấp nháy" đổi hướng liên tục quanh
// điểm giao cắt — vấn đề kinh điển khi dùng ngưỡng cứng đơn thuần).
// ---------------------------------------------------------------

const ADX_DIRECTION_HYSTERESIS = 2; // điểm chênh lệch tối thiểu để xác nhận hướng

export function resolveAdxDirection(plusDi: number, minusDi: number): 'plus' | 'minus' | 'neutral' {
  const diff = plusDi - minusDi;
  if (Math.abs(diff) < ADX_DIRECTION_HYSTERESIS) return 'neutral';
  return diff > 0 ? 'plus' : 'minus';
}

/** Chế độ thị trường: Wyckoff/Elliott chỉ đáng tin khi ADX đủ cao (fix Giai đoạn 8). */
export const ADX_REGIME_GATE_THRESHOLD = 20;

export function isRegimeGated(adxValue: number): boolean {
  return adxValue < ADX_REGIME_GATE_THRESHOLD;
}

// ---------------------------------------------------------------
// Correlation dampening cho Pattern Scanner (fix Giai đoạn 8 + công thức
// đã chốt ở Giai đoạn 7 cho AIScan): giảm trọng số hiển thị khi nhiều mã
// cùng ngành ra cùng mẫu hình trong cùng khung thời gian, để tránh đếm 1
// chuyển động ngành thành nhiều xác nhận độc lập.
// ---------------------------------------------------------------

/**
 * @param rawConfidencePct Độ khớp hình học gốc (0-100)
 * @param sectorCorrelation Hệ số tương quan với (các) mã cùng ngành đã xuất
 *   hiện cùng mẫu hình trong cùng phiên quét (0-1)
 */
export function dampenPatternConfidence(rawConfidencePct: number, sectorCorrelation: number): number {
  const clampedCorr = Math.max(0, Math.min(1, sectorCorrelation));
  return rawConfidencePct * (1 - 0.5 * clampedCorr);
}

// ---------------------------------------------------------------
// Độ chín tín hiệu (mở rộng Giai đoạn 7 — bars-since-formation)
// ---------------------------------------------------------------

export function classifyMaturity(barsSinceFormation: number | null): MaturityLevel | null {
  if (barsSinceFormation === null) return null;
  if (barsSinceFormation <= 3) return 'forming';
  if (barsSinceFormation <= 10) return 'consolidating';
  return 'stable';
}

// ---------------------------------------------------------------
// Elite Score — tổng hợp có trọng số VỚI renormalize khi thiếu nguồn
// (Giai đoạn 7, mục "Xử lý dữ liệu thiếu"): không giữ nguyên thang 100%
// khi 1 nguồn không có dữ liệu, mà phân bổ lại trọng số trên các nguồn
// còn khả dụng — tránh Elite Score bị hạ giả tạo chỉ vì thiếu 1 nguồn.
// ---------------------------------------------------------------

export interface WeightedSource {
  scorePct: number | null; // null = không có dữ liệu nguồn này
  weightPct: number | null; // null = chưa hiệu chỉnh trọng số (Khối ngoại, Giai đoạn 9)
}

export function computeEliteScore(sources: WeightedSource[]): { overallPct: number; sourcesUsed: number } {
  const usable = sources.filter(
    (s): s is { scorePct: number; weightPct: number } => s.scorePct !== null && s.weightPct !== null,
  );
  if (usable.length === 0) return { overallPct: 0, sourcesUsed: 0 };

  const totalWeight = usable.reduce((sum, s) => sum + s.weightPct, 0);
  if (totalWeight === 0) return { overallPct: 0, sourcesUsed: usable.length };

  // Renormalize: trọng số từng nguồn được chia lại trên TỔNG trọng số các
  // nguồn có mặt, thay vì cố định trên thang 100% gốc.
  const weightedSum = usable.reduce((sum, s) => sum + s.scorePct * (s.weightPct / totalWeight), 0);
  return { overallPct: weightedSum, sourcesUsed: usable.length };
}

/** Tổng hợp text cảnh báo tập trung ngành — dùng chung cho ConfluencePanel. */
export function summarizeConfluence(sources: ConfluenceSource[]): Pick<EliteScoreBreakdown, 'sourcesWithData' | 'sourcesTotal'> {
  const sourcesWithData = sources.filter((s) => s.status !== 'no_data').length;
  return { sourcesWithData, sourcesTotal: sources.length };
}
