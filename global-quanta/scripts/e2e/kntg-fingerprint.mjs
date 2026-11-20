
// G0 (19/11/2026) — VÂN TAY SỐ LIỆU của tab KẾT NỐI THẾ GIỚI (Giao-dien-KNTG/05).
// Chứng minh nâng cấp giao diện không đổi bất kỳ con số / nhãn kết luận nào:
//   record  <BASE>  mở 5 tab con trên bản dựng GỐC, ghi MỌI phản hồi Gateway vào kho phát lại + vân tay nền.
//   compare <BASE>  mở bản dựng ĐÃ SỬA, phát lại đúng kho đó (cùng dữ liệu, cùng đồng hồ cố định), trích vân tay, so với nền.
// Vân tay = với mỗi tab con, multiset mọi đoạn chữ hiển thị có chữ số hoặc nhãn kết luận (ĐẠT, KHÔNG ĐẠT, bậc, bất ổn, ?…),
// sau khi mở mọi khối thu gọn (<details>, "Xem thêm"). So như multiset nên đổi bố cục / thứ tự không làm trượt; đổi số thì trượt.
// Chạy: E2E_EMAIL=… E2E_PASSWORD=… [E2E_AUTH_GATEWAY=http://localhost:8787] [NODE_PATH=…/node_modules]
//       node scripts/e2e/kntg-fingerprint.mjs record  http://localhost:4173 --store .kntg/replay.json --out .kntg/base.json
//       node scripts/e2e/kntg-fingerprint.mjs compare http://localhost:4174 --store .kntg/replay.json --baseline .kntg/base.json [--allow allow.json]
// allow.json: { "<tab>": { "remove": ["…"], "add": ["…"] } } — khác biệt được phép (câu chữ đã sửa có chủ đích), phải nêu trong PR.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const [MODE, BASE] = process.argv.slice(2);
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const STORE = arg("--store", ".kntg/replay.json"), OUT = arg("--out", MODE === "record" ? ".kntg/base.json" : ".kntg/after.json");
const BASELINE = arg("--baseline", ".kntg/base.json"), ALLOW = arg("--allow");
if (!["record", "compare"].includes(MODE) || !BASE) { console.error("Dùng: record|compare <BASE> [--store] [--out] [--baseline] [--allow]"); process.exit(2); }
const EMAIL = process.env.E2E_EMAIL, PASSWORD = process.env.E2E_PASSWORD;
const GW = /gateway-production-1da0\.up\.railway\.app/;
const USER = /\/api\/(auth\/|market\/(watchlists|chart-state|elliott\/counts|elliott\/alerts|radar(?!\/signals)|workspace|screener-prefs))/;
const TABS = ["overview", "sectors", "markets", "transmission", "evidence"];
// Đoạn chữ được tính vào vân tay: có chữ số, hoặc là nhãn kết luận / bằng chứng.
const VERDICT = /(KHÔNG ĐẠT|ĐẠT|THĂM DÒ|MÔ TẢ|CHƯA KIỂM ĐỊNH|ĐANG TÍCH LUỸ|MỘT PHẦN|bất ổn|Bậc [ABC]|Ưu tiên|Giảm tỷ trọng|Trung tính|Bối cảnh (thuận|bất lợi)|Hỗn hợp|Căng thẳng|Bất thường|Phản ánh (ngay|chậm)|Không đo được|Chưa đo được|\?$)/;

