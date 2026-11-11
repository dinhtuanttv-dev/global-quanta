// BL4 (07/11/2026) — Bộ lọc cổ phiếu cổ tức: bộ lọc đã lưu + cột hiển thị THEO TÀI KHOẢN. Chỉ là sở thích hiển thị.
// Bảng chỉ ở kho cục bộ Railway (localFirstStore.isLocalOnlyTable). Không tin dữ liệu vào: chỉ nhận khoá / miền đã biết, ≤ 8KB.
// Đồng bộ có phiên bản máy chủ (revision.js): gửi kèm baseUpdatedAt, máy chủ đang giữ bản khác -> 409.
import { assertBaseRevision, nextRevision } from "./revision.js";

export const SCREENER_PREFS_TABLE = "market_user_screener";
export const SCREENER_PREFS_SCHEMA = 1;
const MAX_BYTES = 8 * 1024;
const MAX_SCREENS = 20;
/** Miền giống hệt frontend (lib/quant-cotuc.ts DividendFilter, PE_NO_LIMIT = 60, DEBT_NO_LIMIT = 99). */
const NUM = { minYield: [0, 15], minRoe: [0, 30], maxPe: [5, 60], maxDebt: [0, 99], minFscore: [0, 9], minQuintile: [0, 5] };
const ENUM = {
  trend: ["All", "UP", "RECOVERING", "WEAKENING", "DOWN"],
  phase: ["All", "PRE_AGM", "PREPARATION", "ACCUMULATION", "RUN_UP", "DISCOUNT", "EXPIRED"],
};
const BOOL = ["upcomingGDKHQ", "upcomingAGM", "hideRiskFlags", "hideStaleEvents", "hideTraps", "showUnknown"];
export const SCREENER_COLUMNS = ["price", "yield", "ex", "payAgm", "pe", "roe", "fm", "window", "expected", "growth", "decision"];
const SORT_FIELDS = ["ticker", "dividendYield", "score", "pe", "roe", "price"];

function badRequest(message) { const e = new Error(message); e.statusCode = 400; return e; }

export function sanitizeScreenerFilter(raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const [k, [lo, hi]] of Object.entries(NUM)) if (Number.isFinite(Number(src[k])) && src[k] !== null && src[k] !== "") out[k] = Math.min(hi, Math.max(lo, Math.round(Number(src[k]) * 10) / 10));
  for (const [k, allowed] of Object.entries(ENUM)) if (allowed.includes(src[k])) out[k] = src[k];
  for (const k of BOOL) if (typeof src[k] === "boolean") out[k] = src[k];
  return out;
}

/** Chuẩn hoá tài liệu: bộ lọc đã lưu (tên ≤ 40 ký tự, không trùng, ≤ 20), cột ẩn / hiện, bộ lọc mặc định khi mở. */
export function sanitizeScreenerPrefs(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw badRequest("Thiếu dữ liệu bộ lọc.");
  const out = { schemaVersion: SCREENER_PREFS_SCHEMA, screens: [], columns: {} };
  const seen = new Set();
  for (const s of Array.isArray(raw.screens) ? raw.screens : []) {
    const name = typeof s?.name === "string" ? s.name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40) : "";
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const screen = { name, filter: sanitizeScreenerFilter(s.filter) };
    if (s.sort && SORT_FIELDS.includes(s.sort.field)) screen.sort = { field: s.sort.field, asc: s.sort.asc === true };
    out.screens.push(screen);
    if (out.screens.length >= MAX_SCREENS) break;
  }
  const cols = raw.columns && typeof raw.columns === "object" && !Array.isArray(raw.columns) ? raw.columns : {};
  for (const c of SCREENER_COLUMNS) if (typeof cols[c] === "boolean") out.columns[c] = cols[c];
  if (typeof raw.defaultScreen === "string" && out.screens.some((s) => s.name === raw.defaultScreen)) out.defaultScreen = raw.defaultScreen;
  if (Buffer.byteLength(JSON.stringify(out)) > MAX_BYTES) throw badRequest("Dữ liệu bộ lọc quá lớn (tối đa 8KB).");
  return out;
}

export async function getUserScreenerPrefs(store, userId) {
  const rows = await store.selectRows(SCREENER_PREFS_TABLE, { eq: { user_id: userId }, limit: 1 });
  const r = rows[0];
  return { prefs: r?.doc ?? null, updatedAt: r?.updated_at ?? null };
}

export async function saveUserScreenerPrefs(store, userId, body, now = new Date()) {
  const doc = sanitizeScreenerPrefs(body?.prefs ?? body);
  const current = await getUserScreenerPrefs(store, userId);
  assertBaseRevision(body, current);
  const updatedAt = nextRevision(now, current.updatedAt);
  await store.upsertRows(SCREENER_PREFS_TABLE, [{ user_id: userId, doc, updated_at: updatedAt }], "user_id");
  return { prefs: doc, updatedAt };
}
