// G0 (19/11/2026) — đo giao diện tab KẾT NỐI THẾ GIỚI và so với ngưỡng nghiệm thu (Giao-dien-KNTG/06).
// Đo 5 tab con × khổ 1440 và 390: chữ < 10px, tương phản WCAG AA, vùng bấm < 24px, số cỡ chữ / màu chữ / bo góc, chiều cao trang 390,
// tràn ngang, lỗi trang. Mặc định chỉ báo cáo; --strict thoát mã 1 khi trượt ngưỡng (dùng từ sau G3).
// Chạy: E2E_EMAIL=… E2E_PASSWORD=… [E2E_AUTH_GATEWAY=…] node scripts/e2e/kntg-audit.mjs <BASE> [--store replay.json] [--out metrics.json] [--shots dir] [--strict]
//   --store: phát lại kho của kntg-fingerprint.mjs (cùng dữ liệu, đồng hồ cố định) -> số đo so sánh được giữa hai bản dựng.
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.argv[2];
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const STORE = arg("--store"), OUT = arg("--out"), SHOTS = arg("--shots"), STRICT = process.argv.includes("--strict");
if (!BASE) { console.error("Dùng: kntg-audit.mjs <BASE> [--store] [--out] [--shots] [--strict]"); process.exit(2); }
const EMAIL = process.env.E2E_EMAIL, PASSWORD = process.env.E2E_PASSWORD;
const GW = /gateway-production-1da0\.up\.railway\.app/;
const USER = /\/api\/(auth\/|market\/(watchlists|chart-state|elliott\/counts|elliott\/alerts|radar(?!\/signals)|workspace|screener-prefs))/;
const TABS = ["overview", "sectors", "markets", "transmission", "evidence"];
// Ngưỡng nghiệm thu (tệp 06). height390: chiều cao CẢ TRANG ở khổ 390 khi mặc định.
export const THRESHOLDS = { under10: 0, lowContrast: 0, smallTargets: 0, nSizes: 5, nColors: 4, nRadii: 4, overflow: 0, pageErrors: 0,
  height390: { overview: 3000, markets: 4000, transmission: 3500 } };
const store = STORE ? JSON.parse(fs.readFileSync(STORE, "utf8")) : null;
const keyOf = (req) => { const u = new URL(req.url()); for (const p of ["_", "t", "ts", "nocache"]) u.searchParams.delete(p); return `${req.method()} ${u.pathname}${u.search} ${req.method() === "POST" ? (req.postData() ?? "") : ""}`; };

