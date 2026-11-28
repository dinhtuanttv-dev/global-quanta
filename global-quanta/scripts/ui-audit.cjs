#!/usr/bin/env node
// QUANTA UI v2 — ui-audit (U0, 28/11/2026, docs/quanta-ui-v2/04 §4, 05 §2–3). Đo giao diện trên trang thật và SO HAI BẢN.
//   node scripts/ui-audit.cjs --before https://dinhtuan-ck.vercel.app --after http://localhost:4173 [--tabs tong-quan,quyet-dinh] [--out dir] [--expect-same] [--dump-text]
// - Dữ liệu Gateway của bản "before" được GHI LẠI và PHÁT LẠI cho bản "after" -> hai bản thấy cùng dữ liệu, chữ so được với nhau.
// - Mỗi tab: chỉ số A1–A9 (phông, < 11px, < 10px, chữ vàng cũ, in hoa, giãn chữ, gradient, trạng thái chọn, số màu chữ), bỏ qua SVG / canvas
//   và [data-ui-exempt]; vân tay: danh sách data-testid + băm nội dung chữ (số thay bằng #); ảnh menu chính so từng byte.
// - --expect-same: thoát 1 nếu vân tay hoặc menu khác (dùng cho bước "không đổi hiển thị" như U0, U9).
const path = require("path"), fs = require("fs");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BEFORE = arg("before"), AFTER = arg("after");
const TABS = (arg("tabs", "tong-quan,ket-noi-the-gioi,phan-tich-nganh,phan-tich-ky-thuat,phan-tich-vi-mo,phan-tich-co-ban,quyet-dinh")).split(",");
const OUT = arg("out", path.join(process.cwd(), "ui-audit-out"));
const WAIT = Number(arg("wait", "9000"));
const GATEWAY = /gateway-production-1da0\.up\.railway\.app|tuan-quant-scanner-psi\.vercel\.app/;
function loadPlaywright() {
  for (const p of [arg("playwright"), "playwright", path.join(__dirname, "..", "backend", "node_modules", "playwright")].filter(Boolean)) { try { return require(p); } catch { /* thử đường khác */ } }
  throw new Error("Không tìm thấy playwright (cài ở backend/ hoặc truyền --playwright <đường dẫn>).");
}

