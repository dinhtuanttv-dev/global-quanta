process.env.MARKET_ALERTS_ENABLED = "false";

// Đăng nhập trên Railway (A1/A2) — kiểm bảo mật: băm mật khẩu, token Ed25519, xoay refresh token + phát hiện dùng lại, khoá khi dò,
// tài khoản bị khoá, đổi mật khẩu thu hồi phiên khác, quyền admin, nhập dữ liệu Supabase cũ theo email.
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { hashPassword, newSigningKey, signJwt, verifyJwt, verifyPassword, ISSUER, AUDIENCE } from "../src/auth/crypto.js";
import { AUTH, createAuthService, passwordProblem, T } from "../src/auth/authService.js";
import { importSupabaseUserData } from "../src/auth/importSupabaseUserData.js";
import { createAuthRouter } from "../src/routes/auth.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";

const quiet = { info() {}, warn() {} };

test("scrypt: đúng / sai mật khẩu; mỗi lần băm khác salt; chuỗi lưu không chứa mật khẩu", async () => {
  const h1 = await hashPassword("Tuan@12345"), h2 = await hashPassword("Tuan@12345");
  assert.notEqual(h1, h2);
  assert.match(h1, /^scrypt\$32768\$8\$1\$/);
  assert.ok(!h1.includes("Tuan"));
  assert.equal(await verifyPassword("Tuan@12345", h1), true);
  assert.equal(await verifyPassword("tuan@12345", h1), false);
  assert.equal(await verifyPassword("x", "hỏng"), false);
});

test("JWT Ed25519: chữ ký / kid / hạn / iss / aud; token bị sửa hoặc ký bằng khoá khác -> 401", () => {
  const k = newSigningKey(), other = newSigningKey();
  const now = 1_800_000_000;
  const claims = { iss: ISSUER, aud: AUDIENCE, sub: "u1", iat: now, exp: now + 900 };
  const t = signJwt(claims, k);
  assert.equal(verifyJwt(t, [k], { nowSec: now }).sub, "u1");
  const [h, b, s] = t.split(".");
  const forged = `${h}.${Buffer.from(JSON.stringify({ ...claims, sub: "admin" })).toString("base64url")}.${s}`;
  assert.throws(() => verifyJwt(forged, [k], { nowSec: now }), /không hợp lệ/);
  assert.throws(() => verifyJwt(signJwt(claims, other), [k], { nowSec: now }), /không hợp lệ/);
  assert.throws(() => verifyJwt(t, [k], { nowSec: now + 2000 }), /hết hạn/);
  assert.throws(() => verifyJwt(signJwt({ ...claims, aud: "khác" }, k), [k], { nowSec: now }), /không hợp lệ/);
  const none = `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT", kid: k.kid })).toString("base64url")}.${b}.`;
  assert.throws(() => verifyJwt(none, [k], { nowSec: now }), /không hợp lệ/);
});

async function setup() {
  let t = Date.parse("2026-10-23T05:00:00Z");
  const store = createMemoryStore();
  const auth = createAuthService({ store, now: () => t, log: quiet });
  await auth.createUser({ email: "Admin@Example.com", password: "Mat-khau-dai-123", admin: true });
  return { store, auth, tick: (ms) => { t += ms; } };
}

test("đăng nhập: email không phân biệt hoa thường; lỗi chung cho email lạ và sai mật khẩu; token dùng được cho /me", async () => {
  const { auth } = await setup();
  const s = await auth.login({ email: " admin@example.COM ", password: "Mat-khau-dai-123", ip: "1.1.1.1" });
  assert.equal(s.user.admin, true);
  const me = await auth.verifyAccess(`Bearer ${s.access_token}`);
  assert.equal(me.email, "admin@example.com");
  await assert.rejects(() => auth.login({ email: "khong-co@x.vn", password: "a", ip: "1.1.1.2" }), (e) => e.statusCode === 401 && e.message === "Email hoặc mật khẩu không đúng.");
  await assert.rejects(() => auth.login({ email: "admin@example.com", password: "sai", ip: "1.1.1.3" }), (e) => e.message === "Email hoặc mật khẩu không đúng.");
  await assert.rejects(() => auth.verifyAccess("Bearer abc"), (e) => e.statusCode === 401);
  await assert.rejects(() => auth.verifyAccess(undefined), (e) => e.statusCode === 401);
});

