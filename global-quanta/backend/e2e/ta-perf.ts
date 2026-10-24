// A6 (§6) — đo hiệu năng tab TA VN-Index theo SLO đã chốt (25/10/2026). Node 24 chạy TypeScript trực tiếp + Playwright:
//   node e2e/ta-perf.ts --base https://dinhtuan-ck.vercel.app --pw-file <file> [--local-auth http://localhost:8787] [--out dir]
// Đo: thời gian tới chart dùng được · kéo/zoom (p50/p95 khoảng khung hình, khung > 33 ms, long task) ở khung D 4 lớp, khung 1m (~4.500 nến),
// và mobile 390 px với CPU chậm 4× · đổi mã · bộ nhớ sau 20 lần đổi mã. Ghi perf.json + perf.md; thoát 1 nếu vượt SLO.
import { chromium, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";

const arg = (k: string, d?: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("base")!, OUT = arg("out", "e2e-perf")!, PW = fs.readFileSync(arg("pw-file")!, "utf8").trim(), LOCAL = arg("local-auth");
const EMAIL = arg("email", "e2e@local.test")!;
/** --proxy-all: đo BẢN BUILD CỤC BỘ trên dữ liệu thật — mọi yêu cầu tới Gateway production đi qua Playwright kèm CORS (origin localhost không được Gateway cho phép). */
const PROXY_ALL = process.argv.includes("--proxy-all");
/** SLO (anh duyệt 25/10): desktop kéo/zoom p95 ≤ 16,7 ms (+1 ms sai số đo), mobile CPU 4× p95 ≤ 33,4 ms, đổi mã trung vị ≤ 2 s, bộ nhớ tăng ≤ 40 MB / 20 lần đổi mã. */
export const SLO = { deskP95: 17.7, mobileP95: 34.4, switchMedianMs: 2000, heapGrowthMb: 40 };
const GW = /gateway-production-1da0\.up\.railway\.app/;
const USER_API = /\/api\/(auth\/|market\/(watchlists|chart-state|elliott\/counts|elliott\/alerts|radar|workspace))/;
const CHART = "[data-testid=ta-chart] [role=application]";
fs.mkdirSync(OUT, { recursive: true });

async function open(vp: { width: number; height: number }, touch: boolean, cpu = 1) {
  const b = await chromium.launch({ args: ["--enable-precise-memory-info", "--js-flags=--expose-gc"] });
  const ctx = await b.newContext({ viewport: vp, hasTouch: touch });
  if (LOCAL || PROXY_ALL) {
    await ctx.route(GW, async (route) => {
      const req = route.request();
      if (!USER_API.test(req.url()) || !LOCAL) {
        if (!PROXY_ALL) return route.continue();
        const cors = { "access-control-allow-origin": req.headers().origin ?? "*", "access-control-allow-credentials": "true", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS" };
        if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
        try { const r = await route.fetch(); return route.fulfill({ response: r, headers: { ...r.headers(), ...cors } }); } catch { return route.abort(); }
      }
      const cors = { "access-control-allow-origin": req.headers().origin ?? "*", "access-control-allow-credentials": "true", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS" };
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
      try { const r = await route.fetch({ url: req.url().replace(/^https:\/\/[^/]+/, LOCAL), headers: { ...req.headers(), origin: "http://localhost:5199" } }); return route.fulfill({ response: r, headers: { ...r.headers(), ...cors } }); } catch { return route.abort(); }
    });
  }
  const p = await ctx.newPage();
  if (cpu > 1) { const cdp = await ctx.newCDPSession(p); await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu }); }
  await p.goto(BASE, { waitUntil: "domcontentloaded" }); await p.waitForTimeout(1500);
  await p.fill("#login-email", EMAIL); await p.fill("#login-password", PW); await p.click(".login-btn");
  await p.waitForSelector(".m-tab", { timeout: 30_000 });
  const t0 = Date.now();
  await p.locator(".m-tab", { hasText: /TA VN-Index/i }).first().click();
  await p.locator(`${CHART} canvas`).first().waitFor({ timeout: 90_000 });
  return { b, p, tti: Date.now() - t0 };
}

async function pickTicker(p: Page, t: string) {
  await p.locator(".ta-ticker-input").fill(t); await p.locator(".ta-ticker-input").press("Enter");
  await p.waitForFunction((x) => document.querySelector("[data-testid=ohlc-legend]")?.textContent?.startsWith(x), t, { timeout: 60_000 });
}

/** Kéo + cuộn trên chart; khoảng thời gian giữa các khung hình (requestAnimationFrame) và long task. */
async function panZoom(p: Page) {
  await p.evaluate(() => {
    const w = window as unknown as { __lt: number[]; __ft: number[] };
    w.__lt = []; new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__lt.push(e.duration))).observe({ type: "longtask" });
    w.__ft = []; let last = performance.now();
    const tick = (t: number) => { w.__ft.push(t - last); last = t; if (w.__ft.length < 420) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  });
  const box = (await p.locator(CHART).boundingBox())!;
  await p.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.3); await p.mouse.down();
  for (let i = 0; i < 60; i++) { await p.mouse.move(box.x + box.width * 0.75 - i * (box.width / 120), box.y + box.height * 0.3); await p.waitForTimeout(16); }
  await p.mouse.up();
  for (let i = 0; i < 10; i++) { await p.mouse.wheel(0, i % 2 ? 300 : -300); await p.waitForTimeout(60); }
  await p.waitForTimeout(900);
  return p.evaluate(() => {
    const w = window as unknown as { __lt: number[]; __ft: number[] };
    const f = w.__ft.slice(5).sort((a, b) => a - b), q = (x: number) => Math.round(f[Math.floor((f.length - 1) * x)] * 10) / 10;
    return { frames: f.length, p50: q(0.5), p95: q(0.95), over33: f.filter((x) => x > 33.4).length, longTasks: w.__lt.length, longMaxMs: Math.round(Math.max(0, ...w.__lt)) };
  });
}

