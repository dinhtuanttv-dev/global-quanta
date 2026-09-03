/**
 * normalizeTicker.ts
 * ────────────────────────────────────────────────────────────────
 * GIAI ĐOẠN 2 — Data integrity.
 * Sửa mục 3.4 trong báo cáo: ticker có khoảng trắng do copy-paste
 * ("VNM ") sẽ không match với "VNM" khi so sánh exact string,
 * gây bug im lặng (không dedupe được, có thể add trùng).
 *
 * Áp dụng hàm này ở MỌI điểm ticker đi vào hệ thống:
 *   - SidebarSearchInput (trước khi gọi searchAddableStocks)
 *   - api.addToWatchlist (trước khi tạo WatchlistStock mới)
 *   - api.removeFromWatchlist / patchWatchlistStock
 * Không normalize rải rác ở nhiều chỗ khác nhau — chỉ 1 entry point
 * duy nhất per luồng, gọi hàm này.
 */

/** Trim + uppercase. Dùng cho MỌI input ticker trước khi so sánh/lưu. */
export function normalizeTicker(raw: string): string {
  return raw.trim().toUpperCase();
}

/** Mã HOSE/HNX/UPCOM chuẩn: 3 ký tự (đa số) hoặc 4 (một số ETF/CW). */
const TICKER_PATTERN = /^[A-Z]{3,4}$/;

export function isValidTickerFormat(ticker: string): boolean {
  return TICKER_PATTERN.test(ticker);
}

/**
 * Dùng thay cho Array.some() khi lookup watchlist hiện tại (báo cáo 3.4
 * đều xuất Set thay vì Array.some — O(1) thay vì O(n) mỗi lần search).
 */
export function buildTickerSet(watchlist: { ticker: string }[]): Set<string> {
  return new Set(watchlist.map((w) => normalizeTicker(w.ticker)));
}