const browser = await chromium.launch();
const report = { base: BASE, at: new Date().toISOString(), replay: !!store, tabs: {} };
for (const W of [1440, 390]) {
  const ctx = await browser.newContext({ viewport: { width: W, height: W < 768 ? 844 : 1000 } });
  if (store) await ctx.clock.setFixedTime(new Date(store.fixedTime));
  await ctx.route(GW, async (route) => {
    const req = route.request();
    const cors = { "access-control-allow-origin": req.headers().origin ?? "*", "access-control-allow-credentials": "true", "access-control-allow-headers": req.headers()["access-control-request-headers"] ?? "authorization,content-type", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (/\/api\/market\/stream/.test(req.url()) && store) return route.abort();
    if (!USER.test(req.url()) && store) {
      const hit = store.responses[keyOf(req)];
      if (hit) return route.fulfill({ status: hit.status, headers: { "content-type": hit.type, ...cors }, body: Buffer.from(hit.body, "base64") });
    }
    const url = USER.test(req.url()) && process.env.E2E_AUTH_GATEWAY ? req.url().replace(/^https:\/\/[^/]+/, process.env.E2E_AUTH_GATEWAY) : req.url();
    try { const r = await route.fetch({ url, headers: { ...req.headers(), origin: "https://dinhtuan-ck.vercel.app" } }); await route.fulfill({ response: r, headers: { ...r.headers(), ...cors } }); } catch { await route.abort().catch(() => {}); }
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: "text/css", body: "" }));
  const p = await ctx.newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message.slice(0, 160)));
  await p.goto(`${BASE}/?tab=ket-noi-the-gioi`, { waitUntil: "domcontentloaded", timeout: 60_000 }); await p.waitForTimeout(1500);
  if (await p.locator("#login-email").count()) {
    if (!EMAIL || !PASSWORD) { console.error("Cần E2E_EMAIL và E2E_PASSWORD."); process.exit(2); }
    await p.fill("#login-email", EMAIL); await p.fill("#login-password", PASSWORD); await p.click(".login-btn"); await p.waitForTimeout(2000);
  }
  await p.waitForSelector("#world-overview-tab", { timeout: 60_000 });
  await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("gq.world.")) localStorage.removeItem(k); });
  for (const T of TABS) {
    await p.locator(`#world-${T}-tab`).click();
    let last = "", stable = 0;
    for (let i = 0; i < 60 && stable < 3; i++) { await p.waitForTimeout(1000); const cur = await p.evaluate((T) => { const r = document.getElementById(`world-${T}-panel`); return r ? r.innerText.length + "|" + /Đang (tải|tính|ước lượng|đo|mô phỏng)/.test(r.innerText) : ""; }, T); stable = cur === last && !cur.endsWith("true") ? stable + 1 : 0; last = cur; }
    const m = await p.evaluate((T) => {
      const root = document.getElementById(`world-${T}-panel`); if (!root) return null;
      const els = [...root.querySelectorAll("*")].filter((e) => e.getClientRects().length > 0);
      const textEls = els.filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
      const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(",").map((x) => parseFloat(x)); return { r: v[0], g: v[1], b: v[2], a: v[3] ?? 1 }; };
      const lum = ({ r, g, b }) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const bgOf = (e) => { const stack = []; for (let n = e; n; n = n.parentElement) { const c = parse(getComputedStyle(n).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= 0.99) break; } } let base = { r: 8, g: 11, b: 17 }; for (const c of stack.reverse()) base = { r: c.r * c.a + base.r * (1 - c.a), g: c.g * c.a + base.g * (1 - c.a), b: c.b * c.a + base.b * (1 - c.a) }; return base; };
      const low = [];
      for (const e of textEls) {
        if (e.closest("svg")) continue; // chữ SVG dùng fill, đo riêng ở bản sửa sau
        const cs = getComputedStyle(e); const fg = parse(cs.color); if (!fg) continue; const bg = bgOf(e);
        const fm = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
        const L1 = lum(fm), L2 = lum(bg), cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const big = parseFloat(cs.fontSize) >= 18.66 || (parseFloat(cs.fontSize) >= 14 && +cs.fontWeight >= 700);
        if (cr < (big ? 3 : 4.5)) low.push(`${e.textContent.trim().slice(0, 30)} (${cr.toFixed(2)})`);
      }
      const uniq = (xs) => [...new Set(xs)];
      const sizes = uniq(textEls.map((e) => getComputedStyle(e).fontSize));
      // G3: chỉ đếm màu XÁM trung tính (màu ngữ nghĩa — tăng/giảm, vàng nhấn, dấu bằng chứng — được miễn)
      const neutral = (c) => { const ok = c.match(/oklch\(([\d.]+)\s+([\d.]+)/); if (ok) return parseFloat(ok[2]) < 0.05; const v = parse(c); return v ? Math.max(v.r, v.g, v.b) - Math.min(v.r, v.g, v.b) < 48 : false; };
      const colors = uniq(textEls.filter((e) => !e.closest("svg") && !e.closest("[data-kntg-ink]")).map((e) => getComputedStyle(e).color).filter(neutral));
      // G3: bo góc của khối / thẻ / nút (cả hai chiều ≥ 16px); vạch dữ liệu (thanh, chấm) theo quy cách biểu đồ, không tính
      const radii = uniq(els.filter((e) => { if (e.matches(".sb, .col, .ci-track, .pulse-bar, .cell, [data-kntg-ink]")) return false; const r = e.getBoundingClientRect(); return r.width >= 16 && r.height >= 16; }).map((e) => getComputedStyle(e).borderTopLeftRadius).filter((r) => r !== "0px" && r !== "50%" && !/e\+|9999/.test(r)));
      const inter = [...root.querySelectorAll("button, a[href], select, input, [role=button], summary")].filter((e) => e.getClientRects().length > 0);
      // liên kết nằm trong câu văn được miễn (WCAG 2.5.8 ngoại lệ inline)
      // ô chọn nằm trong <label>: vùng bấm là cả nhãn (WCAG 2.5.8)
      const targetRect = (e) => (e.tagName === "INPUT" && e.closest("label") ? e.closest("label") : e).getBoundingClientRect();
      const small = inter.filter((e) => { if (e.tagName === "A" && e.closest("p, li") && !e.matches("[class*='rounded'], [class*='border']")) return false; const r = targetRect(e); return r.width > 0 && (r.height < 24 || r.width < 24); });
      const shown = (e) => { const svg = e.closest("svg"); const fs = parseFloat(getComputedStyle(e).fontSize); if (!svg || !svg.viewBox?.baseVal?.width) return fs; return fs * svg.getBoundingClientRect().width / svg.viewBox.baseVal.width; };
      const under10 = textEls.filter((e) => shown(e) < 9.95);
      return { height: root.scrollHeight, under10: under10.length, under10Samples: uniq(under10.map((e) => `${shown(e).toFixed(1)}px ${e.textContent.trim().slice(0, 24)}`)).slice(0, 8),
        lowContrast: low.length, lowSamples: low.slice(0, 6), smallTargets: small.length, smallSamples: small.slice(0, 6).map((e) => `${(e.textContent || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 22)} ${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`),
        nSizes: sizes.length, sizes, nColors: colors.length, nRadii: radii.length, radii };
    }, T);
    m.pageHeight = await p.evaluate(() => document.documentElement.scrollHeight);
    m.overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    report.tabs[`${T}-${W}`] = m;
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: `${SHOTS}/${T}-${W}.png`, fullPage: true, timeout: 60_000 }).catch(() => {}); }
  }
  report[`pageErrors-${W}`] = errs;
  await ctx.close();
}
await browser.close();
if (OUT) fs.writeFileSync(OUT, JSON.stringify(report, null, 1));

