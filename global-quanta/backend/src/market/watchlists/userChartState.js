// Hình vẽ tay trên biểu đồ TA VN-Index theo TÀI KHOẢN + MÃ (đồng bộ mọi máy đã đăng nhập).
// Gateway xác thực phiên Supabase rồi đọc/ghi market_user_chart_state bằng service_role; trình duyệt không truy cập bảng.

export const CHART_STATE_TABLE = "market_user_chart_state";
export const MAX_PRIMITIVES = 100;
const MAX_BYTES = 64 * 1024;
const SYMBOL_RE = /^[A-Z][A-Z0-9]{2,9}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}/;
const TOOLS = new Set(["rectangle", "trendline", "fibonacci", "elliott", "fibTimeZone"]);

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export function normalizeChartSymbol(raw) {
  const s = String(raw ?? "").trim().toUpperCase();
  if (!SYMBOL_RE.test(s)) throw badRequest("symbol không hợp lệ.");
  return s;
}

const point = (p) => p && typeof p === "object" && typeof p.date === "string" && DATE_RE.test(p.date) && Number.isFinite(Number(p.price))
  ? { date: p.date.slice(0, 10), price: Number(p.price) } : null;

/** Kiểm tra + chuẩn hoá danh sách hình vẽ (không tin dữ liệu đầu vào). */
export function sanitizeChartPrimitives(raw) {
  if (!Array.isArray(raw)) throw badRequest("primitives phải là mảng.");
  const out = [];
  for (const p of raw.slice(0, MAX_PRIMITIVES)) {
    if (!p || typeof p !== "object" || !TOOLS.has(p.toolType)) continue;
    const id = String(p.id ?? "").slice(0, 60);
    if (!id) continue;
    const createdAt = Number.isFinite(Number(p.createdAt)) ? Number(p.createdAt) : Date.now();
    if (p.toolType === "elliott") {
      const pts = Array.isArray(p.points) ? p.points.map(point) : [];
      if (pts.length !== 6 || pts.some((x) => !x)) continue;
      const labels = Array.isArray(p.labels) ? p.labels.slice(0, 6).map((l) => String(l).slice(0, 4)) : ["0", "1", "2", "3", "4", "5"];
      const violations = Array.isArray(p.violations) ? p.violations.slice(0, 5).map((v) => String(v).slice(0, 160)) : [];
      out.push({ id, toolType: "elliott", points: pts, labels, violations, createdAt });
    } else if (p.toolType === "fibTimeZone") {
      const anchor = point(p.anchor);
      if (anchor) out.push({ id, toolType: "fibTimeZone", anchor, createdAt });
    } else {
      const p1 = point(p.p1);
      const p2 = point(p.p2);
      if (!p1 || !p2) continue;
      const item = { id, toolType: p.toolType, p1, p2, createdAt };
      if (p.toolType === "fibonacci") {
        item.levels = (Array.isArray(p.levels) ? p.levels : [])
          .slice(0, 12)
          .map((l) => ({ ratio: Number(l?.ratio), price: Number(l?.price) }))
          .filter((l) => Number.isFinite(l.ratio) && Number.isFinite(l.price));
      }
      out.push(item);
    }
  }
  if (Buffer.byteLength(JSON.stringify(out)) > MAX_BYTES) throw badRequest("Dữ liệu hình vẽ quá lớn (tối đa 64KB/mã).");
  return out;
}

export async function getUserChartState(store, userId, symbol) {
  const rows = await store.selectRows(CHART_STATE_TABLE, { select: "primitives,updated_at", eq: { user_id: userId, symbol }, limit: 1 });
  const r = rows[0];
  return r ? { symbol, primitives: r.primitives ?? [], updatedAt: r.updated_at ?? null } : { symbol, primitives: [], updatedAt: null };
}

export async function saveUserChartState(store, userId, symbol, body, now = new Date()) {
  const primitives = sanitizeChartPrimitives(body?.primitives);
  const updatedAt = now.toISOString();
  await store.upsertRows(CHART_STATE_TABLE, [{ user_id: userId, symbol, primitives, updated_at: updatedAt }], "user_id,symbol");
  return { symbol, primitives, updatedAt };
}