/** Chạy trong trang: chỉ số + vân tay của một vùng. */
function measure(selector) {
  const root = document.querySelector(selector);
  if (!root) return null;
  const GOLD = ["rgb(245, 206, 114)", "rgb(232, 184, 75)"];
  const fam = {}, colors = new Set();
  let n = 0, tiny = 0, below11 = 0, gold = 0, upper = 0, spaced = 0, grad = 0, selTotal = 0, selAccent = 0;
  // U3 (28/11): đo XANH LÀM MÀU CHỮ — Tổng quan chỉ dùng xanh cho vạch / viền, chữ trắng; mã cổ phiếu trắng.
  const isBlue = (c) => { const m = c.match(/rgba?\((\d+), (\d+), (\d+)/); if (!m) return false; const [r, g, b] = m.slice(1).map(Number); return b > 200 && b - r > 70 && b - g > 25; };
  const TICKER = /^[A-Z][A-Z0-9]{2}$/;
  let blueText = 0, tickers = 0, tickerBlue = 0, tickerWhite = 0; const blueSamples = [];
  const skip = (el) => el.closest("svg, canvas, [data-ui-exempt]");
  for (const el of root.querySelectorAll("*")) {
    if (skip(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (cs.backgroundImage && cs.backgroundImage.includes("gradient")) grad++;
    if (el.getAttribute("aria-selected") === "true" || el.getAttribute("aria-pressed") === "true") {
      selTotal++;
      const c = [cs.color, cs.borderBottomColor, cs.borderTopColor, cs.backgroundColor, cs.boxShadow].join(" ");
      if (/79, 142, 247|121, 168, 255/.test(c)) selAccent++;
    }
    const own = [...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim());
    if (!own || !el.getClientRects().length) continue;
    n++;
    const f = cs.fontFamily.split(",")[0].replace(/["']/g, "").trim(); fam[f] = (fam[f] || 0) + 1;
    const px = parseFloat(cs.fontSize); if (px < 10) tiny++; if (px < 11 && !el.closest(".q-dense")) below11++;
    colors.add(cs.color); if (GOLD.includes(cs.color)) gold++;
    if (isBlue(cs.color)) { blueText++; if (blueSamples.length < 150) blueSamples.push([el.tagName.toLowerCase(), String(el.className?.baseVal ?? el.className ?? "").slice(0, 120), el.textContent.trim().slice(0, 40), el.closest("[data-testid]")?.getAttribute("data-testid") ?? ""]); }
    const t = el.textContent.trim();
    if (TICKER.test(t)) { tickers++; if (isBlue(cs.color)) tickerBlue++; else if (/rgb\((2[0-5]\d), (2[0-5]\d), (2[0-5]\d)\)/.test(cs.color)) tickerWhite++; }
    if (cs.textTransform === "uppercase") upper++;
    if (parseFloat(cs.letterSpacing) > 0.4) spaced++;
  }
  const ids = [...root.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid")).sort();
  const text = (root.innerText || "").replace(/\d/g, "#").replace(/\s+/g, " ").trim();
  let h = 5381; for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return { textEls: n, families: fam, tiny, below11NonDense: below11, gold, upper, spaced, gradientBg: grad, selected: selTotal, selectedAccent: selAccent, distinctColors: colors.size, blueText, blueSamples, tickers, tickerBlue, tickerWhite,
    fp: { testids: ids.length, testidHash: ids.join("|").length + ":" + ids.slice(0, 3).join(","), ids, textLen: text.length, textHash: h } };
}

(async () => {
  if (!BEFORE) { console.error("Cần --before <url> (và tuỳ chọn --after <url>)."); process.exit(2); }
  fs.mkdirSync(OUT, { recursive: true });
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const cache = new Map();
  async function makePage(mode) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
    const net = { inflight: 0, lastAt: Date.now() };
    await ctx.route(GATEWAY, async (r) => {
      net.inflight++; net.lastAt = Date.now();
      try { return await handle(r); } finally { net.inflight--; net.lastAt = Date.now(); }
    });
    async function handle(r) {
      const req = r.request();
      if (req.method() === "OPTIONS") return r.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,OPTIONS" } });
      if (/\/stream(\?|$)/.test(req.url())) return r.fulfill({ status: 200, contentType: "text/event-stream", body: "" });
      const key = `${req.method()} ${req.url()} ${req.postData() ?? ""}`;
      if (mode === "replay" && cache.has(key)) return r.fulfill(cache.get(key));
      const hdr = { ...req.headers() }; delete hdr.authorization;
      try {
        const res = await r.fetch({ headers: hdr, timeout: 60000 });
        const rec = { status: res.status(), headers: { ...res.headers(), "access-control-allow-origin": "*" }, body: await res.body() };
        delete rec.headers["content-encoding"]; delete rec.headers["content-length"];
        if (mode === "record") cache.set(key, rec);
        return r.fulfill(rec);
      } catch { return r.fulfill({ status: 502, body: "{}" }); }
    }
    await ctx.addInitScript(() => { try { localStorage.setItem("gq_session_v2", JSON.stringify({ access_token: "e2e", refresh_token: "e2e", expires_at: Date.now() + 864e5, user: { id: "e2e", email: "e2e@local", admin: false, mustChangePassword: false } })); } catch { /* bộ nhớ bị chặn */ } });
    const page = await ctx.newPage(); const errs = []; page.on("pageerror", (e) => errs.push(e.message.slice(0, 140)));
    return { page, errs, net };
  }
  /** Chờ tới khi không còn yêu cầu Gateway đang chạy trong 1,5 s (tối đa 20 s) — tránh đo lúc khối tải muộn còn dở. */
  async function settle(page, net) {
    const t0 = Date.now();
    while (Date.now() - t0 < 20000) { if (net.inflight === 0 && Date.now() - net.lastAt > 1500) return; await page.waitForTimeout(250); }
  }
  async function run(base, mode, label) {
    const { page, errs, net } = await makePage(mode);
    const out = {};
    for (const t of TABS) {
      await page.goto(`${base}/?tab=${t}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("#main-tab-panel", { timeout: 90000 }); await page.waitForTimeout(WAIT); await settle(page, net);
      // --click "<selector>": bấm thêm (vd. tab con "#elite10-profile-tab") rồi đo — tab không có phần tử đó thì bỏ qua.
      const click = arg("click", null);
      if (click && await page.locator(click).count()) { await page.locator(click).first().click(); await page.waitForTimeout(1500); await settle(page, net); }
      const nav = await page.locator(".main-nav").first().screenshot().catch(() => null);
      if (nav) fs.writeFileSync(path.join(OUT, `${label}-${t}-nav.png`), nav);
      await page.screenshot({ path: path.join(OUT, `${label}-${t}.png`) });
      if (process.argv.includes("--dump-text")) fs.writeFileSync(path.join(OUT, `${label}-${t}.txt`), await page.evaluate(() => (document.querySelector("#main-tab-panel")?.innerText ?? "").replace(/\d/g, "#")));
      out[t] = { panel: await page.evaluate(measure, "#main-tab-panel"), topbar: await page.evaluate(measure, "header"), right: await page.evaluate(measure, ".insight"), navPng: nav };
    }
    await page.context().close();
    return { out, errs };
  }
  const before = await run(BEFORE, "record", "before");
  const after = AFTER ? await run(AFTER, "replay", "after") : null;
  // So ảnh menu theo ĐIỂM ẢNH (không theo byte PNG): khác khi > 0,1% điểm ảnh lệch quá 8 / kênh màu.
  const navDiff = {};
  if (after) {
    const cmp = await (await browser.newContext()).newPage();
    for (const t of TABS) {
      const a = before.out[t].navPng, b = after.out[t].navPng;
      if (!a || !b) { navDiff[t] = null; continue; }
      navDiff[t] = await cmp.evaluate(async ([x, y]) => {
        const load = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
        const [i1, i2] = await Promise.all([load(x), load(y)]);
        if (i1.width !== i2.width || i1.height !== i2.height) return 1;
        const c = document.createElement("canvas"); c.width = i1.width; c.height = i1.height; const g = c.getContext("2d");
        g.drawImage(i1, 0, 0); const d1 = g.getImageData(0, 0, c.width, c.height).data;
        g.clearRect(0, 0, c.width, c.height); g.drawImage(i2, 0, 0); const d2 = g.getImageData(0, 0, c.width, c.height).data;
        let bad = 0; for (let k = 0; k < d1.length; k += 4) if (Math.abs(d1[k] - d2[k]) > 8 || Math.abs(d1[k + 1] - d2[k + 1]) > 8 || Math.abs(d1[k + 2] - d2[k + 2]) > 8) bad++;
        return bad / (d1.length / 4);
      }, [`data:image/png;base64,${a.toString("base64")}`, `data:image/png;base64,${b.toString("base64")}`]);
    }
  }
  await browser.close();
  const report = { before: BEFORE, after: AFTER ?? null, at: new Date().toISOString(), errs: { before: before.errs, after: after?.errs ?? [] }, tabs: {} };
  let same = true;
  for (const t of TABS) {
    const b = before.out[t], a = after?.out[t];
    const strip = (x) => (x ? { ...x, fp: { testids: x.fp.testids, textLen: x.fp.textLen, textHash: x.fp.textHash } } : null);
    const row = { before: { panel: strip(b.panel), topbar: strip(b.topbar), right: strip(b.right) } };
    if (a) {
      const navSame = navDiff[t] != null && navDiff[t] <= 0.001;
      const diff = (x, y) => {
        if (!x || !y) return { testids: x === y, text: x === y };
        const xs = new Set(x.fp.ids), ys = new Set(y.fp.ids);
        return { testids: x.fp.ids.join("|") === y.fp.ids.join("|"), removed: [...xs].filter((i) => !ys.has(i)).slice(0, 20), added: [...ys].filter((i) => !xs.has(i)).slice(0, 20), text: x.fp.textHash === y.fp.textHash };
      };
      row.after = { panel: strip(a.panel), topbar: strip(a.topbar), right: strip(a.right) };
      row.compare = { nav: navSame, panel: diff(b.panel, a.panel), topbar: diff(b.topbar, a.topbar), right: diff(b.right, a.right) };
      if (!navSame || !row.compare.panel.testids || !row.compare.panel.text || !row.compare.topbar.testids || !row.compare.right.testids) same = false;
    }
    report.tabs[t] = row;
  }
  report.same = AFTER ? same : null;
  fs.writeFileSync(path.join(OUT, "ui-audit.json"), JSON.stringify(report, null, 1));
  for (const [t, r] of Object.entries(report.tabs)) {
    const p = r.before.panel;
    const line = `${t.padEnd(20)} chữ ${p.textEls} · <10px ${p.tiny} · <11px(ngoài q-dense) ${p.below11NonDense} · vàng ${p.gold} · in hoa ${p.upper} · gradient ${p.gradientBg} · chọn ${p.selectedAccent}/${p.selected} · màu ${p.distinctColors} · chữ xanh ${p.blueText} · mã ${p.tickers} (xanh ${p.tickerBlue}, trắng ${p.tickerWhite})`;
    console.log(r.compare ? `${line} | menu ${r.compare.nav ? "giống" : "KHÁC"} · testid ${r.compare.panel.testids ? "giống" : "KHÁC"} · chữ ${r.compare.panel.text ? "giống" : "KHÁC"}` : line);
  }
  console.log(`Kết quả: ${path.join(OUT, "ui-audit.json")}${AFTER ? ` · hai bản ${same ? "GIỐNG" : "KHÁC"}` : ""}`);
  if (process.argv.includes("--expect-same") && AFTER && !same) process.exit(1);
})().catch((e) => { console.error("LỖI:", e.message); process.exit(1); });