let fails = 0;
const row = (k, v, lim) => { const ok = v <= lim; if (!ok) fails++; return `${ok ? "✔" : "✖"} ${k} ${v}/${lim}`; };
console.log("tab-khổ".padEnd(18), "kết quả so với ngưỡng");
for (const [k, m] of Object.entries(report.tabs)) {
  const [T, W] = k.split("-");
  const cells = [row("chữ<10", m.under10, THRESHOLDS.under10), row("tương phản", m.lowContrast, THRESHOLDS.lowContrast), row("vùng bấm", m.smallTargets, THRESHOLDS.smallTargets),
    row("cỡ chữ", m.nSizes, THRESHOLDS.nSizes), row("xám", m.nColors, THRESHOLDS.nColors), row("bo góc", m.nRadii, THRESHOLDS.nRadii), row("tràn", m.overflow, THRESHOLDS.overflow)];
  if (W === "390" && THRESHOLDS.height390[T]) cells.push(row("cao trang", m.pageHeight, THRESHOLDS.height390[T]));
  console.log(k.padEnd(18), cells.join(" · "));
}
for (const W of [1440, 390]) console.log(row(`lỗi trang ${W}`, report[`pageErrors-${W}`].length, 0));
console.log(fails ? `\n${fails} chỉ số trượt ngưỡng${STRICT ? "" : " (chế độ báo cáo — chưa chặn)"}` : "\nTất cả chỉ số đạt ngưỡng");
process.exit(STRICT && fails ? 1 : 0);