async function layers(p: Page, keys: string[]) {
  await p.locator("[data-testid=layers-menu-btn]").click(); await p.waitForTimeout(300);
  for (const k of keys) { const btn = p.locator(`[data-layer=${k}]:visible`).first(); if ((await btn.getAttribute("aria-pressed")) !== "true") await btn.click(); }
  await p.keyboard.press("Escape"); await p.waitForTimeout(1500);
}

type Pan = Awaited<ReturnType<typeof panZoom>>;
const out: { base: string; at: string; slo: typeof SLO; ttiMs?: number; deskD?: Pan; desk1m?: Pan; mobile4x?: Pan; switch?: { firstPassMs: number[]; median: number; p95: number }; heapMb?: { before: number; after20: number } } =
  { base: BASE, at: new Date().toISOString(), slo: SLO };
{ // Desktop 1440: thời gian tới chart, kéo/zoom khung D với 4 lớp, khung 1m, đổi mã, bộ nhớ.
  const { b, p, tti } = await open({ width: 1440, height: 900 }, false);
  out.ttiMs = tti;
  await pickTicker(p, "FPT"); await p.waitForTimeout(1500);
  await layers(p, ["volume", "rsi", "macd", "smc"]);
  out.deskD = await panZoom(p);
  await p.locator("[data-tf='1m']").click();
  await p.waitForFunction(() => /\d\d:\d\d/.test(document.querySelector("[data-testid=ohlc-legend]")?.textContent ?? ""), null, { timeout: 120_000 });
  await p.waitForTimeout(1500);
  out.desk1m = await panZoom(p);
  await p.locator("[data-tf=D]").click(); await p.waitForTimeout(1500);
  const heap = () => p.evaluate(() => { (window as unknown as { gc?: () => void }).gc?.(); return Math.round(((performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0) / 1e6); });
  const h0 = await heap(), sw: number[] = [];
  const list = ["HPG", "VNM", "MWG", "SSI", "VCB", "FPT"];
  for (let k = 0; k < 20; k++) { const t = list[k % list.length]; const s = Date.now(); await pickTicker(p, t); sw.push(Date.now() - s); }
  await p.waitForTimeout(1500);
  const sorted = [...sw].sort((a, b) => a - b);
  out.switch = { firstPassMs: sw.slice(0, 6), median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.floor((sorted.length - 1) * 0.95)] };
  out.heapMb = { before: h0, after20: await heap() };
  await b.close();
}
{ // Mobile 390 px, CPU chậm 4×.
  const { b, p } = await open({ width: 390, height: 844 }, true, 4);
  await pickTicker(p, "FPT"); await p.waitForTimeout(2000);
  out.mobile4x = await panZoom(p);
  await b.close();
}
const checks: [string, number, number, boolean][] = [
  ["Kéo/zoom D 4 lớp p95 (desktop, ms)", out.deskD!.p95, SLO.deskP95, out.deskD!.p95 <= SLO.deskP95],
  ["Kéo/zoom 1m ~4.500 nến p95 (desktop, ms)", out.desk1m!.p95, SLO.deskP95, out.desk1m!.p95 <= SLO.deskP95],
  ["Kéo/zoom p95 mobile 390 · CPU 4× (ms)", out.mobile4x!.p95, SLO.mobileP95, out.mobile4x!.p95 <= SLO.mobileP95],
  ["Đổi mã trung vị (ms)", out.switch!.median, SLO.switchMedianMs, out.switch!.median <= SLO.switchMedianMs],
  ["Bộ nhớ tăng sau 20 lần đổi mã (MB)", out.heapMb!.after20 - out.heapMb!.before, SLO.heapGrowthMb, out.heapMb!.after20 - out.heapMb!.before <= SLO.heapGrowthMb],
];
fs.writeFileSync(path.join(OUT, "perf.json"), JSON.stringify({ ...out, checks: checks.map(([name, value, slo, ok]) => ({ name, value, slo, ok })) }, null, 1));
const md = [`# Hiệu năng TA VN-Index — ${BASE} · ${out.at}`, "", `Thời gian tới chart dùng được: ${out.ttiMs} ms`, "", "| Chỉ số | Đo | SLO | Đạt |", "|---|---|---|---|",
  ...checks.map(([n, v, s, ok]) => `| ${n} | ${v} | ≤ ${s} | ${ok ? "✓" : "✗"} |`), "",
  "```json", JSON.stringify({ deskD: out.deskD, desk1m: out.desk1m, mobile4x: out.mobile4x, switch: out.switch, heapMb: out.heapMb }, null, 1), "```", ""].join("\n");
fs.writeFileSync(path.join(OUT, "perf.md"), md);
console.log(md);
process.exit(checks.every((c) => c[3]) ? 0 : 1);
