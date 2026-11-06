// S7 (06/11/2026) — kho tạm cho GÓI Mùa vụ KQKD (Gateway /api/fundamentals/kqkd/seasonality/:ticker = 9 API Project A trong 1 lần gọi).
// Dữ liệu được kiểm tra bằng ĐÚNG các hàm fetch cũ (fetchEarningsCycleStats / fetchEarningsCyclePaths / fetchAnnualEarningsCalendar:
// schema zod + khớp mã/quý + 404 = chưa có), chỉ thay nguồn fetch bằng mục trong gói. Hook đọc kho trước, không có mới gọi mạng.
// Công thức, ngưỡng, hiển thị của Mùa vụ KQKD không đổi.
import type { Quarter } from './timing-types';
import { buildAnnualCalendarUrl, buildEarningsCyclePathsUrl, buildEarningsCycleStatsUrl, fetchAnnualEarningsCalendar, fetchEarningsCyclePaths, fetchEarningsCycleStats } from './seasonality.api';

export interface BundleItem { status: number; body: unknown; error?: string; stale?: boolean }
export interface SeasonalityBundleItems { [key: string]: BundleItem }

const TTL = 30 * 60_000;
const store = new Map<string, { data: unknown; at: number }>();

/** Fetch giả đọc một mục của gói — trả Response như máy chủ Project A (200 / 404 / lỗi). */
const fromItem = (it: BundleItem | undefined): typeof fetch => async () => {
  if (!it) throw new Error('Gói thiếu mục');
  if (it.status === 404) return new Response(null, { status: 404 });
  if (it.status !== 200) return new Response(JSON.stringify({ error: it.error ?? 'lỗi nguồn' }), { status: it.status || 502 });
  return new Response(JSON.stringify(it.body), { status: 200, headers: { 'content-type': 'application/json' } });
};

/** Kiểm tra và nạp gói vào kho. Mục nào kiểm tra lỗi thì bỏ qua (hook sẽ tự gọi mạng như cũ). Trả số mục đã nạp. */
export async function primeSeasonality(ticker: string, items: SeasonalityBundleItems, baseUrl: string, now = Date.now()): Promise<number> {
  const jobs: [string, () => Promise<unknown>][] = [[buildAnnualCalendarUrl(ticker, baseUrl), () => fetchAnnualEarningsCalendar(ticker, { baseUrl, fetchImpl: fromItem(items.calendar) })]];
  for (const q of [1, 2, 3, 4] as Quarter[]) {
    jobs.push([buildEarningsCycleStatsUrl(ticker, q, baseUrl), () => fetchEarningsCycleStats(ticker, q, { baseUrl, fetchImpl: fromItem(items[`stats:${q}`]) })]);
    jobs.push([buildEarningsCyclePathsUrl(ticker, q, baseUrl), () => fetchEarningsCyclePaths(ticker, q, { baseUrl, fetchImpl: fromItem(items[`paths:${q}`]) })]);
  }
  let n = 0;
  await Promise.all(jobs.map(async ([url, run]) => { try { store.set(url, { data: await run(), at: now }); n += 1; } catch { /* mục lỗi: để hook gọi mạng */ } }));
  return n;
}

/** Dữ liệu đã nạp cho url (undefined = chưa có / hết hạn -> gọi mạng). null là hợp lệ (= chưa có dữ liệu, như 404). */
export function takePrimed<T>(url: string, now = Date.now()): T | null | undefined {
  const hit = store.get(url);
  if (!hit || now - hit.at > TTL) return undefined;
  return hit.data as T | null;
}

export function clearPrimed(): void { store.clear(); }
