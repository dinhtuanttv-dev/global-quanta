// Lưu hình vẽ tay theo MÃ + TÀI KHOẢN (TA_VNINDEX_UPGRADE_SPEC §2.1.1 "Lưu trạng thái").
// localStorage là bản làm việc (dùng ngay, offline), khoá GẮN THEO TÀI KHOẢN (A2 — userScope.ts); đã đăng nhập -> đồng bộ Gateway
// /api/market/chart-state. A2 (C-07): KHÔNG so giờ máy khách. `updatedAt` = phiên bản do máy chủ cấp lần đồng bộ cuối; `dirty` = có thay
// đổi trên máy chưa lên đám mây. Lưu gửi kèm phiên bản gốc -> máy chủ đang giữ bản khác (thiết bị khác vừa lưu) -> 409 -> GỘP theo id
// (giữ cả hai, bản trên máy thắng khi trùng id) rồi lưu lại — không mất hình vẽ của thiết bị nào.
import { fetchMarketJson, isMarketGatewayEnabled, MarketApiError } from "../../services/marketDataClient";
import { getAccessToken } from "../../services/api";
import { sanitizePrimitives, type DrawnPrimitive } from "./DrawingManager";
import { readScoped, writeScoped } from "./userScope";

const key = (symbol: string) => `gq.ta.drawings.v1:${symbol.toUpperCase()}`;

export interface Saved { primitives: DrawnPrimitive[]; updatedAt: string | null; dirty: boolean }
export interface CloudDoc { primitives: DrawnPrimitive[]; updatedAt: string | null }

export function loadLocal(symbol: string): Saved {
  try {
    const raw = JSON.parse(readScoped(key(symbol)) ?? "null") as (Partial<Saved> & { primitives?: unknown }) | null;
    if (!raw) return { primitives: [], updatedAt: null, dirty: false };
    const primitives = sanitizePrimitives(raw.primitives);
    // Bản trước A2 không có `dirty` và `updatedAt` có thể là giờ máy khách -> coi là CHƯA đồng bộ (gộp an toàn với đám mây).
    if (typeof raw.dirty !== "boolean") return { primitives, updatedAt: null, dirty: primitives.length > 0 };
    return { primitives, updatedAt: raw.updatedAt ?? null, dirty: raw.dirty };
  } catch {
    return { primitives: [], updatedAt: null, dirty: false };
  }
}

export function saveLocal(symbol: string, saved: Saved): void {
  writeScoped(key(symbol), JSON.stringify(saved));
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
export async function loadCloud(symbol: string): Promise<CloudDoc | null> {
  try {
    const r = await authed<{ primitives: unknown; updatedAt: string | null }>({ symbol });
    return r ? { primitives: sanitizePrimitives(r.primitives), updatedAt: r.updatedAt } : null;
  } catch {
    return null;
  }
}

export type SaveResult = { status: "saved"; updatedAt: string } | { status: "conflict"; current: CloudDoc } | { status: "offline" };

/** Lưu kèm phiên bản gốc (`base`); máy chủ đang giữ phiên bản khác -> conflict + bản hiện tại. */
export async function saveCloud(symbol: string, primitives: DrawnPrimitive[], base: string | null): Promise<SaveResult> {
  try {
    const r = await authed<{ updatedAt: string }>({ symbol }, { method: "PUT", body: JSON.stringify({ primitives, baseUpdatedAt: base }) });
    return r?.updatedAt ? { status: "saved", updatedAt: r.updatedAt } : { status: "offline" };
  } catch (e) {
    if (e instanceof MarketApiError && e.status === 409) {
      const cur = (e.body.current ?? {}) as { primitives?: unknown; updatedAt?: string | null };
      return { status: "conflict", current: { primitives: sanitizePrimitives(cur.primitives), updatedAt: cur.updatedAt ?? null } };
    }
    return { status: "offline" };
  }
}

/** Gộp theo id: giữ mọi hình của cả hai bên; trùng id -> bản trên máy (vừa sửa) thắng. Thứ tự theo thời điểm tạo. */
export function mergePrimitives(local: DrawnPrimitive[], remote: DrawnPrimitive[]): DrawnPrimitive[] {
  const byId = new Map(remote.map((p) => [p.id, p]));
  for (const p of local) byId.set(p.id, p);
  return [...byId.values()].sort((a, b) => a.createdAt - b.createdAt);
}

/** Khi mở mã: máy không có thay đổi chưa đồng bộ -> dùng bản đám mây; có -> gộp (rồi đẩy lên). */
export function resolveOnLoad(local: Saved, cloud: CloudDoc | null): Saved {
  if (!cloud) return local;
  if (!local.dirty) return { primitives: cloud.primitives, updatedAt: cloud.updatedAt, dirty: false };
  return { primitives: mergePrimitives(local.primitives, cloud.primitives), updatedAt: cloud.updatedAt, dirty: true };
}

export type SyncOutcome = { state: "cloud" | "local"; primitives: DrawnPrimitive[]; merged: boolean };

/**
 * Lưu máy (đánh dấu chưa đồng bộ) rồi đẩy lên đám mây với phiên bản gốc; xung đột -> gộp + đẩy lại (tối đa 2 lần).
 * Trả danh sách cuối (đã gộp nếu có) để giao diện cập nhật.
 */
export async function syncDrawings(symbol: string, primitives: DrawnPrimitive[]): Promise<SyncOutcome> {
  const base = loadLocal(symbol).updatedAt;
  saveLocal(symbol, { primitives, updatedAt: base, dirty: true });
  let list = primitives, rev = base, merged = false;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await saveCloud(symbol, list, rev);
    if (r.status === "saved") { saveLocal(symbol, { primitives: list, updatedAt: r.updatedAt, dirty: false }); return { state: "cloud", primitives: list, merged }; }
    if (r.status === "offline") return { state: "local", primitives: list, merged };
    list = mergePrimitives(list, r.current.primitives); rev = r.current.updatedAt; merged = true;
    saveLocal(symbol, { primitives: list, updatedAt: rev, dirty: true });
  }
  return { state: "local", primitives: list, merged };
}
