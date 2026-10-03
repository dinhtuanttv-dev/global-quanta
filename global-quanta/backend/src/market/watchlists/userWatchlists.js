// ★ Danh mục tự chọn theo TÀI KHOẢN (đồng bộ mọi máy đã đăng nhập). Trình duyệt vẫn giữ bản sao trong localStorage để dùng
// ngay/offline; Gateway xác thực phiên Supabase rồi đọc/ghi bảng market_user_watchlists bằng service_role (trình duyệt KHÔNG
// đọc/ghi trực tiếp bảng). Một dòng / người dùng = toàn bộ trạng thái danh mục (danh sách, mã, ghi chú, mã ghim, chọn Radar).

export const WATCHLIST_TABLE = "market_user_watchlists";
export const MAX_LISTS = 20;
export const MAX_TICKERS = 60;
const TICKER_RE = /^[A-Z][A-Z0-9]{2,5}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

/** Kiểm tra + rút gọn trạng thái danh mục do trình duyệt gửi (không tin dữ liệu đầu vào). */
export function sanitizeWatchlistState(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.lists)) throw badRequest("state.lists phải là mảng.");
  if (raw.lists.length === 0) throw badRequest("Cần ít nhất 1 danh mục.");
  if (raw.lists.length > MAX_LISTS) throw badRequest(`Tối đa ${MAX_LISTS} danh mục.`);
  const seenIds = new Set();
  const lists = [];
  for (const l of raw.lists) {
    const id = String(l?.id ?? "");
    if (!ID_RE.test(id) || seenIds.has(id)) continue;
    seenIds.add(id);
    const tickers = [...new Set((Array.isArray(l.tickers) ? l.tickers : []).map((t) => String(t).toUpperCase()).filter((t) => TICKER_RE.test(t)))].slice(0, MAX_TICKERS);
    const notes = {};
    if (l.notes && typeof l.notes === "object") {
      for (const [t, v] of Object.entries(l.notes)) if (tickers.includes(t) && typeof v === "string" && v.trim()) notes[t] = v.slice(0, 200);
    }
    const pinned = (Array.isArray(l.pinned) ? l.pinned : []).map((t) => String(t).toUpperCase()).filter((t) => tickers.includes(t));
    lists.push({
      id,
      name: String(l.name ?? "").trim().slice(0, 60) || `Danh mục ${lists.length + 1}`,
      tickers,
      ...(Object.keys(notes).length ? { notes } : {}),
      ...(pinned.length ? { pinned: [...new Set(pinned)] } : {}),
    });
  }
  if (!lists.length) throw badRequest("Không có danh mục hợp lệ.");
  const has = (id) => lists.some((l) => l.id === id);
  return {
    lists,
    activeId: has(raw.activeId) ? raw.activeId : lists[0].id,
    ...(has(raw.radarId) ? { radarId: raw.radarId } : {}),
  };
}

export async function getUserWatchlists(store, userId) {
  const rows = await store.selectRows(WATCHLIST_TABLE, { select: "state,updated_at", eq: { user_id: userId } });
  const r = rows[0];
  return r ? { state: r.state ?? null, updatedAt: r.updated_at ?? null } : { state: null, updatedAt: null };
}

export async function saveUserWatchlists(store, userId, body, now = new Date()) {
  const state = sanitizeWatchlistState(body?.state);
  const updatedAt = now.toISOString();
  await store.upsertRows(WATCHLIST_TABLE, [{ user_id: userId, state, updated_at: updatedAt }], "user_id");
  return { state, updatedAt };
}
