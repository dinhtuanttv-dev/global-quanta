// SC0 — E2E BẢO TOÀN TÍNH NĂNG cho phần Chart + bảng phân tích tab TA VN-Index (đợt nâng cấp Super Chart SC1–SC6).
// Chạy trực tiếp bằng Node 24 (type stripping, không biên dịch) + Playwright; đọc CHÍNH bản kê src/.../workspace/parityManifest.ts.
//   node e2e/ta-parity.ts --base https://dinhtuan-ck.vercel.app --out <dir> --pw-file <file> [--email e2e@local.test]
//        [--local-auth http://localhost:8787] [--ticker FPT] [--viewports desk,tablet,m390]
// --local-auth: chuyển đăng nhập + dữ liệu người dùng sang Gateway cục bộ (tài khoản thử), dữ liệu thị trường vẫn từ Gateway production.
// Ra: report.json (từng tính năng × khung nhìn), baseline.md, ảnh chụp; mã thoát 1 nếu có tính năng hỏng.
import { chromium, type Browser, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { PARITY_MANIFEST, type ParityItem } from "../../src/components/MainTabs/TaVnIndex/workspace/parityManifest.ts";

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("base")!, OUT = arg("out", "e2e-out")!, PW = fs.readFileSync(arg("pw-file")!, "utf8").trim();
const EMAIL = arg("email", "e2e@local.test")!, LOCAL = arg("local-auth"), TICKER = arg("ticker", "FPT")!;
const VIEWPORTS = { desk: { width: 1440, height: 900 }, tablet: { width: 1024, height: 768 }, m390: { width: 390, height: 844 } } as const;
const wanted = (arg("viewports", "desk,tablet,m390")!).split(",") as (keyof typeof VIEWPORTS)[];
const GW = /gateway-production-1da0\.up\.railway\.app/;
const USER_API = /\/api\/(auth\/|market\/(watchlists|chart-state|elliott\/counts|elliott\/alerts|radar))/;
fs.mkdirSync(OUT, { recursive: true });

interface Result { id: string; feature: string; group: string; target: string; ok: boolean; ms: number; note?: string }

const CHART = "[data-testid=ta-chart] [role=application]";
const visible = (p: Page, sel: string, timeout = 15_000) => p.locator(sel).first().waitFor({ state: "visible", timeout });
const pressed = (p: Page, sel: string) => p.locator(sel).first().getAttribute("aria-pressed");
async function click(p: Page, sel: string) { const l = p.locator(sel).first(); await l.scrollIntoViewIfNeeded(); await l.click(); }
async function chartShot(p: Page) { return (await p.locator(CHART).screenshot()).toString("base64"); }
const drawCount = async (p: Page) => Number(((await p.locator("[data-testid=drawings-clear]").first().textContent({ timeout: 500 }).catch(() => "")) ?? "").match(/\((\d+)\)/)?.[1] ?? 0);

async function runCheck(p: Page, item: ParityItem): Promise<string | void> {
  const c = item.check;
  switch (c.kind) {
    case "visible": await visible(p, c.sel, 60_000); return;
    case "tabs": { await visible(p, c.sel, 30_000); const n = await p.locator(c.sel).count(); if (n < c.min) throw new Error(`${n} < ${c.min}`); return; }
    case "click": {
      await click(p, c.sel); await visible(p, c.expect, 60_000);
      if (c.expect.includes("aria-pressed=true")) await click(p, c.sel); // trả về trạng thái cũ
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
      const sel = `[data-layer="${c.key}"]`;
      const panes0 = Number(await p.locator(CHART).getAttribute("data-panes") ?? 1);
      await click(p, sel);
      if ((await pressed(p, sel)) !== "true") throw new Error("không bật được");
      if (c.pane) await p.waitForFunction((n) => Number(document.querySelector("[data-testid=ta-chart] [role=application]")?.getAttribute("data-panes") ?? 1) > n, panes0, { timeout: 10_000 });
      if (c.expect) await visible(p, c.expect, 90_000);
      await click(p, sel);
      if ((await pressed(p, sel)) !== "false") throw new Error("không tắt được");
      return;
    }
    case "keys": {
      await p.locator(CHART).focus();
      const a = await chartShot(p);
      for (const k of ["ArrowLeft", "ArrowLeft", "Shift+ArrowLeft"]) await p.keyboard.press(k);
      await p.waitForTimeout(400);
      const b = await chartShot(p);
      if (a === b) throw new Error("← không dịch biểu đồ");
      await p.keyboard.press("End"); await p.keyboard.press("-"); await p.keyboard.press("+"); await p.keyboard.press("Home"); await p.keyboard.press("End");
      return;
    }
    case "draw": {
      const n0 = await drawCount(p);
      await click(p, `[data-tool="${c.tool}"]`);
      const box = (await p.locator(CHART).boundingBox())!;
      const x0 = box.x + box.width * 0.55, y0 = box.y + box.height * 0.45;
      if (c.clicks === 1) await p.mouse.click(x0, y0);
      else { await p.mouse.move(x0, y0); await p.mouse.down(); await p.mouse.move(x0 + box.width * 0.15, y0 - box.height * 0.12, { steps: 8 }); await p.mouse.up(); }
      await p.waitForFunction((n) => Number((document.querySelector("[data-testid=drawings-clear]")?.textContent ?? "").match(/\((\d+)\)/)?.[1] ?? 0) > n, n0, { timeout: 10_000 });
      return;
    }
    case "custom": {
      if (c.name === "ticker") {
        await p.locator(".ta-ticker-input").fill(TICKER); await p.locator(".ta-ticker-input").press("Enter");
        await p.waitForFunction((t) => document.querySelector(".ta-ticker-current")?.textContent === t, TICKER, { timeout: 60_000 });
        await visible(p, CHART, 60_000); await p.waitForTimeout(4000); return;
      }
      if (c.name === "pin") {
        await click(p, `[data-layer="smc"]`); await p.waitForTimeout(800); await p.locator(CHART).focus();
        const errs: number[] = [];
        for (const k of ["ArrowLeft", "ArrowRight", "-", "+"]) {
          await p.keyboard.press(k); await p.waitForTimeout(350);
          const probe = (await p.locator(CHART).getAttribute("data-overlay-probe")) ?? "";
          const [, ix, cx] = probe.split("|"); if (ix && cx) errs.push(Math.abs(Number(ix) - Number(cx)));
        }
        await click(p, `[data-layer="smc"]`);
        if (!errs.length) throw new Error("không đọc được đầu dò ghim");
        if (Math.max(...errs) > 1) throw new Error(`lệch ${Math.max(...errs)} px`);
        return `lệch tối đa ${Math.max(...errs)} px`;
      }
      if (c.name === "countSave") {
        // Như người dùng: trong trình chỉnh, đặt điểm lên biểu đồ (trái -> phải, xen kẽ cao / thấp) tới khi lưu được, rồi lưu.
        await click(p, "[data-testid=elliott-pro-tab-mine]");
        if (!(await p.locator("[data-testid=elliott-count-editor]").count())) await click(p, "[data-testid=elliott-edit]");
        const save = p.locator("[data-testid=elliott-edit-save]").first();
        const box = (await p.locator(CHART).boundingBox())!;
        for (let k = 0; k < 6 && !(await save.isEnabled()); k++) {
          const add = p.locator("[data-testid=elliott-edit-add]").first();
          if (!(await add.count())) break;
          await add.click();
          await p.locator(CHART).scrollIntoViewIfNeeded();
          const b2 = (await p.locator(CHART).boundingBox()) ?? box;
          await p.mouse.click(b2.x + b2.width * (0.3 + k * 0.08), b2.y + b2.height * (k % 2 ? 0.3 : 0.65));
          await p.waitForTimeout(300);
          await save.scrollIntoViewIfNeeded();
        }
        await save.click({ timeout: 10_000 });
        await visible(p, "[data-testid=elliott-count-history]", 15_000);
        return;
      }
      if (c.name === "drawSaved") { await visible(p, "[data-testid=drawings-saved]", 15_000); return; }
      if (c.name === "clearAll") {
        await click(p, "[data-testid=drawings-clear]");
        await p.locator("[data-testid=drawings-clear]").first().waitFor({ state: "detached", timeout: 10_000 }); return;
      }
      if (c.name === "structureEvent") {
        await p.evaluate((t) => window.dispatchEvent(new CustomEvent("gq:structure-open", { detail: { ticker: t } })), TICKER);
        await visible(p, "[data-testid=structure-panel]", 90_000); return;
      }
    }
  }
}

async function metrics(p: Page) {
  return p.evaluate(() => {
    const chart = document.querySelector("[data-testid=ta-chart]")!.getBoundingClientRect();
    const sub = [...document.querySelectorAll("button")].find((x) => /^Pattern Scanner/.test((x.textContent ?? "").trim()));
    const scroller = document.querySelector(".ta-vnindex-tab");
    return {
      chartTop: Math.round(chart.top + scrollY), chartHeight: Math.round(chart.height), chartShareOfViewport: Math.round((chart.height / innerHeight) * 100),
      filtersTop: sub ? Math.round(sub.getBoundingClientRect().top + scrollY) : null, buttons: scroller?.querySelectorAll("button").length ?? 0,
      layerToggles: document.querySelectorAll("[data-layer]").length, overlaysOnChart: document.querySelectorAll("[data-testid=ta-chart] > .absolute").length,
      hscroll: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
}

async function runViewport(b: Browser, tag: keyof typeof VIEWPORTS) {
  const ctx = await b.newContext({ viewport: VIEWPORTS[tag], deviceScaleFactor: 1, hasTouch: tag !== "desk" });
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
  await p.locator(".m-tab", { hasText: /TA VN-Index/i }).first().click();
  await visible(p, CHART, 90_000); await p.waitForTimeout(4000);
  const before = await metrics(p);
  await p.screenshot({ path: path.join(OUT, `baseline-${tag}-top.png`) });
  await p.screenshot({ path: path.join(OUT, `baseline-${tag}-full.png`), fullPage: true });
  const results: Result[] = [];
  for (const item of PARITY_MANIFEST) {
    const t0 = Date.now();
    try { const note = await runCheck(p, item); results.push({ id: item.id, feature: item.feature, group: item.group, target: item.target, ok: true, ms: Date.now() - t0, ...(note ? { note } : {}) }); }
    catch (e) { results.push({ id: item.id, feature: item.feature, group: item.group, target: item.target, ok: false, ms: Date.now() - t0, note: (e as Error).message.split("\n")[0].slice(0, 160) }); }
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
const md = [`# Parity TA VN-Index — ${BASE} · ${report.at}`, "", "| Khung nhìn | Đạt | Chart top | Chart cao | Bộ lọc bắt đầu | Nút | Lỗi trang |", "|---|---|---|---|---|---|---|",
  ...runs.map((r) => `| ${r.tag} ${r.viewport.width}×${r.viewport.height} | ${r.results.filter((x) => x.ok).length}/${r.results.length} | ${r.metrics.chartTop} | ${r.metrics.chartHeight} | ${r.metrics.filtersTop ?? "—"} | ${r.metrics.buttons} | ${r.pageErrors.length} |`),
  "", "## Không đạt", ...runs.flatMap((r) => r.results.filter((x) => !x.ok).map((x) => `- ${r.tag} · ${x.id} (${x.feature}): ${x.note}`)), ""].join("\n");
fs.writeFileSync(path.join(OUT, "baseline.md"), md);
console.log(md);
process.exit(runs.every((r) => r.results.every((x) => x.ok) && !r.pageErrors.length) ? 0 : 1);
