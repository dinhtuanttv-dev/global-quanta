// W5 (19/11/2026) — Kiểm tra KẾT NỐI THẾ GIỚI › Truyền dẫn & kịch bản trên bản dựng thật (dinhtuan-ck hoặc vite preview).
// Chạy: E2E_EMAIL=... E2E_PASSWORD=... [E2E_AUTH_GATEWAY=http://localhost:8787] [E2E_SHOTS=dir] npx -y -p playwright@1.49.1 node scripts/e2e/world-transmission.e2e.mjs https://dinhtuan-ck.vercel.app
// Kiểm ở 2 khổ (1440, 390): W1 bảng nhiệt so sánh kịch bản; W2 dòng thời gian + bộ lọc nhớ sau tải lại; W3 tra cứu cổ phiếu (khối Tác động + thanh khoản);
// W4 chọn ô ma trận -> chi tiết trong khung nhìn; số tab không đổi; 0 tràn ngang; 0 chữ < 10px; 0 lỗi trang. Thoát mã 1 nếu có điều kiện không đạt.
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
  await p.goto(BASE + "/?tab=ket-noi-the-gioi", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await p.waitForTimeout(1500);
  if (await p.locator("#login-email").count()) {
    if (!EMAIL || !PASSWORD) { console.error("Cần E2E_EMAIL và E2E_PASSWORD."); process.exit(2); }
    await p.fill("#login-email", EMAIL); await p.fill("#login-password", PASSWORD); await p.click(".login-btn"); await p.waitForTimeout(2000);
  }
  await p.waitForSelector("#world-transmission-tab", { timeout: 60_000 });
  await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("gq.world.")) localStorage.removeItem(k); });
  await p.locator("#world-transmission-tab").click();
  await p.waitForSelector('[data-testid="world-transmission"]', { timeout: 60_000 });
  const tabs0 = await p.locator('[role="tab"]').count();
  // G3: trên điện thoại các khối thu gọn trong chỗ (KntgSection) — mở hết các khối cần kiểm
  const openSections = async () => { for (const bar of await p.locator('.kntg-section:not([open]) > summary').all()) { if (await bar.isVisible()) { await bar.click(); await p.waitForTimeout(300); } } };
  await openSections();
  // W1: so sánh kịch bản
  await p.locator('[data-testid="sc-mode-compare"]').click();
  const heat = await p.waitForSelector('[data-testid="scenario-heat"]', { timeout: 90_000 }).then(() => true).catch(() => false);
  check(W, heat, "W1: có bảng nhiệt so sánh kịch bản");
  if (heat) {
    const cols = await p.locator('[data-testid="scenario-heat"] thead th').count();
    check(W, cols >= 2, "W1: có ít nhất 1 cột kịch bản (" + (cols - 1) + ")");
    const cells = p.locator('[data-testid^="heat-"]');
    check(W, (await cells.count()) > 0, "W1: có ô số liệu");
    await cells.first().click(); await p.waitForTimeout(800);
    check(W, (await p.locator('[data-testid="sc-mode-single"][aria-pressed="true"]').count()) === 1, "W1: bấm ô mở chế độ một kịch bản");
  }
  // W2: dòng thời gian + bộ lọc được nhớ
  const tl = await p.waitForSelector('[data-testid="event-timeline"]', { timeout: 90_000 }).then(() => true).catch(() => false);
  check(W, tl, "W2: có dòng thời gian sự kiện");
  if (tl) {
    const pts = p.locator('[data-testid^="tl-"]'); const n = await pts.count();
    check(W, n > 0, "W2: có " + n + " điểm sự kiện");
    await pts.first().scrollIntoViewIfNeeded(); await pts.first().click(); await p.waitForTimeout(1500);
    check(W, !/Chọn một sự kiện để xem/.test(await p.locator('[aria-label="Chi tiết sự kiện đã chọn"]').innerText()), "W2: bấm điểm mở chi tiết sự kiện");
    await p.selectOption("#wd-ev-kind", "surprise"); await p.waitForTimeout(500);
    const cnt = await p.locator('[data-testid="event-filter-count"]').innerText();
    await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector("#world-transmission-tab", { timeout: 90_000 }); await openSections(); await p.waitForSelector('[data-testid="event-filter-count"]', { timeout: 90_000 });
    check(W, (await p.locator('[data-testid="event-filter-count"]').innerText()) === cnt && (await p.inputValue("#wd-ev-kind")) === "surprise", "W2: bộ lọc sự kiện được nhớ sau tải lại (" + cnt + ")");
    await p.selectOption("#wd-ev-kind", "all");
  }
  // W4: ma trận — chọn ô thì khung chi tiết hiện trong khung nhìn
  await openSections();
  // G3/L12: ma trận thu gọn khi chưa có liên kết A/B -> mở tóm tắt trước
  if (await p.locator('[data-testid="matrix-wrap"]:not([open])').count()) { await p.locator('[data-testid="matrix-summary"]').click(); await p.waitForTimeout(400); }
  const mcell = p.locator(".wd .wm button.cell").first();
  if (await mcell.count()) {
    await mcell.scrollIntoViewIfNeeded(); await mcell.click(); await p.waitForTimeout(900);
    const inView = await p.locator('[data-testid="matrix-detail"]').evaluate((e) => { const r = e.getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; });
    check(W, inView, "W4: chọn ô ma trận -> khung chi tiết trong khung nhìn");
  } else check(W, false, "W4: không thấy ô ma trận");
  // W3: tra cứu cổ phiếu
  const look = await p.waitForSelector('[data-testid="world-stock-lookup"]', { timeout: 60_000 }).then(() => true).catch(() => false);
  check(W, look, "W3: có khối tra cứu cổ phiếu");
  if (look) {
    check(W, await p.waitForSelector('[data-testid="world-stock-lookup"] [data-testid="elite-impact"]', { timeout: 60_000 }).then(() => true).catch(() => false), "W3: hiện khối Tác động lên cổ phiếu");
    check(W, (await p.locator('[data-testid="world-stock-liq"], [data-testid="world-stock-liq-missing"], [data-testid="world-stock-liq-error"]').count()) > 0, "W3: có dòng thanh khoản / cảnh báo");
  }
  check(W, (await p.locator('[role="tab"]').count()) === tabs0, "số tab không đổi");
  check(W, (await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "không tràn ngang");
  const small = await p.evaluate(() => [...document.querySelectorAll('[data-testid="world-transmission"] *')].filter((e) => [...e.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 10 && e.offsetParent !== null).length);
  check(W, small === 0, "không có chữ < 10px (thấy " + small + ")");
  check(W, errs.length === 0, "không lỗi trang (" + errs.slice(0, 2).join(" | ") + ")");
  if (process.env.E2E_SHOTS) await p.screenshot({ path: process.env.E2E_SHOTS + "/world-transmission-" + W + ".png", fullPage: true });
  await ctx.close();
}
await browser.close();
console.log(fails.length ? "\n" + fails.length + " điều kiện KHÔNG ĐẠT" : "\nTất cả đạt");
process.exit(fails.length ? 1 : 0);
