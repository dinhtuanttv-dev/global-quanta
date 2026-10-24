// DW8 (23/10/2026) — cách đếm Elliott CHỈNH TAY theo TÀI KHOẢN + MÃ + KHUNG, có lịch sử phiên bản.
// Bảng market_user_elliott_counts chỉ ở kho cục bộ (Railway Volume — xem localFirstStore.isLocalOnlyTable), không sang Supabase.
// Một dòng / (user_id, symbol, timeframe): { schemaVersion, activeId, versions[≤20] }. Không đụng tới hình vẽ tay (chart-state).
// Không tin dữ liệu đầu vào: chuẩn hoá nhãn, ngày, giá, trạng thái; giới hạn 20 phiên bản, 26 điểm / phiên bản, 64 KB / dòng.

import { assertBaseRevision, nextRevision } from "./revision.js";
export const ELLIOTT_COUNTS_TABLE = "market_user_elliott_counts";
export const ELLIOTT_COUNTS_SCHEMA = 1;
export const MAX_VERSIONS = 20;
const MAX_POINTS = 26;
const MAX_BYTES = 64 * 1024;
const SYMBOL_RE = /^[A-Z][A-Z0-9]{2,9}$/;
const TIMEFRAMES = new Set(["D", "W", "1H", "15m"]);
const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;
const LABEL_RE = /^(\(?[0-9A-EWXYZa-ewxyz]{1,3}\)?|i|ii|iii|iv|v)$/;
const STATUSES = new Set(["user_edited", "user_confirmed"]);
const PATTERN_TAGS = new Set(["IM", "LD", "ED", "ZZ", "DZ", "FL", "EX-FL", "RFL", "TR", "RTR", "ETR", "D3", "T3"]);

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function normalizeCountKey(rawSymbol, rawTf) {
  const symbol = String(rawSymbol ?? "").trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) throw badRequest("symbol không hợp lệ.");
  const timeframe = String(rawTf ?? "D").trim();
  if (!TIMEFRAMES.has(timeframe)) throw badRequest("timeframe không hợp lệ (D, W, 1H, 15m).");
  return { symbol, timeframe };
}

const str = (v, n) => String(v ?? "").slice(0, n);

function sanitizeVersion(v) {
  if (!v || typeof v !== "object") return null;
  const id = str(v.id, 60).replace(/[^A-Za-z0-9_-]/g, "");
  if (!id) return null;
  const points = (Array.isArray(v.points) ? v.points : []).slice(0, MAX_POINTS).map((p) => {
    if (!p || typeof p !== "object") return null;
    const date = String(p.date ?? "");
    const price = Number(p.price);
    const label = str(p.label, 4);
    if (!ISO_RE.test(date) || !Number.isFinite(price) || price <= 0 || !LABEL_RE.test(label)) return null;
    return { date, price, label };
  });
  if (points.length < 2 || points.some((p) => !p)) return null;
  for (let k = 1; k < points.length; k++) if (points[k].date < points[k - 1].date) return null; // thời gian tăng dần
  const status = STATUSES.has(v.status) ? v.status : "user_edited";
  const pattern = PATTERN_TAGS.has(v.pattern) ? v.pattern : null;
  const basedOn = v.basedOn && typeof v.basedOn === "object"
    ? { source: str(v.basedOn.source, 20) || "manual", asOf: ISO_RE.test(String(v.basedOn.asOf ?? "")) ? String(v.basedOn.asOf) : null, rank: Number.isInteger(v.basedOn.rank) ? v.basedOn.rank : null }
    : { source: "manual", asOf: null, rank: null };
  const violations = (Array.isArray(v.violations) ? v.violations : []).slice(0, 8).map((x) => str(x, 200));
  const createdAt = ISO_RE.test(String(v.createdAt ?? "")) ? String(v.createdAt) : new Date().toISOString();
  return { id, createdAt, status, points, degree: str(v.degree, 20) || null, pattern, note: str(v.note, 500), basedOn, violations };
}

/** Chuẩn hoá tài liệu; phiên bản lỗi bị bỏ; giữ tối đa 20 phiên bản mới nhất. */
export function sanitizeCountsDoc(raw) {
  if (!raw || typeof raw !== "object") throw badRequest("Thiếu dữ liệu.");
  if (!Array.isArray(raw.versions)) throw badRequest("versions phải là mảng.");
  const versions = raw.versions.map(sanitizeVersion).filter(Boolean)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).slice(-MAX_VERSIONS);
  const ids = new Set(versions.map((v) => v.id));
  if (ids.size !== versions.length) throw badRequest("id phiên bản bị trùng.");
  const activeId = raw.activeId != null && ids.has(String(raw.activeId)) ? String(raw.activeId) : null;
  const doc = { schemaVersion: ELLIOTT_COUNTS_SCHEMA, activeId, versions };
  if (Buffer.byteLength(JSON.stringify(doc)) > MAX_BYTES) throw badRequest("Dữ liệu cách đếm quá lớn (tối đa 64KB/mã/khung).");
  return doc;
}

const EMPTY = { schemaVersion: ELLIOTT_COUNTS_SCHEMA, activeId: null, versions: [] };

export async function getUserElliottCounts(store, userId, key) {
  const rows = await store.selectRows(ELLIOTT_COUNTS_TABLE, { eq: { user_id: userId, symbol: key.symbol, timeframe: key.timeframe }, limit: 1 });
  const r = rows[0];
  return { ...key, ...(r?.doc ?? EMPTY), updatedAt: r?.updated_at ?? null };
}

export async function saveUserElliottCounts(store, userId, key, body, now = new Date()) {
  const doc = sanitizeCountsDoc(body);
  const current = await getUserElliottCounts(store, userId, key);
  assertBaseRevision(body, current);
  const updatedAt = nextRevision(now, current.updatedAt);
  await store.upsertRows(ELLIOTT_COUNTS_TABLE, [{ user_id: userId, symbol: key.symbol, timeframe: key.timeframe, doc, updated_at: updatedAt }], "user_id,symbol,timeframe");
  return { ...key, ...doc, updatedAt };
}

export async function deleteUserElliottCounts(store, userId, key) {
  await store.deleteRows(ELLIOTT_COUNTS_TABLE, { eq: { user_id: userId, symbol: key.symbol, timeframe: key.timeframe } });
  return { ...key, ...EMPTY, updatedAt: null };
}