fs.mkdirSync(path.dirname(STORE), { recursive: true }); fs.mkdirSync(path.dirname(OUT), { recursive: true });
const store = MODE === "record" ? { fixedTime: Date.now(), responses: {} } : JSON.parse(fs.readFileSync(STORE, "utf8"));
const keyOf = (req) => {
  const u = new URL(req.url());
  for (const p of ["_", "t", "ts", "nocache"]) u.searchParams.delete(p);
  return `${req.method()} ${u.pathname}${u.search} ${req.method() === "POST" ? (req.postData() ?? "") : ""}`;
};
let misses = 0;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
await ctx.clock.setFixedTime(new Date(store.fixedTime)); // "x phút trước", "cập nhật hh:mm" giống nhau ở hai lần chạy
await ctx.route(GW, async (route) => {
  const req = route.request();
  const cors = { "access-control-allow-origin": req.headers().origin ?? "*", "access-control-allow-credentials": "true", "access-control-allow-headers": req.headers()["access-control-request-headers"] ?? "authorization,content-type", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
  if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  if (USER.test(req.url())) {
    // dữ liệu người dùng / đăng nhập: Gateway cục bộ (tài khoản thử), không vào vân tay
    const url = process.env.E2E_AUTH_GATEWAY ? req.url().replace(/^https:\/\/[^/]+/, process.env.E2E_AUTH_GATEWAY) : req.url();
    try { const r = await route.fetch({ url, headers: { ...req.headers(), origin: "https://dinhtuan-ck.vercel.app" } }); return route.fulfill({ response: r, headers: { ...r.headers(), ...cors } }); } catch { return route.abort(); }
  }
  // luồng giá trực tiếp của thanh trên cùng (SSE): không thuộc tab, không phát lại được -> chặn ở cả hai chế độ
  if (/\/api\/market\/stream/.test(req.url())) return route.abort();
  const k = keyOf(req);
  if (MODE === "compare") {
    const hit = store.responses[k];
    if (hit) return route.fulfill({ status: hit.status, headers: { "content-type": hit.type, ...cors }, body: Buffer.from(hit.body, "base64") });
    misses++; console.warn(`  [không có trong kho] ${k.slice(0, 120)}`);
    return route.fulfill({ status: 503, headers: { "content-type": "application/json", ...cors }, body: JSON.stringify({ error: "Không có trong kho phát lại." }) });
  }
  try {
    const r = await route.fetch({ headers: { ...req.headers(), origin: "https://dinhtuan-ck.vercel.app" } });
    const body = await r.body();
    store.responses[k] ??= { status: r.status(), type: r.headers()["content-type"] ?? "application/json", body: body.toString("base64") };
    return route.fulfill({ status: r.status(), headers: { ...r.headers(), ...cors }, body });
  } catch { return route.abort(); }
});
// phông Google không ảnh hưởng số liệu; chặn để chụp/đo không treo
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));

const p = await ctx.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message.slice(0, 160)));
await p.goto(`${BASE}/?tab=ket-noi-the-gioi`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await p.waitForTimeout(1500);
if (await p.locator("#login-email").count()) {
  if (!EMAIL || !PASSWORD) { console.error("Cần E2E_EMAIL và E2E_PASSWORD."); process.exit(2); }
  await p.fill("#login-email", EMAIL); await p.fill("#login-password", PASSWORD); await p.click(".login-btn"); await p.waitForTimeout(2000);
}
await p.waitForSelector("#world-overview-tab", { timeout: 60_000 });
await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("gq.world.")) localStorage.removeItem(k); });

