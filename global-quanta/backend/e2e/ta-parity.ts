// SC0 — E2E BẢO TOÀN TÍNH NĂNG cho phần Chart + bảng phân tích tab TA VN-Index (đợt nâng cấp Super Chart SC1–SC6).
// Chạy trực tiếp bằng Node 24 (type stripping, không biên dịch) + Playwright; đọc CHÍNH bản kê src/.../workspace/parityManifest.ts.
//   node e2e/ta-parity.ts --base https://dinhtuan-ck.vercel.app --out <dir> --pw-file <file> [--email e2e@local.test]
//        [--local-auth http://localhost:8787] [--ticker FPT] [--viewports desk,wide,tablet,m390] [--skip id1,id2]
// --local-auth: chuyển đăng nhập + dữ liệu người dùng sang Gateway cục bộ (tài khoản thử), dữ liệu thị trường vẫn từ Gateway production.
// Phần tử nằm trong menu / tab / bảng trượt được MỞ theo REVEAL của bản kê (đúng như người dùng phải bấm).
// Ra: report.json (từng tính năng × khung nhìn), baseline.md, ảnh chụp; mã thoát 1 nếu có tính năng hỏng hoặc lỗi trang.
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { PARITY_MANIFEST, REVEAL, type LayoutMode, type ParityItem } from "../../src/components/MainTabs/TaVnIndex/workspace/parityManifest.ts";

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("base")!, OUT = arg("out", "e2e-out")!, PW = fs.readFileSync(arg("pw-file")!, "utf8").trim();
const EMAIL = arg("email", "e2e@local.test")!, LOCAL = arg("local-auth"), TICKER = arg("ticker", "FPT")!;
const SKIP = new Set((arg("skip", "") ?? "").split(",").filter(Boolean));
const VIEWPORTS = { desk: { width: 1440, height: 900 }, wide: { width: 1920, height: 1080 }, tablet: { width: 1024, height: 768 }, m390: { width: 390, height: 844 } } as const;
const wanted = (arg("viewports", "desk,wide,tablet,m390")!).split(",") as (keyof typeof VIEWPORTS)[];
const GW = /gateway-production-1da0\.up\.railway\.app/;
const USER_API = /\/api\/(auth\/|market\/(watchlists|chart-state|elliott\/counts|elliott\/alerts|radar|workspace))/;
fs.mkdirSync(OUT, { recursive: true });

interface Result { id: string; feature: string; group: string; target: string; ok: boolean; ms: number; note?: string }

const CHART = "[data-testid=ta-chart] [role=application]";
const WS = "[data-testid=ta-workspace]";
const isVisible = (p: Page, sel: string) => p.locator(sel).first().isVisible().catch(() => false);
async function mode(p: Page): Promise<LayoutMode> { return ((await p.locator(WS).getAttribute("data-mode").catch(() => null)) ?? "off") as LayoutMode; }
async function closeOverlays(p: Page) {
  for (let k = 0; k < 3; k++) {
    const open = await p.evaluate(() => !!document.querySelector("dialog[open]") || !!document.querySelector(":popover-open"));
    if (!open) return;
    await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  }
}
async function click(p: Page, sel: string) { await ensure(p, sel); const l = p.locator(sel).first(); await l.scrollIntoViewIfNeeded(); await l.click(); }
/** Làm phần tử hiện ra theo REVEAL (thử từng phương án mở); không mở được thì để phép kiểm báo lỗi. */
async function ensure(p: Page, sel: string, timeout = 15_000) {
  if (await isVisible(p, sel)) return;
  const m = await mode(p);
  for (const r of REVEAL.filter((x) => x.match.test(sel))) {
    for (const seq of [...(r.by[m] ?? []), ...(r.by.any ?? [])]) {
      if (await isVisible(p, sel)) return;
      for (const opener of seq) {
        if (await isVisible(p, sel)) break;
        if (!(await isVisible(p, opener))) { if (seq.indexOf(opener) === 0) await closeOverlays(p); }
        const o = p.locator(opener).first();
        if (await o.isVisible().catch(() => false)) { await o.scrollIntoViewIfNeeded(); await o.click(); await p.waitForTimeout(250); }
      }
      try { await p.locator(sel).first().waitFor({ state: "visible", timeout: 2500 }); return; } catch { /* thử phương án khác */ }
    }
  }
  await p.locator(sel).first().waitFor({ state: "visible", timeout });
}
const visible = (p: Page, sel: string, timeout = 15_000) => ensure(p, sel, timeout);
const pressed = (p: Page, sel: string) => p.locator(sel).first().getAttribute("aria-pressed");
const drawings = async (p: Page) => Number(await p.locator(WS).getAttribute("data-drawings") ?? 0);
const panes = async (p: Page) => Number(await p.locator(CHART).getAttribute("data-panes") ?? 1);
async function chartShot(p: Page) { return (await p.locator(CHART).screenshot()).toString("base64"); }
async function chartBox(p: Page) { await closeOverlays(p); await p.locator(CHART).scrollIntoViewIfNeeded(); return (await p.locator(CHART).boundingBox())!; }
const savedDrawings = (p: Page) => p.evaluate((t) => { try { return JSON.parse(localStorage.getItem(`gq.ta.drawings.v1:${t}`) ?? "null")?.primitives ?? []; } catch { return []; } }, TICKER);

