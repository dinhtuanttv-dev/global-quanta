/**
 * services/watchlist.ts (GHI ĐÈ bản Giai đoạn 4 — đổi thiết kế)
 * ────────────────────────────────────────────────────────────────
 * LỚP LIÊN KẾT MỎNG (façade) bọc quanh api.ts — KHÔNG tách domain
 * khỏi api.ts. Cung cấp:
 *   1. Cache dùng chung + pub/sub (đồng bộ Sidebar ↔ Radar)
 *   2. Optimistic update + ROLLBACK khi lưu thất bại
 *   3. Validate trước khi thêm (chặn trùng, chặn sai định dạng)
 *   4. getCoreTickers() — điểm đọc chuyên biệt cho Radar
 *
 * LƯU Ý: types.ts hiện chưa có `AddableStock.price?` và
 * `WatchlistStock.isSaving?` (sẽ patch ở giai đoạn sau). File này
 * dùng type mở rộng local để KHÔNG phải sửa types.ts ngay bây giờ,
 * giữ tương thích ngược với code hiện tại.
 *
 * ⚠️ TRẠNG THÁI: ĐÃ COMMIT nhưng CHƯA ĐƯỢC TÍCH HỢP.
 *    - useAppStore vẫn gọi api.ts trực tiếp (chưa migrate).
 *    - File này hiện tại là "DEAD CODE" — Vite tree-shake loại khỏi bundle.
 *    - Tác động runtime: 0. Tác động bundle: 0 KB.
 *    - TODO: Migrate useAppStore trong round tiếp theo (Lộ trình B).
 *    - LÝ DO GIỮ: Tránh mất công sức viết + git history rõ ràng.
 */
import * as api from './api';
import { normalizeTicker, isValidTickerFormat, buildTickerSet } from '../utils/normalizeTicker';
import type { AddableStock, WatchlistStock } from '../types';

/** Mở rộng local — tương thích với types.patch.ts (chưa áp dụng) */
type AddableStockWithPrice = AddableStock & { price?: number };
type WatchlistStockWithSaving = WatchlistStock & { isSaving?: boolean };

type WatchlistListener = (watchlist: WatchlistStock[]) => void;

const listeners = new Set<WatchlistListener>();
let cache: WatchlistStock[] = [];

function setCache(next: WatchlistStock[]) {
  cache = next;
  listeners.forEach((cb) => cb(cache));
}

// ── Đọc dữ liệu (dùng chung cho Sidebar lẫn Radar) ────────────────

/**
 * Subscribe để nhận watchlist mới nhất mỗi khi có thay đổi (thêm/xoá/
 * sửa/patch giá). Gọi ngay lập tức với state hiện tại khi subscribe.
 */
export function subscribeWatchlist(listener: WatchlistListener): () => void {
  listeners.add(listener);
  listener(cache);
  return () => listeners.delete(listener);
}

/** Đọc đồng bộ — dùng khi Radar chỉ cần snapshot hiện tại. */
export function getCachedWatchlist(): WatchlistStock[] {
  return cache;
}

/** Danh sách mã đang gắn tag "core" — dữ liệu Radar cần cho "Core X/6". */
export function getCoreTickers(): string[] {
  return cache.filter((s) => s.tag === 'core').map((s) => s.ticker);
}

// ── Ghi dữ liệu (dùng bởi Sidebar/store — Radar chỉ đọc) ──────────

export async function fetchWatchlist(): Promise<WatchlistStock[]> {
  const data = await api.fetchWatchlist();
  setCache(data);
  return data;
}

/**
 * Thêm mã mới — optimistic (hiện ngay với isSaving: true), rollback
 * nếu api.addToWatchlist thất bại hoặc validate sai.
 */
export async function addToWatchlist(candidate: AddableStock): Promise<WatchlistStock> {
  const ticker = normalizeTicker(candidate.ticker);

  if (!isValidTickerFormat(ticker)) {
    throw new Error(`Mã "${ticker}" không đúng định dạng (3-4 ký tự A-Z).`);
  }
  if (buildTickerSet(cache).has(ticker)) {
    throw new Error(`${ticker} đã có trong danh sách theo dõi.`);
  }

  // Optimistic: chèn ngay bản ghi tạm — price lấy từ candidate
  // (kết quả search đã có giá thật) thay vì 0.
  const candidateWithPrice = candidate as AddableStockWithPrice;
  const pending: WatchlistStockWithSaving = {
    ticker,
    sector: candidate.sector,
    price: candidateWithPrice.price ?? 0,
    changePct: 0,
    tag: 'none',
    convScore: 0,
    groups: [],
    pinned: false,
    reason: null,
    addedAt: new Date().toISOString().slice(0, 10),
    addedPerfPct: 0,
    unread: false,
    similarTo: null,
    isSaving: true,
  };
  setCache([...cache, pending]);

  try {
    const saved = await api.addToWatchlist(candidate);
    setCache(cache.map((s) => (s.ticker === ticker ? { ...saved, isSaving: false } : s)));
    return saved;
  } catch (err) {
    // Rollback — gỡ bản ghi tạm.
    setCache(cache.filter((s) => s.ticker !== ticker));
    throw err;
  }
}

/**
 * Xoá mã — optimistic + rollback nếu api.removeFromWatchlist thất bại.
 * Sửa hành vi cũ (không rollback khi lỗi) — đảm bảo dữ liệu đúng.
 */
export async function removeFromWatchlist(ticker: string): Promise<void> {
  const normalized = normalizeTicker(ticker);
  const index = cache.findIndex((s) => s.ticker === normalized);
  if (index === -1) return;
  const removed = cache[index];

  setCache(cache.filter((s) => s.ticker !== normalized));

  try {
    await api.removeFromWatchlist(normalized);
  } catch (err) {
    setCache([...cache.slice(0, index), removed, ...cache.slice(index)]);
    throw err;
  }
}

export async function restoreToWatchlist(stock: WatchlistStock, index: number): Promise<void> {
  setCache([...cache.slice(0, index), stock, ...cache.slice(index)]);
  try {
    await api.restoreToWatchlist(stock, index);
  } catch (err) {
    setCache(cache.filter((s) => s.ticker !== stock.ticker));
    throw err;
  }
}

/** Dùng cho ghi chú (ReasonTag) và các patch nhỏ khác (togglePin, markRead…). */
export async function patchWatchlistStock(
  ticker: string,
  patch: Partial<WatchlistStock>,
): Promise<WatchlistStock | null> {
  const normalized = normalizeTicker(ticker);
  const index = cache.findIndex((s) => s.ticker === normalized);
  if (index === -1) return null;

  const previous = cache[index];
  const optimistic = { ...previous, ...patch };
  setCache([...cache.slice(0, index), optimistic, ...cache.slice(index + 1)]);

  try {
    // api.patchWatchlistStock trả về Promise<void> (xem api.ts gốc).
    // Ta không cần giá trị saved vì cache đã được set optimistic.
    await api.patchWatchlistStock(normalized, patch);
    return optimistic;
  } catch (err) {
    setCache([...cache.slice(0, index), previous, ...cache.slice(index + 1)]);
    throw err;
  }
}

/** Read-only, không cần cache riêng — chuyển thẳng qua api.ts. */
export async function searchAddableStocks(query: string): Promise<AddableStock[]> {
  return api.searchAddableStocks(query);
}
