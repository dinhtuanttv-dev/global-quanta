// D4 (19/11/2026) — Kiểm tra khối "Tác động lên cổ phiếu" trong QUYẾT ĐỊNH › 2. Hồ sơ 360° › Tổng hợp trên bản dựng thật.
// Chạy: E2E_EMAIL=... E2E_PASSWORD=... [E2E_AUTH_GATEWAY=http://localhost:8787] [E2E_TICKERS=HPG,FPT,TNG] npx -y -p playwright@1.49.1 node scripts/e2e/stock-impact.e2e.mjs https://dinhtuan-ck.vercel.app
// Kiểm ở 2 khổ (1440, 390), cho từng mã: không còn khối "Truyền dẫn thế giới" riêng; mỗi dòng có dấu bằng chứng; không có tổng hợp
// có trọng số; số tab không đổi; 0 tràn ngang; 0 chữ < 10px trong khối; 0 lỗi trang. Thoát mã 1 nếu có điều kiện không đạt.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] || "https://dinhtuan-ck.vercel.app";
const EMAIL = process.env.E2E_EMAIL, PASSWORD = process.env.E2E_PASSWORD;
const fails = [];
const check = (w, ok, msg) => { console.log(`${ok ? "✔" : "✖"} [${w}] ${msg}`); if (!ok) fails.push(`[${w}] ${msg}`); };

const browser = await chromium.launch();
const TICKERS = (process.env.E2E_TICKERS || "HPG,FPT,TNG").split(",").map((t) => t.trim().toUpperCase()).filter(Boolean);
for (const W of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width: W, height: W < 768 ? 844 : 1000 } });
  // Tuỳ chọn: E2E_AUTH_GATEWAY=http://localhost:8787 -> chuyển các route đăng nhập/dữ liệu người dùng sang một Gateway cục bộ (tài khoản thử),
  // mọi dữ liệu thị trường vẫn lấy từ Gateway production. Dùng khi không có tài khoản thật.
  if (process.env.E2E_AUTH_GATEWAY) {
    const USER = /\/api\/(auth\/|market\/(watchlists|chart-state|elliott\/counts|elliott\/alerts|radar(?!\/signals)|workspace|screener-prefs))/;
    await ctx.route(/gateway-production-1da0\.up\.railway\.app/, async (route) => {
      const req = route.request();
      const cors = { "access-control-allow-origin": req.headers().origin ?? "*", "access-control-allow-credentials": "true", "access-control-allow-headers": req.headers()["access-control-request-headers"] ?? "authorization,content-type", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      const url = USER.test(req.url()) ? req.url().replace(/^https:\/\/[^/]+/, process.env.E2E_AUTH_GATEWAY) : req.url();
      try { const r = await route.fetch({ url, headers: { ...req.headers(), origin: BASE } }); await route.fulfill({ response: r, headers: { ...r.headers(), ...cors } }); } catch { await route.abort().catch(() => {}); }
    });
  }
  const p = await ctx.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(`${BASE}/?tab=quyet-dinh`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await p.waitForTimeout(1500);
  if (await p.locator("#login-email").count()) {
    if (!EMAIL || !PASSWORD) { console.error("Cần E2E_EMAIL và E2E_PASSWORD."); process.exit(2); }
    await p.fill("#login-email", EMAIL); await p.fill("#login-password", PASSWORD); await p.click(".login-btn"); await p.waitForTimeout(2000);
  }
  await p.waitForSelector('[data-testid="elite10-hub"]', { timeout: 60_000 });
  const tabs0 = await p.locator('[role="tab"]').count();
  await p.locator("#elite10-profile-tab").click(); await p.waitForTimeout(1500);
  for (const T of TICKERS) {
    await p.fill('[data-testid="elite-pick"]', T); await p.press('[data-testid="elite-pick"]', "Enter");
    const ok = await p.waitForSelector('[data-testid="elite-impact"]', { timeout: 60_000 }).then(() => true).catch(() => false);
    check(W, ok, `${T}: có khối Tác động lên cổ phiếu`);
    if (!ok) continue;
    await p.waitForTimeout(800);
    check(W, (await p.locator('[data-testid="elite-world"]').count()) === 0, `${T}: không còn khối "Truyền dẫn thế giới" riêng`);
    const rows = p.locator('[data-testid^="impact-layer-"]'), n = await rows.count();
    let sealed = 0; for (let i = 0; i < n; i++) if (await rows.nth(i).locator('[data-testid^="impact-seal-"]').count()) sealed++;
    check(W, n > 0 && sealed === n, `${T}: mỗi dòng có dấu bằng chứng (${sealed}/${n})`);
    const box = (await p.locator('[data-testid="elite-impact"]').innerText()).replace(/\s+/g, " ");
    check(W, /Tổng hợp có trọng số: không hiển thị/.test(box), `${T}: không có tổng hợp khi chưa lớp nào ĐẠT`);
    check(W, !/Mua ngay|chắc chắn/i.test(box), `${T}: không có nhãn "Mua ngay"/"chắc chắn"`);
    const small = await p.evaluate(() => [...document.querySelectorAll('[data-testid="elite-impact"] *')].filter((e) => [...e.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 10 && e.offsetParent !== null).length);
    check(W, small === 0, `${T}: không có chữ < 10px (thấy ${small})`);
    if (process.env.E2E_SHOTS) { await p.locator('[data-testid="elite-impact"]').scrollIntoViewIfNeeded(); await p.locator('[data-testid="elite-impact"]').screenshot({ path: `${process.env.E2E_SHOTS}/impact-${T}-${W}.png` }); }
  }
  check(W, (await p.locator('[role="tab"]').count()) === tabs0, "số tab không đổi");
  check(W, (await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "không tràn ngang");
  check(W, errs.length === 0, `không lỗi trang (${errs.slice(0, 2).join(" | ")})`);
  await ctx.close();
}
await browser.close();
console.log(fails.length ? `\n${fails.length} điều kiện KHÔNG ĐẠT` : "\nTất cả đạt");
process.exit(fails.length ? 1 : 0);
