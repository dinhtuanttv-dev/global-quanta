// V6 (19/11/2026) — Kiểm tra giao diện tab PHÂN TÍCH VĨ MÔ trên một bản dựng thật (dinhtuan-ck hoặc vite preview).
// Chạy: E2E_EMAIL=... E2E_PASSWORD=... [E2E_AUTH_GATEWAY=http://localhost:8787] npx -y -p playwright@1.49.1 node scripts/e2e/macro-tab.e2e.mjs https://dinhtuan-ck.vercel.app
//       (lần đầu cần: npx -y playwright@1.49.1 install chromium). Không chứa thông tin đăng nhập trong mã.
// Kiểm ở 2 khổ (1440, 390): đủ 5 tab con, số tab không đổi khi chuyển, 0 tràn ngang, 0 lỗi trang, 0 chữ < 10px trong tab,
// nhãn trung thực (không "liên ngân hàng" cho tỷ giá Yahoo, không "+-0,00", không "Net +…%" cho điểm ròng, không "Tỷ lệ thắng: 50%"),
// khối nguồn có dòng hạn công bố. Thoát mã 1 nếu có điều kiện không đạt.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2] || "https://dinhtuan-ck.vercel.app";
const EMAIL = process.env.E2E_EMAIL, PASSWORD = process.env.E2E_PASSWORD;
const fails = [];
const check = (w, ok, msg) => { console.log(`${ok ? "✔" : "✖"} [${w}] ${msg}`); if (!ok) fails.push(`[${w}] ${msg}`); };

const browser = await chromium.launch();
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
  await p.goto(`${BASE}/?tab=phan-tich-vi-mo`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await p.waitForTimeout(1500);
  if (await p.locator("#login-email").count()) {
    if (!EMAIL || !PASSWORD) { console.error("Cần E2E_EMAIL và E2E_PASSWORD."); process.exit(2); }
    await p.fill("#login-email", EMAIL); await p.fill("#login-password", PASSWORD); await p.click(".login-btn"); await p.waitForTimeout(2000);
  }
  await p.waitForSelector('[data-testid="macro-hub"]', { timeout: 60_000 });
  await p.waitForSelector("#mc-src", { timeout: 60_000 }).catch(() => {});
  await p.waitForTimeout(5000);
  const tabs0 = await p.locator('[role="tab"]').count();
  const sub = await p.locator('[role="tablist"][aria-label="Chất xúc tác"] [role="tab"]').count();
  check(W, sub === 5, `5 tab con (thấy ${sub})`);
  const hub = (await p.locator('[data-testid="macro-hub"]').innerText()).replace(/\s+/g, " ");
  check(W, !/USD\/VND \(liên ngân hàng\)/.test(hub), "không còn nhãn 'liên ngân hàng' cho tỷ giá thị trường");
  check(W, !hub.includes("+-0,00"), "không có '+-0,00'");
  check(W, (await p.locator('[data-testid^="mc-release-"]').count()) > 0 || hub.includes("dự kiến"), "khối nguồn có hạn công bố");
  // tab con 3: điểm ròng + tỷ lệ thắng
  await p.locator("#chat-xuc-tac-catalyst-tab").click(); await p.waitForTimeout(5000);
  const cat = (await p.locator("#chat-xuc-tac-catalyst-panel").innerText().catch(() => "")).replace(/\s+/g, " ");
  check(W, !/Net [+−-]?\d[\d.,]*%/.test(cat), "điểm ròng ngành không hiển thị như phần trăm");
  check(W, !/Tỷ lệ thắng: 50%/.test(cat), "không hiện 'Tỷ lệ thắng: 50%' (giá trị mặc định)");
  for (const id of ["impact", "radar", "chat", "macro"]) { await p.locator(`#chat-xuc-tac-${id}-tab`).click(); await p.waitForTimeout(1500); }
  check(W, (await p.locator('[role="tab"]').count()) === tabs0, "số tab không đổi khi chuyển tab con");
  check(W, (await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "không tràn ngang");
  const small = await p.evaluate(() => [...document.querySelectorAll('[data-testid="macro-hub"] *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 10 && e.offsetParent !== null).length);
  check(W, small === 0, `không có chữ < 10px (thấy ${small})`);
  check(W, errs.length === 0, `không lỗi trang (${errs.slice(0, 2).join(" | ")})`);
  await ctx.close();
}
await browser.close();
console.log(fails.length ? `\n${fails.length} điều kiện KHÔNG ĐẠT` : "\nTất cả đạt");
process.exit(fails.length ? 1 : 0);
