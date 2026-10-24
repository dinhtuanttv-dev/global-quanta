// DW8 — đồng bộ cách đếm Elliott chỉnh tay với Gateway (/api/market/elliott/counts, bảng local-only trên Railway).
// localStorage là bản làm việc (dùng ngay, offline), khoá GẮN THEO TÀI KHOẢN (A2 — userScope.ts). A2 (C-07): `updatedAt` = phiên bản
// do máy chủ cấp; `dirty` = thay đổi trên máy chưa lên đám mây; lưu kèm phiên bản gốc -> 409 -> gộp phiên bản theo id rồi lưu lại.
import { fetchMarketJson, isMarketGatewayEnabled, MarketApiError } from "../../services/marketDataClient";
import { getAccessToken } from "../../services/api";
import type { UserCountsDoc } from "../quant-core/elliott/userCount";
import { readScoped, writeScoped } from "./userScope";

const EMPTY: UserCountsDoc = { schemaVersion: 1, activeId: null, versions: [], updatedAt: null };
const key = (symbol: string, tf: string) => `gq.ta.elliottCounts.v1:${symbol.toUpperCase()}:${tf}`;

export type LocalCounts = UserCountsDoc & { dirty: boolean };

export function loadLocalCounts(symbol: string, tf: string): LocalCounts {
  try {
    const raw = JSON.parse(readScoped(key(symbol, tf)) ?? "null") as (UserCountsDoc & { dirty?: boolean }) | null;
    if (!raw || !Array.isArray(raw.versions)) return { ...EMPTY, dirty: false };
    // Bản trước A2: updatedAt là giờ máy khách, không có `dirty` -> coi là chưa đồng bộ (gộp an toàn).
    if (typeof raw.dirty !== "boolean") return { ...raw, updatedAt: null, dirty: raw.versions.length > 0 };
    return { ...raw, dirty: raw.dirty };
  } catch {
    return { ...EMPTY, dirty: false };
  }
}

export function saveLocalCounts(symbol: string, tf: string, doc: LocalCounts): void {
  writeScoped(key(symbol, tf), JSON.stringify(doc));
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

export type CountsSave = { status: "saved"; doc: UserCountsDoc } | { status: "conflict"; current: UserCountsDoc } | { status: "offline" };

/** Ghi lên Gateway kèm phiên bản gốc; máy chủ có thể bỏ phiên bản lỗi (doc trả về là bản đã chuẩn hoá). */
export async function saveCloudCounts(symbol: string, tf: string, doc: UserCountsDoc, base: string | null): Promise<CountsSave> {
  try {
    const r = await authed<UserCountsDoc>({ symbol, tf }, { method: "PUT", body: JSON.stringify({ activeId: doc.activeId, versions: doc.versions, baseUpdatedAt: base }) });
    return r ? { status: "saved", doc: r } : { status: "offline" };
  } catch (e) {
    if (e instanceof MarketApiError && e.status === 409) return { status: "conflict", current: { ...EMPTY, ...(e.body.current as UserCountsDoc) } };
    return { status: "offline" };
  }
}

/** Gộp phiên bản theo id (trùng id -> bản trên máy thắng), mới nhất trước; phiên bản đang dùng = của máy. */
export function mergeCounts(local: UserCountsDoc, remote: UserCountsDoc): UserCountsDoc {
  const byId = new Map(remote.versions.map((v) => [v.id, v]));
  for (const v of local.versions) byId.set(v.id, v);
  const versions = [...byId.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
  const activeId = versions.some((v) => v.id === local.activeId) ? local.activeId : remote.activeId;
  return { schemaVersion: 1, activeId, versions, updatedAt: remote.updatedAt ?? null };
}

/** Khi mở (mã, khung): máy không có thay đổi chưa đồng bộ -> bản đám mây; có -> gộp. */
export function resolveCountsOnLoad(local: LocalCounts, cloud: UserCountsDoc | null): LocalCounts {
  if (!cloud) return local;
  if (!local.dirty) return { ...cloud, dirty: false };
  return { ...mergeCounts(local, cloud), dirty: true };
}

/** Lưu máy (chưa đồng bộ) rồi đẩy lên với phiên bản gốc; xung đột -> gộp + đẩy lại (tối đa 2 lần). */
export async function syncCounts(symbol: string, tf: string, doc: UserCountsDoc): Promise<{ doc: LocalCounts; cloud: boolean; merged: boolean }> {
  const base = loadLocalCounts(symbol, tf).updatedAt ?? null;
  let cur: LocalCounts = { ...doc, updatedAt: base, dirty: true }, merged = false;
  saveLocalCounts(symbol, tf, cur);
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await saveCloudCounts(symbol, tf, cur, cur.updatedAt ?? null);
    if (r.status === "saved") { const done = { ...r.doc, dirty: false }; saveLocalCounts(symbol, tf, done); return { doc: done, cloud: true, merged }; }
    if (r.status === "offline") return { doc: cur, cloud: false, merged };
    cur = { ...mergeCounts(cur, r.current), dirty: true }; merged = true;
    saveLocalCounts(symbol, tf, cur);
  }
  return { doc: cur, cloud: false, merged };
}
