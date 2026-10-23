// Đăng nhập trên Railway (A1) — thay Supabase Auth (đang bị khoá 402). Lưu trên Railway Volume qua kho cục bộ, các bảng auth_*
// là LOCAL-ONLY (không bao giờ sao sang Supabase): auth_users, auth_sessions, auth_keys, auth_backup.
//   Phiên: access token JWT Ed25519 15 phút (Gateway tự kiểm, không gọi mạng) + refresh token 30 ngày, ĐỔI MỚI mỗi lần dùng;
//   dùng lại refresh token đã đổi (dấu hiệu bị lộ) -> thu hồi cả chuỗi phiên. Đổi mật khẩu -> thu hồi mọi phiên khác.
//   Chống dò: ≤ 30 lượt / 15 phút / IP; sai 10 lần / email -> khoá 15 phút; thông báo lỗi chung; email không tồn tại vẫn băm giả.
import { AUDIENCE, ISSUER, burnPasswordCheck, hashPassword, newId, newRefreshToken, newSigningKey, publicJwk, sha256, signJwt, verifyJwt, verifyPassword } from "./crypto.js";

export const AUTH = {
  accessTtlSec: 15 * 60, refreshTtlMs: 30 * 86_400_000, minPassword: 12, adminMinPassword: 8,
  ipWindowMs: 15 * 60_000, ipMax: 30, failMax: 10, lockMs: 15 * 60_000,
};
export const T = { users: "auth_users", sessions: "auth_sessions", keys: "auth_keys", backup: "auth_backup" };

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const normEmail = (e) => String(e ?? "").trim().toLowerCase();
const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/.test(e);

export function passwordProblem(password, { email = "", min = AUTH.minPassword } = {}) {
  const p = String(password ?? "");
  if (p.length < min) return `Mật khẩu tối thiểu ${min} ký tự.`;
  if (p.length > 200) return "Mật khẩu quá dài.";
  if (email && p.toLowerCase().includes(normEmail(email).split("@")[0]) && normEmail(email).split("@")[0].length >= 4) return "Mật khẩu không được chứa tên email.";
  return null;
}

