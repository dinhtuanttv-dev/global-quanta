// Đăng nhập trên Railway (A1) — nguyên thuỷ mật mã, CHỈ dùng node:crypto (không thư viện ngoài).
//   Mật khẩu: scrypt (N=2^15, r=8, p=1, salt 16 byte, khoá 32 byte) — mức OWASP cho scrypt; so sánh timingSafeEqual.
//   Token truy cập: JWT ký Ed25519 ("EdDSA"), có kid để xoay khoá; kiểm alg / kid / exp / nbf / iss / aud.
//   Refresh token: 32 byte ngẫu nhiên (base64url) — chỉ lưu SHA-256 của nó.
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, randomUUID, scrypt, sign, timingSafeEqual, verify } from "node:crypto";

export const SCRYPT = { N: 2 ** 15, r: 8, p: 1, keyLen: 32, maxmem: 64 * 1024 * 1024 };
export const ISSUER = "dinhtuan-gateway";
export const AUDIENCE = "dinhtuan-app";

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const scryptAsync = (pw, salt, keyLen, opts) => new Promise((res, rej) => scrypt(pw, salt, keyLen, opts, (e, k) => (e ? rej(e) : res(k))));

/** "scrypt$N$r$p$salt$hash" (base64url). */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(String(password).normalize("NFKC"), salt, SCRYPT.keyLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: SCRYPT.maxmem });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${b64url(salt)}$${b64url(key)}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored ?? "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64url");
  const key = await scryptAsync(String(password).normalize("NFKC"), Buffer.from(salt, "base64url"), expected.length, { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Băm giả để thời gian phản hồi khi email không tồn tại ≈ khi sai mật khẩu (không lộ email nào có tài khoản). */
let dummyHash = null;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hashPassword(randomUUID());
  await verifyPassword(password, dummyHash);
  return false;
}

export const sha256 = (s) => createHash("sha256").update(String(s)).digest("base64url");
export const newRefreshToken = () => b64url(randomBytes(32));
export const newId = () => randomUUID();

/** Khoá ký Ed25519 mới: { kid, privatePem, publicPem, createdAt }. */
export function newSigningKey(now = Date.now()) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    kid: b64url(randomBytes(9)), createdAt: new Date(now).toISOString(),
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }), publicPem: publicKey.export({ type: "spki", format: "pem" }),
  };
}

export function publicJwk(key) {
  const jwk = createPublicKey(key.publicPem).export({ format: "jwk" });
  return { ...jwk, kid: key.kid, alg: "EdDSA", use: "sig" };
}

export function signJwt(claims, key) {
  const header = b64url(JSON.stringify({ alg: "EdDSA", typ: "JWT", kid: key.kid }));
  const body = b64url(JSON.stringify(claims));
  const sig = sign(null, Buffer.from(`${header}.${body}`), createPrivateKey(key.privatePem));
  return `${header}.${body}.${b64url(sig)}`;
}

/** Kiểm JWT với danh sách khoá công khai [{ kid, publicPem }]; trả claims hoặc ném lỗi (statusCode 401). */
export function verifyJwt(token, keys, { nowSec = Math.floor(Date.now() / 1000), leewaySec = 30 } = {}) {
  const fail = (m) => Object.assign(new Error(m), { statusCode: 401 });
  const parts = String(token ?? "").split(".");
  if (parts.length !== 3) throw fail("Token không hợp lệ.");
  let header, claims;
  try { header = JSON.parse(Buffer.from(parts[0], "base64url").toString()); claims = JSON.parse(Buffer.from(parts[1], "base64url").toString()); } catch { throw fail("Token không hợp lệ."); }
  if (header.alg !== "EdDSA" || header.typ !== "JWT") throw fail("Token không hợp lệ.");
  const key = keys.find((k) => k.kid === header.kid);
  if (!key) throw fail("Token không hợp lệ.");
  const ok = verify(null, Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey(key.publicPem), Buffer.from(parts[2], "base64url"));
  if (!ok) throw fail("Token không hợp lệ.");
  if (claims.iss !== ISSUER || claims.aud !== AUDIENCE) throw fail("Token không hợp lệ.");
  if (!Number.isFinite(claims.exp) || claims.exp + leewaySec < nowSec) throw fail("Phiên đăng nhập hết hạn.");
  if (Number.isFinite(claims.nbf) && claims.nbf - leewaySec > nowSec) throw fail("Token chưa có hiệu lực.");
  return claims;
}