test("refresh: xoay vòng; dùng lại refresh token cũ -> thu hồi CẢ chuỗi; đăng xuất thu hồi; hết hạn 30 ngày", async () => {
  const { auth, tick } = await setup();
  const s1 = await auth.login({ email: "admin@example.com", password: "Mat-khau-dai-123", ip: "2.2.2.2" });
  const s2 = await auth.refresh({ refreshToken: s1.refresh_token });
  assert.notEqual(s2.refresh_token, s1.refresh_token);
  await assert.rejects(() => auth.refresh({ refreshToken: s1.refresh_token }), /thu hồi/);
  await assert.rejects(() => auth.refresh({ refreshToken: s2.refresh_token }), /thu hồi/, "cả chuỗi bị thu hồi khi token cũ bị dùng lại");
  const s3 = await auth.login({ email: "admin@example.com", password: "Mat-khau-dai-123", ip: "2.2.2.2" });
  await auth.logout({ refreshToken: s3.refresh_token });
  await assert.rejects(() => auth.refresh({ refreshToken: s3.refresh_token }));
  const s4 = await auth.login({ email: "admin@example.com", password: "Mat-khau-dai-123", ip: "2.2.2.2" });
  tick(AUTH.refreshTtlMs + 1000);
  await assert.rejects(() => auth.refresh({ refreshToken: s4.refresh_token }), /hết hạn/);
});

test("chống dò: sai 10 lần -> khoá 15 phút (kể cả mật khẩu đúng); quá 30 lượt / IP -> 429", async () => {
  const { auth, tick } = await setup();
  for (let i = 0; i < AUTH.failMax; i++) await assert.rejects(() => auth.login({ email: "admin@example.com", password: "sai", ip: `9.9.9.${i}` }));
  await assert.rejects(() => auth.login({ email: "admin@example.com", password: "Mat-khau-dai-123", ip: "9.9.8.1" }), (e) => e.statusCode === 429);
  tick(AUTH.lockMs + 1000);
  assert.ok((await auth.login({ email: "admin@example.com", password: "Mat-khau-dai-123", ip: "9.9.8.2" })).access_token);
  const { auth: a2 } = await setup();
  let limited = false;
  for (let i = 0; i < AUTH.ipMax + 1; i++) { try { await a2.login({ email: `x${i}@y.vn`, password: "z", ip: "7.7.7.7" }); } catch (e) { if (e.statusCode === 429) limited = true; } }
  assert.ok(limited);
});

test("đổi mật khẩu: kiểm mật khẩu hiện tại, tối thiểu 12 ký tự, thu hồi các phiên KHÁC; khoá tài khoản -> token cũ hết dùng được", async () => {
  const { auth, tick } = await setup();
  const a = await auth.login({ email: "admin@example.com", password: "Mat-khau-dai-123", ip: "3.3.3.1" });
  const b = await auth.login({ email: "admin@example.com", password: "Mat-khau-dai-123", ip: "3.3.3.2" });
  const me = await auth.verifyAccess(`Bearer ${a.access_token}`);
  await assert.rejects(() => auth.changePassword({ userId: me.userId, sessionFamily: me.sessionFamily, currentPassword: "sai", newPassword: "Mot-mat-khau-moi-1" }), /hiện tại/);
  await assert.rejects(() => auth.changePassword({ userId: me.userId, sessionFamily: me.sessionFamily, currentPassword: "Mat-khau-dai-123", newPassword: "ngan" }), /12 ký tự/);
  const r = await auth.changePassword({ userId: me.userId, sessionFamily: me.sessionFamily, currentPassword: "Mat-khau-dai-123", newPassword: "Mot-mat-khau-moi-1" });
  assert.equal(r.revokedOtherSessions, 1);
  await assert.rejects(() => auth.refresh({ refreshToken: b.refresh_token }), "phiên máy khác bị thu hồi");
  assert.ok((await auth.refresh({ refreshToken: a.refresh_token })).access_token, "phiên hiện tại vẫn dùng được");
  await assert.rejects(() => auth.login({ email: "admin@example.com", password: "Mat-khau-dai-123", ip: "3.3.3.3" }));
  await auth.setDisabled({ email: "admin@example.com", disabled: true });
  tick(61_000);
  await assert.rejects(() => auth.verifyAccess(`Bearer ${a.access_token}`), /không còn hiệu lực/);
  assert.equal(passwordProblem("dinhtuan-matkhau-x", { email: "dinhtuan.ttv@gmail.com" }), null);
  assert.match(passwordProblem("toi-la-admin-day", { email: "admin@x.vn" }), /tên email/);
});

test("khoá ký bền: tạo một lần, dùng lại sau khởi động lại; JWKS chỉ có khoá CÔNG KHAI", async () => {
  const store = createMemoryStore();
  const a1 = createAuthService({ store, log: quiet });
  await a1.createUser({ email: "a@b.vn", password: "Mat-khau-dai-123" });
  const s = await a1.login({ email: "a@b.vn", password: "Mat-khau-dai-123", ip: "4.4.4.4" });
  const a2 = createAuthService({ store, log: quiet }); // "khởi động lại"
  assert.equal((await a2.verifyAccess(`Bearer ${s.access_token}`)).email, "a@b.vn");
  const jwks = await a2.jwks();
  assert.equal(jwks.keys.length, 1);
  assert.equal(jwks.keys[0].kty, "OKP");
  assert.equal(jwks.keys[0].d, undefined, "không lộ khoá bí mật");
  const b = await a2.backup();
  assert.equal(b.users, 1);
  assert.equal((await store.selectRows(T.backup, {})).length, 1);
});

