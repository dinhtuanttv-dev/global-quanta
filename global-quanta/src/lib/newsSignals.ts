// Ngưỡng tin tức DÙNG CHUNG cho ELITE COMMAND RADAR và bảng Danh mục Elite HL (tài liệu 20, 20/11/2026) — một nguồn, hai nơi không lệch.
// Giá trị giữ nguyên như Radar dùng từ trước: cảm xúc cộng dồn 72 giờ (±0,25 -> viền xanh / đỏ), "tin nóng" = quan trọng ≥ 70 trong 24 giờ.
// Đây là QUY ƯỚC HIỂN THỊ (MÔ TẢ), chưa qua kiểm định đăng ký trước.
import type { SmartNewsItem } from "../hooks/useSmartNews";

export const NEWS_SENT_WINDOW_H = 72;
export const NEWS_HOT_WINDOW_H = 24;
export const NEWS_HOT_IMPORTANCE = 70;
export const NEWS_SENT_THRESHOLD = 0.25;

export interface NewsInfo { sentiment: number; hot: boolean }

/** Cảm xúc cộng dồn 72 giờ + cờ tin nóng 24 giờ theo mã (đúng phép tính Radar trước đây). */
export function newsInfoByTicker(items: readonly Pick<SmartNewsItem, "publishedAt" | "tickers" | "sentiment" | "importance">[], now: number): Map<string, NewsInfo> {
  const out = new Map<string, NewsInfo>();
  for (const it of items) {
    const age = it.publishedAt ? (now - Date.parse(it.publishedAt)) / 3_600_000 : 999;
    if (age > NEWS_SENT_WINDOW_H) continue;
    for (const t of it.tickers) {
      const cur = out.get(t) ?? { sentiment: 0, hot: false };
      cur.sentiment += it.sentiment;
      if (age <= NEWS_HOT_WINDOW_H && it.importance >= NEWS_HOT_IMPORTANCE) cur.hot = true;
      out.set(t, cur);
    }
  }
  return out;
}

/** Tông viền theo cảm xúc: "up" / "down" / null (trung tính hoặc không có tin). */
export function rimTone(ni: NewsInfo | null | undefined): "up" | "down" | null {
  if (!ni) return null;
  return ni.sentiment >= NEWS_SENT_THRESHOLD ? "up" : ni.sentiment <= -NEWS_SENT_THRESHOLD ? "down" : null;
}
