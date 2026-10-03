// Lưu hình vẽ tay theo MÃ + TÀI KHOẢN (TA_VNINDEX_UPGRADE_SPEC §2.1.1 "Lưu trạng thái").
// localStorage là bản làm việc (dùng ngay, offline); đã đăng nhập -> đồng bộ Gateway /api/market/chart-state
// (bảng market_user_chart_state, cùng cơ chế ★ Danh mục). Bản nào mới hơn (updatedAt) thắng.
import { fetchMarketJson, isMarketGatewayEnabled } from "../../services/marketDataClient";
import { getAccessToken } from "../../services/api";
import { sanitizePrimitives, type DrawnPrimitive } from "./DrawingManager";

const key = (symbol: string) => `gq.ta.drawings.v1:${symbol.toUpperCase()}`;

interface Saved { primitives: DrawnPrimitive[]; updatedAt: string | null }

export function loadLocal(symbol: string): Saved {
  try {
    const raw = JSON.parse(window.localStorage.getItem(key(symbol)) ?? "null") as Saved | null;
    return raw ? { primitives: sanitizePrimitives(raw.primitives), updatedAt: raw.updatedAt ?? null } : { primitives: [], updatedAt: null };
  } catch {
    return { primitives: [], updatedAt: null };
  }
}

export function saveLocal(symbol: string, primitives: DrawnPrimitive[], updatedAt = new Date().toISOString()): void {
  try {
    if (primitives.length) window.localStorage.setItem(key(symbol), JSON.stringify({ primitives, updatedAt }));
    else window.localStorage.setItem(key(symbol), JSON.stringify({ primitives: [], updatedAt }));
  } catch { /* đầy bộ nhớ / chế độ riêng tư: bỏ qua */ }
}

async function authed<T>(params: Record<string, string>, init?: RequestInit): Promise<T | null> {
  if (!isMarketGatewayEnabled()) return null;
  const token = await getAccessToken().catch(() => null);
  if (!token) return null;
  return fetchMarketJson<T>("/api/market/chart-state", params, {
    ...init,
    headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}`, ...(init?.body ? { "content-type": "application/json" } : {}) },
  });
}

/** Bản đám mây (null: chưa đăng nhập / Gateway tắt / lỗi mạng). */
export async function loadCloud(symbol: string): Promise<Saved | null> {
  try {
    const r = await authed<{ primitives: unknown; updatedAt: string | null }>({ symbol });
    return r ? { primitives: sanitizePrimitives(r.primitives), updatedAt: r.updatedAt } : null;
  } catch {
    return null;
  }
}

export async function saveCloud(symbol: string, primitives: DrawnPrimitive[]): Promise<string | null> {
  try {
    const r = await authed<{ updatedAt: string }>({ symbol }, { method: "PUT", body: JSON.stringify({ primitives }) });
    return r?.updatedAt ?? null;
  } catch {
    return null;
  }
}

/** Gộp: bản có updatedAt mới hơn thắng; thiếu thời điểm -> ưu tiên bản có dữ liệu. */
export function pickNewer(local: Saved, cloud: Saved | null): Saved {
  if (!cloud) return local;
  if (!local.updatedAt) return cloud.primitives.length || !local.primitives.length ? cloud : local;
  if (!cloud.updatedAt) return local;
  return cloud.updatedAt > local.updatedAt ? cloud : local;
}