async function drawTrendline(p: Page, fx = 0.55, fy = 0.45) {
  const n0 = await drawings(p);
  await click(p, `[data-tool="trendline"]`);
  const box = await chartBox(p);
  const x0 = box.x + box.width * fx, y0 = box.y + box.height * fy;
  await p.mouse.move(x0, y0); await p.mouse.down(); await p.mouse.move(x0 + box.width * 0.15, y0 - box.height * 0.12, { steps: 8 }); await p.mouse.up();
  await p.waitForFunction(([s, n]) => Number(document.querySelector(s)?.getAttribute("data-drawings") ?? 0) > n, [WS, n0] as const, { timeout: 10_000 });
  return { x0, y0, x1: x0 + box.width * 0.15, y1: y0 - box.height * 0.12 };
}

async function runCheck(p: Page, item: ParityItem): Promise<string | void> {
  const c = item.check;
  switch (c.kind) {
    case "visible": await visible(p, c.sel, 60_000); return;
    case "tabs": { await visible(p, c.sel, 30_000); const n = await p.locator(c.sel).count(); if (n < c.min) throw new Error(`${n} < ${c.min}`); return; }
    case "click": {
      await click(p, c.sel); await closeOverlays(p); await visible(p, c.expect, 60_000);
      if (c.expect.includes("aria-pressed=true")) { await click(p, c.sel); await closeOverlays(p); }
      return;
    }
    case "steps": { for (const s of c.clicks) { await click(p, s); await p.waitForTimeout(300); } await visible(p, c.expect, 30_000); return; }
    case "tf": {
      await click(p, `[data-tf="${c.tf}"]`);
      await p.waitForFunction((tf) => document.querySelector(`[data-tf="${tf}"]`)?.getAttribute("aria-pressed") === "true", c.tf, { timeout: 60_000 });
      await p.waitForTimeout(800);
      if (c.tf !== "D") { await click(p, `[data-tf="D"]`); await p.waitForFunction(() => document.querySelector(`[data-tf="D"]`)?.getAttribute("aria-pressed") === "true", null, { timeout: 30_000 }); }
      return;
    }
    case "layer": {
      // Bố cục lưu theo tài khoản -> lớp có thể đang bật sẵn: kiểm "đảo trạng thái rồi trả về", phần bật luôn được kiểm.
      const sel = `[data-layer="${c.key}"]`;
      await ensure(p, sel);
      if ((await pressed(p, sel)) === "true") { await click(p, sel); if ((await pressed(p, sel)) !== "false") throw new Error("không tắt được"); await p.waitForTimeout(300); }
      const panes0 = await panes(p);
      await click(p, sel);
      if ((await pressed(p, sel)) !== "true") throw new Error("không bật được");
      if (c.pane) await p.waitForFunction(([s, n]) => Number(document.querySelector(s)?.getAttribute("data-panes") ?? 1) > n, [CHART, panes0] as const, { timeout: 10_000 });
      if (c.expect) { await closeOverlays(p); await visible(p, c.expect, 90_000); }
      await click(p, sel);
      if ((await pressed(p, sel)) !== "false") throw new Error("không tắt được");
      await closeOverlays(p);
      return;
    }
    case "keys": {
      await closeOverlays(p);
      await p.locator(CHART).focus();
      const a = await chartShot(p);
      for (const k of ["ArrowLeft", "ArrowLeft", "Shift+ArrowLeft"]) await p.keyboard.press(k);
      await p.waitForTimeout(400);
      if (a === (await chartShot(p))) throw new Error("← không dịch biểu đồ");
      for (const k of ["End", "-", "+", "Home", "End"]) await p.keyboard.press(k);
      return;
    }
    case "draw": {
      if (c.tool === "trendline") { await drawTrendline(p); return; }
      const n0 = await drawings(p);
      await click(p, `[data-tool="${c.tool}"]`);
      const box = await chartBox(p);
      const x0 = box.x + box.width * 0.35, y0 = box.y + box.height * 0.6;
      if (c.clicks === 1) await p.mouse.click(x0, y0);
      else { await p.mouse.move(x0, y0); await p.mouse.down(); await p.mouse.move(x0 + box.width * 0.12, y0 - box.height * 0.1, { steps: 8 }); await p.mouse.up(); }
      await p.waitForFunction(([s, n]) => Number(document.querySelector(s)?.getAttribute("data-drawings") ?? 0) > n, [WS, n0] as const, { timeout: 10_000 });
      return;
    }
    case "custom": {
      switch (c.name) {
        case "ticker":
          await p.locator(".ta-ticker-input").fill(TICKER); await p.locator(".ta-ticker-input").press("Enter");
          await p.waitForFunction((t) => document.querySelector(".ta-ticker-current")?.textContent === t, TICKER, { timeout: 60_000 });
          await visible(p, CHART, 60_000); await p.waitForTimeout(4000); return;
        case "pin": {
          await click(p, `[data-layer="smc"]`); await closeOverlays(p); await p.waitForTimeout(800); await p.locator(CHART).focus();
          const errs: number[] = [];
          for (const k of ["ArrowLeft", "ArrowRight", "-", "+"]) {
            await p.keyboard.press(k); await p.waitForTimeout(350);
            const [, ix, cx] = ((await p.locator(CHART).getAttribute("data-overlay-probe")) ?? "").split("|");
            if (ix && cx) errs.push(Math.abs(Number(ix) - Number(cx)));
          }
          await click(p, `[data-layer="smc"]`); await closeOverlays(p);
          if (!errs.length) throw new Error("không đọc được đầu dò ghim");
          if (Math.max(...errs) > 1) throw new Error(`lệch ${Math.max(...errs)} px`);
          return `lệch tối đa ${Math.max(...errs)} px`;
        }
        case "drawSaved": {
          await p.waitForTimeout(1600);
          await visible(p, "[data-testid=drawings-saved-state]");
          const t = (await p.locator("[data-testid=drawings-saved-state]").first().textContent()) ?? "";
          if (!/Đã lưu/.test(t)) throw new Error(`chưa lưu: "${t}"`);
          if ((await savedDrawings(p)).length < 1) throw new Error("localStorage không có hình");
          await closeOverlays(p); return t.trim();
        }
        case "undoRedo": {
          await closeOverlays(p);
          const n = await drawings(p);
          await p.locator(CHART).focus();
          await p.keyboard.press("Control+z");
          await p.waitForFunction(([s, k]) => Number(document.querySelector(s)?.getAttribute("data-drawings")) === k - 1, [WS, n] as const, { timeout: 5000 });
          await p.keyboard.press("Control+Shift+z");
          await p.waitForFunction(([s, k]) => Number(document.querySelector(s)?.getAttribute("data-drawings")) === k, [WS, n] as const, { timeout: 5000 });
          return;
        }
        case "selectDelete": {
          const seg = await drawTrendline(p, 0.2, 0.5);
          const n = await drawings(p);
          await p.mouse.click((seg.x0 + seg.x1) / 2, (seg.y0 + seg.y1) / 2);
          await p.waitForFunction((s) => !!document.querySelector(s)?.getAttribute("data-selected"), WS, { timeout: 5000 });
          await p.keyboard.press("Delete");
          await p.waitForFunction(([s, k]) => Number(document.querySelector(s)?.getAttribute("data-drawings")) === k - 1, [WS, n] as const, { timeout: 5000 });
          return;
        }
        case "dragMove": {
          const seg = await drawTrendline(p, 0.25, 0.55);
          await p.waitForTimeout(1300);
          const before = (await savedDrawings(p)).at(-1);
          const range0 = await p.locator(CHART).getAttribute("data-overlay-range");
          const mx = (seg.x0 + seg.x1) / 2, my = (seg.y0 + seg.y1) / 2;
          await p.mouse.move(mx, my); await p.mouse.down(); await p.mouse.move(mx + 60, my + 30, { steps: 10 }); await p.mouse.up();
          await p.waitForTimeout(1400);
          const after = (await savedDrawings(p)).find((x: { id: string }) => x.id === before?.id);
          if (!before || !after) throw new Error("không thấy hình đã lưu");
          if (after.p1.date === before.p1.date && Math.abs(after.p1.price - before.p1.price) < 1e-9) throw new Error("hình không dời");
          if ((await p.locator(CHART).getAttribute("data-overlay-range")) !== range0) throw new Error("biểu đồ bị cuộn khi kéo hình");
          return `${before.p1.date} → ${after.p1.date}`;
        }
        case "objectHide": {
          await visible(p, "[data-testid=object-hide]");
          const b = p.locator("[data-testid=object-hide]").first();
          await b.click();
          if ((await b.getAttribute("aria-pressed")) !== "true") throw new Error("không ẩn được");
          await b.click(); await closeOverlays(p); return;
        }
        case "clearAll": {
          await visible(p, "[data-testid=drawings-clear-all]");
          await p.locator("[data-testid=drawings-clear-all]").first().click();
          await p.locator("[data-testid=confirm-clear-ok]").click();
          await p.waitForFunction((s) => Number(document.querySelector(s)?.getAttribute("data-drawings")) === 0, WS, { timeout: 10_000 });
          await closeOverlays(p); return;
        }
        case "structureEvent":
          await p.evaluate((t) => window.dispatchEvent(new CustomEvent("gq:structure-open", { detail: { ticker: t } })), TICKER);
          await visible(p, "[data-testid=structure-panel]", 90_000); return;
        case "countSave": {
          await click(p, "[data-testid=elliott-pro-tab-mine]");
          if (!(await p.locator("[data-testid=elliott-count-editor]").count())) await click(p, "[data-testid=elliott-edit]");
          const save = p.locator("[data-testid=elliott-edit-save]").first();
          for (let k = 0; k < 6 && !(await save.isEnabled()); k++) {
            const add = p.locator("[data-testid=elliott-edit-add]").first();
            if (!(await add.count())) break;
            await add.click();
            const b2 = await chartBox(p);
            await p.mouse.click(b2.x + b2.width * (0.3 + k * 0.08), b2.y + b2.height * (k % 2 ? 0.3 : 0.65));
            await p.waitForTimeout(300);
            await ensure(p, "[data-testid=elliott-edit-save]");
          }
          await save.scrollIntoViewIfNeeded(); await save.click({ timeout: 10_000 });
          await visible(p, "[data-testid=elliott-count-history]", 15_000); return;
        }
        case "preset": {
          const n0 = await panes(p);
          await click(p, `[data-preset="momentum"]`);
          await p.waitForFunction(([s, n]) => Number(document.querySelector(s)?.getAttribute("data-panes") ?? 1) >= n + 2, [CHART, n0] as const, { timeout: 10_000 });
          await closeOverlays(p);
          await click(p, `[data-preset="clean"]`);
          await p.waitForFunction((s) => Number(document.querySelector(s)?.getAttribute("data-panes") ?? 1) === 1, CHART, { timeout: 10_000 });
          await closeOverlays(p); return;
        }
        case "palette": {
          await closeOverlays(p);
          const n0 = await panes(p);
          await p.keyboard.press("Control+k");
          await p.locator("[data-testid=command-input]").fill("khoi luong");
          await p.keyboard.press("Enter");
          await p.waitForFunction(([s, n]) => Number(document.querySelector(s)?.getAttribute("data-panes") ?? 1) === n + 1, [CHART, n0] as const, { timeout: 10_000 });
          await p.keyboard.press("Control+k");
          await p.locator("[data-testid=command-input]").fill("khoi luong");
          await p.keyboard.press("Enter");
          await p.waitForFunction(([s, n]) => Number(document.querySelector(s)?.getAttribute("data-panes") ?? 1) === n, [CHART, n0] as const, { timeout: 10_000 });
          return;
        }
        case "range": {
          const a = await p.locator(CHART).getAttribute("data-overlay-range");
          const shot0 = await chartShot(p);
          await click(p, `[data-range="3T"]`); await closeOverlays(p); await p.waitForTimeout(500);
          if ((await chartShot(p)) === shot0 && (await p.locator(CHART).getAttribute("data-overlay-range")) === a) throw new Error("khoảng nhìn không đổi");
          await click(p, `[data-range="1N"]`); await closeOverlays(p); return;
        }
        case "paneClose": {
          await click(p, `[data-layer="volume"]`); await closeOverlays(p);
          await visible(p, "[data-testid=pane-title-volume] button");
          await p.locator("[data-testid=pane-title-volume] button").click();
          await p.waitForFunction((s) => Number(document.querySelector(s)?.getAttribute("data-panes") ?? 1) === 1, CHART, { timeout: 10_000 });
          return;
        }
        case "png": {
          const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 15_000 }), click(p, "[data-testid=png-btn]")]);
          await closeOverlays(p);
          const f = dl.suggestedFilename();
          if (!/\.png$/.test(f)) throw new Error(f);
          return f;
        }
        case "inspector": {
          const m = await mode(p);
          if (m === "mobile") { await click(p, "[data-testid=mobile-more]"); await visible(p, "[data-testid=inspector-overview]"); await closeOverlays(p); return "trong bảng Thêm"; }
          if (!(await isVisible(p, "[data-testid=ws-inspector]"))) await click(p, "[data-testid=inspector-btn]");
          await visible(p, "[data-testid=ws-inspector]");
          await click(p, `[data-inspector-tab="overview"]`); await visible(p, "[data-testid=inspector-overview]");
          await p.locator("[data-testid=ov-momentum]").click(); await visible(p, "[data-testid=oscillator-panel]");
          return m;
        }
        case "classic": {
          await click(p, "[data-testid=layout-classic]"); await closeOverlays(p);
          await p.waitForFunction((s) => document.querySelector(s)?.getAttribute("data-layout") === "classic", WS, { timeout: 5000 });
          if (!(await isVisible(p, "[data-testid=smc-panel]")) || !(await isVisible(p, "[data-testid=oscillator-panel]"))) throw new Error("bố cục cổ điển không xếp đủ bảng");
          await click(p, "[data-testid=layout-classic]"); await closeOverlays(p);
          await p.waitForFunction((s) => document.querySelector(s)?.getAttribute("data-layout") === "workspace", WS, { timeout: 5000 });
          return;
        }
        case "patternHighlight": {
          const row = p.locator("[data-testid=pattern-panel] tbody tr button").first();
          await row.scrollIntoViewIfNeeded(); await row.click();
          const open = p.locator("[data-testid=pattern-open-chart]").first();
          await open.waitFor({ state: "visible", timeout: 30_000 }); await open.click();
          await visible(p, "[data-testid=highlight-chip]", 30_000);
          return (await p.locator("[data-testid=highlight-chip]").textContent())?.trim();
        }
      }
    }
  }
}

