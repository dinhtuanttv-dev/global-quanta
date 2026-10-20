/**
 * Công thức lõi cho Tab TA VN-Index. Toàn bộ hàm ở đây là PURE FUNCTION
 * (không side-effect, không gọi API) — dễ unit-test độc lập, và được tối
 * ưu độ phức tạp thuật toán rõ ràng (ghi chú Big-O ở từng hàm).
 */

import type {
  OhlcBar,
  ChartEvent,
  EventStat,
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
  if (!Array.isArray(bars) || bars.length === 0 || !Array.isArray(events)) return [];
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
      // FIX (2026-09-18): TU TINH priceAtEvent tu bar.close (da co san,
      // HARD_DATA that) - KHONG PHU THUOC nguon events phai tu cung cap
      // field nay. Truoc day: neu ev.priceAtEvent thieu (VD nguon events
      // moi tu route chart-overlay chi co {time,type,label}), spread se
      // de lai undefined, gay crash "Cannot read properties of undefined
      // (reading 'value')" ngay ben ngoai component khi doc .value.
      priceAtEvent: { value: bar.close, source: 'HARD_DATA' },
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
