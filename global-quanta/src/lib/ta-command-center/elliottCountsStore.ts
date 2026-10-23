// DW8 — đồng bộ cách đếm Elliott chỉnh tay với Gateway (/api/market/elliott/counts, bảng local-only trên Railway).
// localStorage là bản làm việc (dùng ngay, offline); đã đăng nhập -> đọc/ghi Gateway. Bản nào mới hơn (updatedAt) thắng.
import { fetchMarketJson, isMarketGatewayEnabled } from "../../services/marketDataClient";
import { getAccessToken } from "../../services/api";
import type { UserCountsDoc } from "../quant-core/elliott/userCount";

const EMPTY: UserCountsDoc = { schemaVersion: 1, activeId: null, versions: [], updatedAt: null };
const key = (symbol: string, tf: string) => `gq.ta.elliottCounts.v1:${symbol.toUpperCase()}:${tf}`;

export function loadLocalCounts(symbol: string, tf: string): UserCountsDoc {
  try {
    const raw = JSON.parse(window.localStorage.getItem(key(symbol, tf)) ?? "null") as UserCountsDoc | null;
    return raw && Array.isArray(raw.versions) ? raw : EMPTY;
  } catch {
    return EMPTY;
  }
}

export function saveLocalCounts(symbol: string, tf: string, doc: UserCountsDoc): void {
  try { window.localStorage.setItem(key(symbol, tf), JSON.stringify(doc)); } catch { /* đầy bộ nhớ / chế độ riêng tư */ }
}

async function authed<T>(params: Record<string, string>, init?: RequestInit): Promise<T | null> {
  if (!isMarketGatewayEnabled()) return null;
  const token = await getAccessToken().catch(() => null);
  if (!token) return null;
  return fetchMarketJson<T>("/api/market/elliott/counts", params, {
    ...init,
    headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}`, ...(init?.body ? { "content-type": "application/json" } : {}) },
  });
}

/** Bản đám mây (null: chưa đăng nhập / Gateway tắt / lỗi mạng). */
export async function loadCloudCounts(symbol: string, tf: string): Promise<UserCountsDoc | null> {
  try { return await authed<UserCountsDoc>({ symbol, tf }); } catch { return null; }
}

/** Ghi lên Gateway; trả tài liệu đã chuẩn hoá (máy chủ có thể bỏ phiên bản lỗi) hoặc null nếu không ghi được. */
export async function saveCloudCounts(symbol: string, tf: string, doc: UserCountsDoc): Promise<UserCountsDoc | null> {
  try {
    return await authed<UserCountsDoc>({ symbol, tf }, { method: "PUT", body: JSON.stringify({ activeId: doc.activeId, versions: doc.versions }) });
  } catch {
    return null;
  }
}

/** Bản có updatedAt mới hơn thắng; thiếu thời điểm -> ưu tiên bản có dữ liệu. */
export function newerCounts(local: UserCountsDoc, cloud: UserCountsDoc | null): UserCountsDoc {
  if (!cloud) return local;
  if (!local.updatedAt) return cloud.versions.length || !local.versions.length ? cloud : local;
  if (!cloud.updatedAt) return local;
  return cloud.updatedAt >= local.updatedAt ? cloud : local;
}