async function metrics(p: Page) {
  return p.evaluate(() => {
    const chart = document.querySelector("[data-testid=ta-chart]")!.getBoundingClientRect();
    const tab = (document.querySelector(".ta-vnindex-tab") ?? document.body).getBoundingClientRect();
    const sub = [...document.querySelectorAll("button")].find((x) => /^Pattern Scanner/.test((x.textContent ?? "").trim()));
    const scroller = document.querySelector(".ta-vnindex-tab");
    return {
      chartTop: Math.round(chart.top + scrollY), chartOffsetInTab: Math.round(chart.top - tab.top), chartHeight: Math.round(chart.height),
      chartShareOfViewport: Math.round((chart.height / innerHeight) * 100), filtersTop: sub ? Math.round(sub.getBoundingClientRect().top + scrollY) : null,
      buttons: scroller?.querySelectorAll("button").length ?? 0, mode: document.querySelector("[data-testid=ta-workspace]")?.getAttribute("data-mode") ?? "classic",
      hscroll: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
}

async function runViewport(b: Browser, tag: keyof typeof VIEWPORTS) {
  const ctx = await b.newContext({ viewport: VIEWPORTS[tag], deviceScaleFactor: 1, hasTouch: tag === "m390" || tag === "tablet", acceptDownloads: true });
  if (LOCAL) {
    await ctx.route(GW, async (route) => {
      const req = route.request();
      if (!USER_API.test(req.url())) return route.continue();
      const cors = { "access-control-allow-origin": req.headers().origin ?? "*", "access-control-allow-credentials": "true", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS" };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      try { const r = await route.fetch({ url: req.url().replace(/^https:\/\/[^/]+/, LOCAL), headers: { ...req.headers(), origin: "http://localhost:5199" } }); return route.fulfill({ response: r, headers: { ...r.headers(), ...cors } }); } catch { return route.abort(); }
    });
  }
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await p.goto(BASE, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(2000);
  await p.fill("#login-email", EMAIL); await p.fill("#login-password", PW); await p.click(".login-btn");
  await p.waitForSelector(".m-tab", { timeout: 30_000 });
  await p.evaluate(() => { try { localStorage.removeItem("gq.ta.workspace.v1"); } catch { /* bỏ qua */ } });
  await p.locator(".m-tab", { hasText: /TA VN-Index/i }).first().click();
  await p.locator(CHART).waitFor({ state: "visible", timeout: 90_000 }); await p.waitForTimeout(4000);
  const before = await metrics(p);
  await p.screenshot({ path: path.join(OUT, `parity-${tag}-top.png`) });
  const results: Result[] = [];
  for (const item of PARITY_MANIFEST) {
    if (SKIP.has(item.id)) { results.push({ id: item.id, feature: item.feature, group: item.group, target: item.target, ok: true, ms: 0, note: "bỏ qua (--skip)" }); continue; }
    const t0 = Date.now();
    try { const note = await runCheck(p, item); results.push({ id: item.id, feature: item.feature, group: item.group, target: item.target, ok: true, ms: Date.now() - t0, ...(note ? { note } : {}) }); }
    catch (e) { results.push({ id: item.id, feature: item.feature, group: item.group, target: item.target, ok: false, ms: Date.now() - t0, note: (e as Error).message.split("\n")[0].slice(0, 160) }); await p.screenshot({ path: path.join(OUT, `fail-${tag}-${item.id}.png`) }).catch(() => {}); }
    await closeOverlays(p).catch(() => {});
  }
  await ctx.close();
  return { tag, viewport: VIEWPORTS[tag], metrics: before, pageErrors: errors.slice(0, 10), results };
}

const browser = await chromium.launch();
const runs = [];
for (const tag of wanted) { runs.push(await runViewport(browser, tag)); console.error(`${tag}: ${runs.at(-1)!.results.filter((r) => r.ok).length}/${PARITY_MANIFEST.length}`); }
await browser.close();
const report = { base: BASE, ticker: TICKER, at: new Date().toISOString(), items: PARITY_MANIFEST.length, runs };
fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 1));
const md = [`# Parity TA VN-Index — ${BASE} · ${report.at}`, "", "| Khung nhìn | Bố cục | Đạt | Chart top | Chart trong tab | Chart cao | Bộ lọc bắt đầu | Lỗi trang |", "|---|---|---|---|---|---|---|---|",
  ...runs.map((r) => `| ${r.tag} ${r.viewport.width}×${r.viewport.height} | ${r.metrics.mode} | ${r.results.filter((x) => x.ok).length}/${r.results.length} | ${r.metrics.chartTop} | ${r.metrics.chartOffsetInTab} | ${r.metrics.chartHeight} | ${r.metrics.filtersTop ?? "—"} | ${r.pageErrors.length} |`),
  "", "## Không đạt", ...runs.flatMap((r) => r.results.filter((x) => !x.ok).map((x) => `- ${r.tag} · ${x.id} (${x.feature}): ${x.note}`)),
  "", "## Lỗi trang", ...runs.flatMap((r) => r.pageErrors.map((e) => `- ${r.tag}: ${e}`)), ""].join("\n");
fs.writeFileSync(path.join(OUT, "baseline.md"), md);
console.log(md);
process.exit(runs.every((r) => r.results.every((x) => x.ok) && !r.pageErrors.length) ? 0 : 1);
