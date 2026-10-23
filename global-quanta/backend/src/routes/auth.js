// /api/auth/* — đăng nhập trên Railway (thay Supabase Auth). Không lưu đệm (no-store); lỗi trả thông báo chung.
//   POST /login {email,password} · POST /refresh {refresh_token} · POST /logout {refresh_token}
//   GET /me · POST /change-password {current_password,new_password} (Bearer) · GET /.well-known/jwks.json (khoá công khai)
//   Quản trị (Bearer MARKET_ADMIN_TOKEN hoặc token của tài khoản admin):
//   GET /admin/users · POST /admin/users {email,password,admin,mustChange} · POST /admin/users/reset {email,password,mustChange}
//   POST /admin/users/disable {email,disabled} · POST /admin/users/revoke {email}
import express from "express";
import { isAdmin } from "./macro.js";

// IP của proxy Railway nối vào CUỐI X-Forwarded-For; các giá trị đầu do client tự gửi được (giả mạo để né giới hạn) -> lấy giá trị cuối.
export const ipOf = (req) => String(req.headers["x-forwarded-for"] ?? "").split(",").map((x) => x.trim()).filter(Boolean).pop() || req.socket?.remoteAddress || "?";

export function createAuthRouter({ getAuth }) {
  const router = express.Router();
  router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  const handle = (fn) => async (req, res) => {
    try { await fn(req, res); } catch (e) {
      const code = e.statusCode ?? 500;
      if (code >= 500) console.error("[auth]", e.message);
      res.status(code).json({ error: code >= 500 ? "Lỗi máy chủ đăng nhập." : e.message });
    }
  };
  const requireAdmin = async (req) => {
    if (isAdmin(req, process.env.MARKET_ADMIN_TOKEN)) return;
    const who = await getAuth().verifyAccess(req.headers.authorization);
    if (!who.admin) throw Object.assign(new Error("Cần quyền quản trị."), { statusCode: 403 });
  };

  router.post("/login", handle(async (req, res) => {
    res.json(await getAuth().login({ email: req.body?.email, password: req.body?.password, ip: ipOf(req), ua: req.headers["user-agent"] }));
  }));
  router.post("/refresh", handle(async (req, res) => {
    res.json(await getAuth().refresh({ refreshToken: req.body?.refresh_token, ip: ipOf(req), ua: req.headers["user-agent"] }));
  }));
  router.post("/logout", handle(async (req, res) => { res.json(await getAuth().logout({ refreshToken: req.body?.refresh_token })); }));
  router.get("/me", handle(async (req, res) => {
    const w = await getAuth().verifyAccess(req.headers.authorization);
    res.json({ id: w.userId, email: w.email, admin: w.admin, mustChangePassword: w.mustChangePassword });
  }));
  router.post("/change-password", handle(async (req, res) => {
    const w = await getAuth().verifyAccess(req.headers.authorization);
    res.json(await getAuth().changePassword({ userId: w.userId, sessionFamily: w.sessionFamily, currentPassword: req.body?.current_password, newPassword: req.body?.new_password }));
  }));
  router.get("/.well-known/jwks.json", handle(async (req, res) => { res.set("Cache-Control", "public, max-age=300"); res.json(await getAuth().jwks()); }));

  router.get("/admin/users", handle(async (req, res) => { await requireAdmin(req); res.json({ users: await getAuth().listUsers() }); }));
  router.post("/admin/users", handle(async (req, res) => {
    await requireAdmin(req);
    res.status(201).json(await getAuth().createUser({ email: req.body?.email, password: req.body?.password, admin: req.body?.admin === true, mustChange: req.body?.mustChange === true }));
  }));
  router.post("/admin/users/reset", handle(async (req, res) => { await requireAdmin(req); res.json(await getAuth().resetPassword({ email: req.body?.email, password: req.body?.password, mustChange: req.body?.mustChange !== false })); }));
  router.post("/admin/users/disable", handle(async (req, res) => { await requireAdmin(req); res.json(await getAuth().setDisabled({ email: req.body?.email, disabled: req.body?.disabled !== false })); }));
  router.post("/admin/users/revoke", handle(async (req, res) => { await requireAdmin(req); res.json(await getAuth().revokeSessions({ email: req.body?.email })); }));
  return router;
}