const prints = {};
for (const T of TABS) {
  await p.locator(`#world-${T}-tab`).click();
  // chờ ổn định: không còn dòng "Đang …" và nội dung không đổi trong 3 giây (tối đa 60 giây)
  let last = "", stable = 0;
  for (let i = 0; i < 60 && stable < 3; i++) {
    await p.waitForTimeout(1000);
    const cur = await p.evaluate((T) => { const r = document.getElementById(`world-${T}-panel`); return r ? r.innerText.length + "|" + /Đang (tải|tính|ước lượng|đo|mô phỏng)/.test(r.innerText) : ""; }, T);
    stable = cur === last && !cur.endsWith("true") ? stable + 1 : 0; last = cur;
  }
  // mở mọi khối thu gọn và "Xem thêm"
  for (let round = 0; round < 25; round++) {
    const n = await p.evaluate((T) => {
      const r = document.getElementById(`world-${T}-panel`); if (!r) return 0;
      let c = 0;
      for (const d of r.querySelectorAll("details:not([open])")) { d.open = true; c++; }
      for (const b of r.querySelectorAll("button, [role=button]")) if (/^\s*(Xem thêm|Mở|Hiện thêm|Hiện tất cả)/.test(b.textContent ?? "") && b.getAttribute("aria-expanded") !== "true" && !b.dataset.fpClicked) { b.dataset.fpClicked = "1"; b.click(); c++; }
      return c;
    }, T);
    if (!n) break;
    await p.waitForTimeout(600);
  }
  prints[T] = await p.evaluate(({ T, src }) => {
    const re = new RegExp(src);
    const r = document.getElementById(`world-${T}-panel`); if (!r) return [];
    const out = [];
    for (const e of r.querySelectorAll("*")) {
      const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
      if (!own) continue;
      if (/\d/.test(own) || re.test(own)) out.push(own);
    }
    for (const t of r.querySelectorAll("svg text")) { const s = t.textContent.replace(/\s+/g, " ").trim(); if (s && /\d/.test(s)) out.push(`svg:${s}`); }
    return out.sort();
  }, { T, src: VERDICT.source });
  console.log(`${T}: ${prints[T].length} đoạn`);
}
await browser.close();
const doc = { mode: MODE, base: BASE, fixedTime: new Date(store.fixedTime).toISOString(), at: new Date().toISOString(), misses, pageErrors: errs, prints };
fs.writeFileSync(OUT, JSON.stringify(doc, null, 1));
if (MODE === "record") { fs.writeFileSync(STORE, JSON.stringify(store)); console.log(`Kho phát lại: ${Object.keys(store.responses).length} phản hồi -> ${STORE}`); process.exit(0); }

// so sánh multiset
const base = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
const allow = ALLOW ? JSON.parse(fs.readFileSync(ALLOW, "utf8")) : {};
const count = (xs) => xs.reduce((m, x) => m.set(x, (m.get(x) ?? 0) + 1), new Map());
let bad = 0;
for (const T of TABS) {
  const a = count(base.prints[T] ?? []), b = count(prints[T] ?? []);
  const removed = [], added = [];
  for (const [k, n] of a) for (let i = (b.get(k) ?? 0); i < n; i++) removed.push(k);
  for (const [k, n] of b) for (let i = (a.get(k) ?? 0); i < n; i++) added.push(k);
  const ok = (list, allowed = []) => list.filter((x) => !allowed.includes(x));
  // G4: "addPattern" — đoạn THÊM khớp mẫu (VD nhãn trục "T0…T12", bảng thay thế lặp lại số đã có) được phép nhưng vẫn liệt kê
  // để duyệt. Một con số bị ĐỔI luôn hiện thành "mất đi" ở nền, nên phần "mất đi" vẫn chặn tuyệt đối.
  const pats = (allow[T]?.addPattern ?? []).map((p) => new RegExp(p));
  const r = ok(removed, allow[T]?.remove), d = ok(added, allow[T]?.add).filter((x) => !pats.some((re) => re.test(x)));
  const patAdded = added.length - ok(added, allow[T]?.add).length + ok(added, allow[T]?.add).filter((x) => pats.some((re) => re.test(x))).length;
  if (patAdded && process.argv.includes("--list-additions")) for (const x of added.filter((x) => pats.some((re) => re.test(x))).slice(0, 40)) console.log(`    (thêm theo mẫu) ${x}`);
  const pass = !r.length && !d.length;
  if (!pass) bad++;
  console.log(`${pass ? "✔" : "✖"} ${T}: nền ${base.prints[T]?.length ?? 0} · sau ${prints[T].length}${removed.length + added.length ? ` · được phép ${removed.length - r.length + added.length - d.length}` : ""}`);
  for (const x of r.slice(0, 15)) console.log(`    − ${x}`);
  for (const x of d.slice(0, 15)) console.log(`    + ${x}`);
}
console.log(misses ? `\n${misses} yêu cầu không có trong kho phát lại (khác nền -> cần ghi lại nền)` : "");
console.log(bad ? `\nVÂN TAY KHÁC NỀN ở ${bad} tab con` : "\nVân tay số liệu khớp nền ở cả 5 tab con");
process.exit(bad || misses ? 1 : 0);
