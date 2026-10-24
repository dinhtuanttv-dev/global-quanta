// Super Chart SC1 — BỐ CỤC tab TA VN-Index theo TÀI KHOẢN (anh duyệt 24/10/2026, lựa chọn 3): preset, lớp đang bật, bảng chi tiết,
// dock, tỷ lệ pane… Tách hẳn khỏi hình vẽ (market_user_chart_state, theo mã) — chỉ là sở thích hiển thị, không chứa dữ liệu phân tích.
// Bảng chỉ ở kho cục bộ Railway (localFirstStore.isLocalOnlyTable). Không tin dữ liệu vào: chỉ nhận khoá / kiểu đã biết, ≤ 8KB.
import { assertBaseRevision, nextRevision } from "./revision.js";

export const WORKSPACE_TABLE = "market_user_workspace";
export const WORKSPACE_SCHEMA = 1;
const MAX_BYTES = 8 * 1024;
const KEY_RE = /^[a-zA-Z][a-zA-Z0-9]{1,23}$/;
const ENUMS = {
  preset: new Set(["clean", "priceVolume", "structure", "momentum", "elliott", "manual", "mine", "custom"]),
  inspectorTab: new Set(["overview", "objects", "notes"]),
  dockTab: new Set(["structure", "elliott", "methods", "flow", "indicators", "backtest", "log"]),
  layout: new Set(["workspace", "classic"]),
  structureMode: new Set(["overview", "trade", "deep"]),
  elliottProMode: new Set(["compact", "chart", "deep"]),
};

// R5: tham số chỉ báo — miền giống hệt frontend (workspace/indicatorSettings.ts). Ngày neo AVWAP lưu theo mã (≤ 30 mã).
const IND_LIMITS = {
  rsi: { period: [2, 100, 14], upper: [51, 95, 70], lower: [5, 49, 30] },
  macd: { fast: [2, 50, 12], slow: [3, 200, 26], signal: [2, 50, 9] },
  adx: { period: [2, 100, 14], threshold: [10, 60, 25] },
  vprofile: { bars: [20, 500, 60] },
};
const IND_ENUMS = { rsi: { method: ["wilder", "cutler"] }, vprofile: { method: ["triangular", "uniform"] } };
const DATE_RE = /^\d{4}-\d{2}-\d{2}(T[0-9:.+Z-]{4,20})?$/;
const TICKER_RE = /^[A-Z0-9]{2,12}$/;

export function sanitizeIndicators(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out = {};
  for (const [sec, fields] of Object.entries(IND_LIMITS)) {
    const src = raw[sec] && typeof raw[sec] === "object" ? raw[sec] : {};
    out[sec] = {};
    for (const [f, [lo, hi, d]] of Object.entries(fields)) out[sec][f] = Number.isFinite(Number(src[f])) ? Math.min(hi, Math.max(lo, Math.round(Number(src[f])))) : d;
    for (const [f, allowed] of Object.entries(IND_ENUMS[sec] ?? {})) out[sec][f] = allowed.includes(src[f]) ? src[f] : allowed[0];
  }
  if (out.macd.fast >= out.macd.slow) { out.macd.fast = 12; out.macd.slow = 26; }
  const anchors = raw.avwap?.anchors && typeof raw.avwap.anchors === "object" ? Object.entries(raw.avwap.anchors) : [];
  out.avwap = { anchors: {} };
  for (const [t, d] of anchors.slice(-30)) if (TICKER_RE.test(t) && typeof d === "string" && DATE_RE.test(d)) out.avwap.anchors[t] = d;
  return out;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

const bool = (v) => (typeof v === "boolean" ? v : undefined);
const num = (v, lo, hi) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : undefined);

/** Chuẩn hoá tài liệu bố cục: khoá lạ bị bỏ, giá trị ngoài miền bị bỏ / kẹp. */
export function sanitizeWorkspace(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw badRequest("Thiếu dữ liệu bố cục.");
  const out = { schemaVersion: WORKSPACE_SCHEMA };
  for (const [k, set] of Object.entries(ENUMS)) if (set.has(raw[k])) out[k] = raw[k];
  for (const k of ["inspectorOpen", "dockOpen", "magnet"]) { const b = bool(raw[k]); if (b !== undefined) out[k] = b; }
  const h = num(raw.dockHeight, 160, 1200); if (h !== undefined) out.dockHeight = Math.round(h);
  for (const key of ["layers", "mine"]) {
    const src = raw[key];
    if (!src || typeof src !== "object" || Array.isArray(src)) continue;
    out[key] = {};
    for (const [k, v] of Object.entries(src).slice(0, 40)) if (KEY_RE.test(k) && typeof v === "boolean") out[key][k] = v;
  }
  if (raw.paneStretch && typeof raw.paneStretch === "object" && !Array.isArray(raw.paneStretch)) {
    out.paneStretch = {};
    for (const [k, v] of Object.entries(raw.paneStretch).slice(0, 8)) { const x = num(v, 0.02, 1); if (KEY_RE.test(k) && x !== undefined) out.paneStretch[k] = Math.round(x * 1000) / 1000; }
  }
  const ind = sanitizeIndicators(raw.indicators);
  if (ind) out.indicators = ind;
  if (Buffer.byteLength(JSON.stringify(out)) > MAX_BYTES) throw badRequest("Bố cục quá lớn (tối đa 8KB).");
  return out;
}

export async function getUserWorkspace(store, userId) {
  const rows = await store.selectRows(WORKSPACE_TABLE, { eq: { user_id: userId }, limit: 1 });
  const r = rows[0];
  return { workspace: r?.doc ?? null, updatedAt: r?.updated_at ?? null };
}

export async function saveUserWorkspace(store, userId, body, now = new Date()) {
  const doc = sanitizeWorkspace(body?.workspace ?? body);
  const current = await getUserWorkspace(store, userId);
  assertBaseRevision(body, current);
  const updatedAt = nextRevision(now, current.updatedAt);
  await store.upsertRows(WORKSPACE_TABLE, [{ user_id: userId, doc, updated_at: updatedAt }], "user_id");
  return { workspace: doc, updatedAt };
}
