// Lịch sử ELITE COMMAND RADAR (ảnh chụp hằng ngày theo người dùng × ★ danh mục).
// Trình duyệt tính radar (cần dữ liệu của 6 tab) rồi gửi ảnh chụp; Gateway chỉ xác thực người dùng,
// kiểm tra dữ liệu và lưu. Ngày của ảnh chụp do Gateway quyết định (ngày giao dịch gần nhất, giờ VN),
// nên gửi nhiều lần trong ngày chỉ ghi đè ảnh của ngày đó.

import { lastTradingDate } from "../calendar.js";

export const RADAR_TABLE = "market_radar_snapshots";
export const MAX_ITEMS = 80;
export const MAX_DAYS = 90;

const TICKER_RE = /^[A-Z0-9]{3,10}$/;
const STATES = new Set(["stable", "breakout", "caution"]);

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 100) / 100 : null);

/** Chuẩn hoá tên danh mục làm khoá (giữ nguyên chữ, gộp khoảng trắng) — cùng tên trên mọi máy là cùng lịch sử. */
export function normalizeListKey(value) {
  const key = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!key || key.length > 80) throw badRequest("Tên danh mục không hợp lệ.");
  return key;
}

/** Kiểm tra và rút gọn ảnh chụp do trình duyệt gửi. */
export function sanitizeItems(items) {
  if (!Array.isArray(items)) throw badRequest("items phải là mảng.");
  if (items.length > MAX_ITEMS) throw badRequest(`Tối đa ${MAX_ITEMS} mã mỗi ảnh chụp.`);
  const seen = new Set();
  const out = [];
  for (const raw of items) {
    const t = String(raw?.t ?? "").toUpperCase();
    if (!TICKER_RE.test(t) || seen.has(t)) continue;
    const s = Number(raw.s);
    if (!Number.isInteger(s) || s < 0 || s > 6) continue;
    seen.add(t);
    out.push({
      t, s,
      g: String(raw.g ?? "").slice(0, 40) || null,
      sm: num(raw.sm),
      st: STATES.has(raw.st) ? raw.st : "stable",
      core: raw.core === true,
      pass: /^[01-]{6}$/.test(String(raw.pass ?? "")) ? String(raw.pass) : null,
      p: num(raw.p),
      c: num(raw.c),
      ...([-1, 0, 1].includes(raw.sg) ? { sg: raw.sg } : {}),
      // Phiên bản bộ tiêu chí hội tụ (giao diện dùng để không so sánh điểm qua mốc đổi tiêu chí).
      ...(Number.isInteger(raw.cv) && raw.cv >= 1 && raw.cv <= 9 ? { cv: raw.cv } : {}),
    });
  }
  return out;
}

export async function saveSnapshot(store, userId, { list, items }, now = new Date()) {
  const listKey = normalizeListKey(list);
  const clean = sanitizeItems(items);
  const snapDate = lastTradingDate(now);
  await store.upsertRows(RADAR_TABLE, [{
    user_id: userId, list_key: listKey, snap_date: snapDate, items: clean, updated_at: now.toISOString(),
  }], "user_id,list_key,snap_date");
  return { list: listKey, date: snapDate, count: clean.length };
}

export async function getHistory(store, userId, { list, days }, now = new Date()) {
  const listKey = normalizeListKey(list);
  const n = Math.min(MAX_DAYS, Math.max(1, Number.parseInt(days, 10) || 30));
  const from = new Date(now.getTime() - (n * 1.5 + 5) * 86_400_000).toISOString().slice(0, 10); // ~n ngày giao dịch
  const rows = await store.selectRows(RADAR_TABLE, {
    select: "snap_date,items,updated_at",
    eq: { user_id: userId, list_key: listKey },
    gte: { snap_date: from },
    order: "snap_date.asc",
  });
  const snapshots = rows.slice(-n).map((r) => ({ date: String(r.snap_date).slice(0, 10), items: r.items ?? [], updatedAt: r.updated_at ?? null }));
  return { list: listKey, today: lastTradingDate(now), snapshots };
}