test("route /api/auth: login / me / quản trị chỉ với MARKET_ADMIN_TOKEN hoặc tài khoản admin; lỗi 5xx không lộ chi tiết", async () => {
  const { auth } = await setup();
  await auth.createUser({ email: "user@x.vn", password: "Mat-khau-dai-123" });
  process.env.MARKET_ADMIN_TOKEN = "adm-test-token";
  const app = express(); app.use(express.json()); app.use("/api/auth", createAuthRouter({ getAuth: () => auth }));
  const server = app.listen(0); const base = `http://127.0.0.1:${server.address().port}/api/auth`;
  try {
    const post = (p, body, h = {}) => fetch(base + p, { method: "POST", headers: { "content-type": "application/json", ...h }, body: JSON.stringify(body) });
    const lg = await (await post("/login", { email: "user@x.vn", password: "Mat-khau-dai-123" })).json();
    assert.ok(lg.access_token);
    const me = await fetch(base + "/me", { headers: { authorization: `Bearer ${lg.access_token}` } });
    assert.equal(me.headers.get("cache-control"), "no-store");
    assert.equal((await me.json()).email, "user@x.vn");
    assert.equal((await fetch(base + "/admin/users", { headers: { authorization: `Bearer ${lg.access_token}` } })).status, 403, "người dùng thường không quản trị được");
    assert.equal((await fetch(base + "/admin/users", { headers: { authorization: "Bearer sai" } })).status, 401);
    const list = await (await fetch(base + "/admin/users", { headers: { authorization: "Bearer adm-test-token" } })).json();
    assert.equal(list.users.length, 2);
    assert.ok(!JSON.stringify(list).includes("scrypt$"), "không trả băm mật khẩu");
    assert.equal((await post("/admin/users", { email: "x@y.vn", password: "Mat-khau-dai-123" }, { authorization: "Bearer adm-test-token" })).status, 201);
    assert.equal((await post("/login", { email: "user@x.vn", password: "sai" })).status, 401);
    const jw = await (await fetch(base + "/.well-known/jwks.json")).json();
    assert.equal(jw.keys[0].alg, "EdDSA");
  } finally { server.close(); delete process.env.MARKET_ADMIN_TOKEN; }
});

test("nhập dữ liệu Supabase cũ: ghép theo email, đổi sang mã mới, không ghi đè dòng đã có cục bộ; email không khớp được báo", async () => {
  const store = createMemoryStore();
  const auth = createAuthService({ store, log: quiet });
  const u = await auth.createUser({ email: "dinh@x.vn", password: "Mat-khau-dai-123", admin: true });
  const old = createMemoryStore();
  await old.upsertRows("market_user_watchlists", [{ user_id: "old-1", state: { lists: ["A"] }, updated_at: "2026-10-01" }], "user_id");
  await old.upsertRows("market_user_chart_state", [{ user_id: "old-1", symbol: "FPT", primitives: [1] }, { user_id: "old-1", symbol: "HPG", primitives: [2] }], "user_id,symbol");
  await store.upsertRows("market_user_chart_state", [{ user_id: u.id, symbol: "FPT", primitives: ["mới"] }], "user_id,symbol");
  const r = await importSupabaseUserData({ store, readInner: (t, q) => old.selectRows(t, q), supabaseUsers: [{ id: "old-1", email: "dinh@x.vn" }, { id: "old-2", email: "khac@x.vn" }] });
  assert.equal(r.matchedUsers, 1);
  assert.equal(r.unmatched.length, 1);
  assert.equal(r.tables.market_user_watchlists.imported, 1);
  assert.equal(r.tables.market_user_chart_state.imported, 1);
  assert.equal(r.tables.market_user_chart_state.skippedExisting, 1);
  const fpt = (await store.selectRows("market_user_chart_state", { eq: { user_id: u.id, symbol: "FPT" } }))[0];
  assert.deepEqual(fpt.primitives, ["mới"], "giữ dòng cục bộ");
});

test("IP cho giới hạn dò mật khẩu = giá trị CUỐI của X-Forwarded-For (proxy Railway), không tin giá trị client tự gửi", async () => {
  const { ipOf } = await import("../src/routes/auth.js");
  assert.equal(ipOf({ headers: { "x-forwarded-for": "6.6.6.6, 203.0.113.9" }, socket: {} }), "203.0.113.9");
  assert.equal(ipOf({ headers: {}, socket: { remoteAddress: "10.0.0.1" } }), "10.0.0.1");
});
