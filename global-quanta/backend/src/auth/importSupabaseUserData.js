// Đăng nhập trên Railway (A2) — nhập MỘT LẦN dữ liệu người dùng cũ trên Supabase (danh mục ★, hình vẽ biểu đồ, ảnh chụp radar)
// sang kho cục bộ khi Supabase mở lại. Ghép người dùng theo EMAIL: Supabase Auth admin API (khoá bí mật của Gateway) -> mã cũ;
// tài khoản Gateway -> mã mới. Không ghi đè dòng đã có cục bộ (người dùng có thể đã dùng ứng dụng sau khi chuyển).
import { T } from "./authService.js";

export const USER_DATA = [
  { table: "market_user_watchlists", conflict: "user_id", key: (r) => r.user_id },
  { table: "market_user_chart_state", conflict: "user_id,symbol", key: (r) => `${r.user_id}|${r.symbol}` },
  { table: "market_radar_snapshots", conflict: "user_id,list_key,snap_date", key: (r) => `${r.user_id}|${r.list_key}|${r.snap_date}` },
];

/** Người dùng Supabase Auth (id, email) qua admin API — cần SUPABASE_URL + SUPABASE_SECRET_KEY. */
export async function listSupabaseUsers({ fetchImpl = globalThis.fetch, env = process.env } = {}) {
  const url = String(env.SUPABASE_URL || "").replace(/\/+$/, ""), key = env.SUPABASE_SECRET_KEY || "";
  if (!url || !key) throw new Error("Thiếu SUPABASE_URL / SUPABASE_SECRET_KEY.");
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const r = await fetchImpl(`${url}/auth/v1/admin/users?page=${page}&per_page=200`, { headers: { apikey: key, authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`Supabase Auth admin HTTP ${r.status}`);
    const users = (await r.json())?.users ?? [];
    out.push(...users.filter((u) => u?.id && u?.email).map((u) => ({ id: u.id, email: String(u.email).toLowerCase() })));
    if (users.length < 200) break;
  }
  return out;
}

/**
 * @param {{ store, readInner: (table, query) => Promise<any[]>, supabaseUsers: {id,email}[] }} p
 */
export async function importSupabaseUserData({ store, readInner, supabaseUsers }) {
  const local = await store.selectRows(T.users, {});
  const newIdByEmail = new Map(local.map((u) => [u.email, u.id]));
  const report = { matchedUsers: 0, unmatched: [], tables: {} };
  for (const { table, conflict, key } of USER_DATA) report.tables[table] = { read: 0, imported: 0, skippedExisting: 0 };
  for (const su of supabaseUsers) {
    const newId = newIdByEmail.get(su.email);
    if (!newId) { report.unmatched.push(su.email.replace(/(.{2}).*@/, "$1…@")); continue; }
    report.matchedUsers++;
    for (const { table, conflict, key } of USER_DATA) {
      const rows = await readInner(table, { eq: { user_id: su.id } });
      const have = new Set((await store.selectRows(table, { eq: { user_id: newId } })).map(key));
      const fresh = rows.map((r) => ({ ...r, user_id: newId })).filter((r) => !have.has(key(r)));
      const st = report.tables[table];
      st.read += rows.length; st.skippedExisting += rows.length - fresh.length;
      if (fresh.length) { await store.upsertRows(table, fresh, conflict); st.imported += fresh.length; }
    }
  }
  return report;
}