export function createAuthService({ store, now = Date.now, log = console } = {}) {
  const ipHits = new Map(); // ip -> { start, n }
  const fails = new Map(); // email -> { n, lockedUntil }
  const userCache = new Map(); // id -> { at, user }
  let keys = null;

  async function signingKeys() {
    if (keys) return keys;
    const rows = await store.selectRows(T.keys, {});
    if (rows.length) keys = rows.map((r) => r.doc).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    else {
      const k = newSigningKey(now());
      await store.upsertRows(T.keys, [{ kid: k.kid, doc: k }], "kid");
      keys = [k];
      log.info?.("[auth] tạo khoá ký Ed25519 mới");
    }
    return keys;
  }

  const userByEmail = async (email) => (await store.selectRows(T.users, { eq: { email: normEmail(email) } }))[0] ?? null;
  const userById = async (id) => (await store.selectRows(T.users, { eq: { id } }))[0] ?? null;
  const saveUser = async (u) => { userCache.delete(u.id); await store.upsertRows(T.users, [u], "id"); return u; };
  const publicUser = (u) => ({ id: u.id, email: u.email, admin: Boolean(u.admin), mustChangePassword: Boolean(u.must_change) });

  async function issue(user, { family = newId(), ip = null, ua = null } = {}) {
    const [key] = await signingKeys();
    const iat = Math.floor(now() / 1000);
    const access = signJwt({ iss: ISSUER, aud: AUDIENCE, sub: user.id, email: user.email, adm: Boolean(user.admin), mcp: Boolean(user.must_change), sid: family, iat, nbf: iat, exp: iat + AUTH.accessTtlSec }, key);
    const refresh = newRefreshToken();
    await store.upsertRows(T.sessions, [{
      id: newId(), user_id: user.id, family, token_hash: sha256(refresh), created_at: new Date(now()).toISOString(),
      expires_at: new Date(now() + AUTH.refreshTtlMs).toISOString(), rotated_at: null, revoked_at: null, ip: ip ? String(ip).slice(0, 64) : null, ua: ua ? String(ua).slice(0, 160) : null,
    }], "id");
    return { access_token: access, refresh_token: refresh, token_type: "bearer", expires_in: AUTH.accessTtlSec, expires_at: (iat + AUTH.accessTtlSec) * 1000, user: publicUser(user) };
  }

  async function revokeWhere(eq, { exceptFamily = null } = {}) {
    const rows = (await store.selectRows(T.sessions, { eq })).filter((s) => !s.revoked_at && s.family !== exceptFamily);
    if (rows.length) await store.upsertRows(T.sessions, rows.map((s) => ({ ...s, revoked_at: new Date(now()).toISOString() })), "id");
    return rows.length;
  }

  function limitIp(ip) {
    const k = String(ip ?? "?"), t = now(), h = ipHits.get(k);
    if (!h || t - h.start > AUTH.ipWindowMs) { ipHits.set(k, { start: t, n: 1 }); return; }
    if (++h.n > AUTH.ipMax) throw httpError(429, "Quá nhiều lần thử đăng nhập. Vui lòng thử lại sau ít phút.");
    if (ipHits.size > 5000) ipHits.clear();
  }

  return {
    async login({ email, password, ip, ua }) {
      limitIp(ip);
      const e = normEmail(email);
      const f = fails.get(e);
      if (f?.lockedUntil > now()) throw httpError(429, "Tài khoản tạm khoá do nhập sai nhiều lần. Thử lại sau 15 phút.");
      const user = validEmail(e) ? await userByEmail(e) : null;
      const ok = user && !user.disabled ? await verifyPassword(password, user.password_hash) : await burnPasswordCheck(password);
      if (!ok) {
        const n = (f?.n ?? 0) + 1;
        fails.set(e, { n, lockedUntil: n >= AUTH.failMax ? now() + AUTH.lockMs : 0 });
        if (n >= AUTH.failMax) log.warn?.(`[auth] khoá tạm ${e.replace(/(.{2}).*@/, "$1…@")} sau ${n} lần sai`);
        throw httpError(401, "Email hoặc mật khẩu không đúng.");
      }
      fails.delete(e);
      await saveUser({ ...user, last_login_at: new Date(now()).toISOString() });
      return issue(user, { ip, ua });
    },

    async refresh({ refreshToken, ip, ua }) {
      if (!refreshToken) throw httpError(401, "Cần đăng nhập.");
      const s = (await store.selectRows(T.sessions, { eq: { token_hash: sha256(refreshToken) } }))[0];
      if (!s) throw httpError(401, "Phiên đăng nhập không hợp lệ.");
      if (s.rotated_at || s.revoked_at) {
        // Refresh token đã dùng / đã thu hồi được dùng lại -> có thể bị lộ: thu hồi cả chuỗi.
        const n = await revokeWhere({ family: s.family });
        if (s.rotated_at) log.warn?.(`[auth] refresh token bị dùng lại — thu hồi ${n} phiên của chuỗi`);
        throw httpError(401, "Phiên đăng nhập đã bị thu hồi. Vui lòng đăng nhập lại.");
      }
      if (Date.parse(s.expires_at) <= now()) throw httpError(401, "Phiên đăng nhập hết hạn.");
      const user = await userById(s.user_id);
      if (!user || user.disabled) throw httpError(401, "Tài khoản không còn hiệu lực.");
      await store.upsertRows(T.sessions, [{ ...s, rotated_at: new Date(now()).toISOString() }], "id");
      return issue(user, { family: s.family, ip, ua });
    },

    async logout({ refreshToken }) {
      if (!refreshToken) return { ok: true };
      const s = (await store.selectRows(T.sessions, { eq: { token_hash: sha256(refreshToken) } }))[0];
      if (s) await revokeWhere({ family: s.family });
      return { ok: true };
    },

    /** Kiểm "Authorization: Bearer …" -> { userId, email, admin, mustChangePassword }; tài khoản bị khoá -> 401 (đệm 60 giây). */
    async verifyAccess(authorization) {
      const token = /^Bearer\s+(.+)$/i.exec(String(authorization ?? ""))?.[1]?.trim();
      if (!token) throw httpError(401, "Cần đăng nhập.");
      const claims = verifyJwt(token, await signingKeys(), { nowSec: Math.floor(now() / 1000) });
      let c = userCache.get(claims.sub);
      if (!c || now() - c.at > 60_000) { c = { at: now(), user: await userById(claims.sub) }; userCache.set(claims.sub, c); }
      if (!c.user || c.user.disabled) throw httpError(401, "Tài khoản không còn hiệu lực.");
      return { userId: claims.sub, email: claims.email, admin: Boolean(c.user.admin), mustChangePassword: Boolean(c.user.must_change), sessionFamily: claims.sid };
    },

    async changePassword({ userId, sessionFamily, currentPassword, newPassword }) {
      const user = await userById(userId);
      if (!user || user.disabled) throw httpError(401, "Tài khoản không còn hiệu lực.");
      if (!(await verifyPassword(currentPassword, user.password_hash))) throw httpError(400, "Mật khẩu hiện tại không đúng.");
      const problem = passwordProblem(newPassword, { email: user.email });
      if (problem) throw httpError(400, problem);
      if (await verifyPassword(newPassword, user.password_hash)) throw httpError(400, "Mật khẩu mới phải khác mật khẩu hiện tại.");
      await saveUser({ ...user, password_hash: await hashPassword(newPassword), must_change: false, password_changed_at: new Date(now()).toISOString() });
      const revoked = await revokeWhere({ user_id: userId }, { exceptFamily: sessionFamily });
      return { ok: true, revokedOtherSessions: revoked };
    },

    jwks: async () => ({ keys: (await signingKeys()).map(publicJwk) }),

    // ---------------------------------------------------------------- quản trị
    async createUser({ email, password, admin = false, mustChange = false }) {
      const e = normEmail(email);
      if (!validEmail(e)) throw httpError(400, "Email không hợp lệ.");
      if (await userByEmail(e)) throw httpError(409, "Email đã có tài khoản.");
      const problem = passwordProblem(password, { min: AUTH.adminMinPassword });
      if (problem) throw httpError(400, problem);
      const u = { id: newId(), email: e, password_hash: await hashPassword(password), admin: Boolean(admin), disabled: false, must_change: Boolean(mustChange),
        created_at: new Date(now()).toISOString(), password_changed_at: new Date(now()).toISOString(), last_login_at: null };
      await saveUser(u);
      return publicUser(u);
    },
    async resetPassword({ email, password, mustChange = true }) {
      const u = await userByEmail(email);
      if (!u) throw httpError(404, "Không có tài khoản này.");
      const problem = passwordProblem(password, { min: AUTH.adminMinPassword });
      if (problem) throw httpError(400, problem);
      await saveUser({ ...u, password_hash: await hashPassword(password), must_change: Boolean(mustChange), password_changed_at: new Date(now()).toISOString() });
      fails.delete(u.email);
      return { ok: true, revokedSessions: await revokeWhere({ user_id: u.id }) };
    },
    async setDisabled({ email, disabled }) {
      const u = await userByEmail(email);
      if (!u) throw httpError(404, "Không có tài khoản này.");
      await saveUser({ ...u, disabled: Boolean(disabled) });
      return { ok: true, revokedSessions: disabled ? await revokeWhere({ user_id: u.id }) : 0 };
    },
    async revokeSessions({ email }) {
      const u = await userByEmail(email);
      if (!u) throw httpError(404, "Không có tài khoản này.");
      return { ok: true, revokedSessions: await revokeWhere({ user_id: u.id }) };
    },
    async listUsers() {
      const users = await store.selectRows(T.users, {});
      const sessions = await store.selectRows(T.sessions, {});
      return users.map((u) => ({ ...publicUser(u), disabled: Boolean(u.disabled), createdAt: u.created_at, lastLoginAt: u.last_login_at,
        activeSessions: sessions.filter((s) => s.user_id === u.id && !s.revoked_at && !s.rotated_at && Date.parse(s.expires_at) > now()).length }));
    },
    /** Sao lưu hằng ngày (bảng local-only trên Volume): tài khoản + khoá ký; giữ 14 bản. Dọn phiên hết hạn > 7 ngày. */
    async backup() {
      const date = new Date(now()).toISOString().slice(0, 10);
      const users = await store.selectRows(T.users, {});
      await store.upsertRows(T.backup, [{ date, doc: { users, keys: await store.selectRows(T.keys, {}) } }], "date");
      const old = (await store.selectRows(T.backup, {})).map((r) => r.date).sort().slice(0, -14);
      for (const d of old) await store.deleteRows(T.backup, { eq: { date: d } });
      const cutoff = now() - 7 * 86_400_000;
      const stale = (await store.selectRows(T.sessions, {})).filter((s) => Date.parse(s.expires_at) < cutoff);
      for (const s of stale) await store.deleteRows(T.sessions, { eq: { id: s.id } });
      return { date, users: users.length, prunedSessions: stale.length, removedBackups: old.length };
    },
  };
}
