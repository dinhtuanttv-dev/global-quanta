const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { readFileSync } = require("node:fs");
const { extname, resolve, sep } = require("node:path");
const { chromium } = require("../backend/node_modules/playwright");

const root = resolve(__dirname, "../dist");
const pulse = require("../src/lib/elite10/__fixtures__/pulse-2026-11-20.json").decision;
const decision = { ...require("../backend/test/fixtures/elite-decision-20261023.json"), ...pulse };
const seen = new Date(Date.now() - 60_000).toISOString();
const event = {
  eventId: "browser-event-r1", clusterId: "browser-event", source: "ISSUER", sourceLabel: "Fixture",
  sourceAuthority: "configured_official_feed", usageTermsStatus: "ok", verificationStatus: "official_source_not_crosschecked",
  title: "Fixture catalyst", summary: "Snapshot revision", url: null, attachment: null,
  publishedAt: seen, firstSeenAt: seen, updatedAt: null, eventType: "DISCLOSURE", eventLabel: "Disclosure",
  tickers: ["FPT"], entityMatch: "provider_tagged", entityConfidence: .95, severity: "watch", severityScore: 1,
  corroboratingSources: [], corroborationCount: 1, documentCount: 1, sourceDocuments: [], revision: 1, reactionStatus: "pending",
};
const responses = {
  "/api/elite/decision": decision,
  "/api/elite/decision/FPT": { ticker: "FPT", eligible: true, rank: 4, Z: null, close: null, advBn: null, date: decision.date, version: decision.version, inPortfolio: false },
  "/api/market/event-radar": { events: [event], generatedAt: seen, sources: {}, meta: {} },
};
const mime = { ".js": "application/javascript", ".css": "text/css", ".html": "text/html" };
const server = createServer((request, response) => {
  const { pathname } = new URL(request.url, "http://127.0.0.1");
  const file = resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
  if (!file.startsWith(root + sep)) { response.writeHead(404).end(); return; }
  try {
    const data = readFileSync(file);
    response.writeHead(200, { "content-type": mime[extname(file)] ?? "application/octet-stream" }).end(data);
  }
  catch { response.writeHead(404).end(); }
});

async function main() {
  const { createResearchRoom } = await import("../backend/src/market/elite/researchRoom.js");
  const { createMemoryStore } = await import("../backend/src/market/store/memoryStore.js");
  const room = createResearchRoom({ store: createMemoryStore() });
  await new Promise((ready) => server.listen(0, "127.0.0.1", ready));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({
    chromiumSandbox: true,
    args: ["--disable-gpu", "--no-proxy-server", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost"],
  });
  try {
    async function newContext() {
      const context = await browser.newContext({ viewport: { width: 1440, height: 950 } });
      await context.route("https://**/*", async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization,content-type", "access-control-allow-methods": "GET,POST,PUT,OPTIONS" };
        if (request.method() === "OPTIONS") return route.fulfill({ status: 200, headers });
        const data = responses[url.pathname];
        const base = "/api/elite/ai-room/runs";
        if (!url.pathname.startsWith(base)) return route.fulfill({ status: data ? 200 : 404, headers, json: data ?? {} });
        const owner = request.headers().authorization?.replace(/^Bearer /, "");
        try {
          if (!owner) return route.fulfill({ status: 401, headers, json: {} });
          const id = url.pathname.slice(base.length + 1);
          const record = request.method() === "PUT" ? await room.save(owner, id, request.postDataJSON().run, request.postDataJSON().approve)
            : id ? await room.get(owner, id) : await room.list(owner, url.searchParams.get("ticker"), url.searchParams.get("offset") ?? "0");
          await route.fulfill({ status: 200, headers, json: record });
        } catch (error) {
          await route.fulfill({ status: error.statusCode ?? 500, headers, json: { error: error.message } });
        }
      });
      await context.addInitScript(({ origin }) => {
      if (location.origin !== origin) return;
      localStorage.setItem("gq_session_v2", JSON.stringify({
        access_token: "research-account-1", refresh_token: "fixture", expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: "research-account-1", email: "fixture@example.invalid", admin: false, mustChangePassword: false },
      }));
      }, { origin });
      return context;
    }
    const original = await newContext();
    let page = await original.newPage();
    page.setDefaultTimeout(9000);
    let dialog = page.locator("dialog[open]");
    const title = (name) => page.getByRole("button", { name, exact: true });
    async function openRoom() {
      await page.locator("#elite10-ai-tab").click();
      assert.equal(await page.locator("[role=tablist] [id^=elite10-]").count(), 5);
      await title("Chọn mã cổ phiếu").click();
      await dialog.locator("#elite-debate-subject").fill("FPT");
      await dialog.locator("button[type=submit]").click();
    }
    await page.goto(`${origin}/?tab=quyet-dinh`);
    await openRoom();
    await title("Phiên đã lưu").click();
    await dialog.getByRole("button", { name: "Lưu phiên đang xem" }).click();
    await dialog.getByRole("button", { name: "Mở bản đã lưu" }).click();
    await page.getByText("Đang xem bản đã lưu", { exact: true }).waitFor();
    await title("Phản chứng").click();
    await dialog.locator("select").selectOption("browser-event");
    await dialog.getByRole("button", { name: "Áp dụng trên canvas" }).click();
    await page.getByText("Mô phỏng · Đã loại nguồn xúc tác", { exact: true }).waitFor();
    await title("Obsidian").click();
    await dialog.getByRole("button", { name: "YAML / Markdown" }).click();
    assert.match(await dialog.locator("pre").innerText(), /is_scenario: true/);
    await dialog.getByRole("button", { name: "Duyệt ghi chú" }).click();
    await dialog.getByText("Đã duyệt trên máy chủ.").waitFor();
    assert.match(await dialog.locator("pre").innerText(), /APPROVED_GATEWAY/);
    assert.equal(await original.pages().length, 1);
    await original.close();
    const second = await newContext();
    page = await second.newPage();
    page.setDefaultTimeout(9000);
    dialog = page.locator("dialog[open]");
    await page.goto(`${origin}/?tab=quyet-dinh`);
    await openRoom();
    await title("Phiên đã lưu").click();
    await dialog.getByRole("button", { name: "Mở bản đã lưu" }).nth(1).waitFor();
    await dialog.getByRole("button", { name: "Mở bản đã lưu" }).first().click();
    await title("Obsidian").click();
    await dialog.getByText("Đã duyệt trên tài khoản", { exact: true }).waitFor();
    await page.keyboard.press("Escape");
    await title("Về bản gốc").click();
    await page.getByText("Đang xem bản gốc của nhánh đã lưu", { exact: true }).waitFor();
    await title("Phiên đã lưu").click();
    await dialog.getByRole("button", { name: "Mở bản đã lưu" }).nth(1).waitFor();
    await page.evaluate(() => {
      const key = "gq_session_v2";
      const session = JSON.parse(localStorage.getItem(key));
      session.user.id = "research-account-2";
      session.access_token = "research-account-2";
      localStorage.setItem(key, JSON.stringify(session));
      window.dispatchEvent(new StorageEvent("storage", { key }));
    });
    await dialog.waitFor({ state: "hidden" });
    await title("Phiên đã lưu").click();
    await dialog.getByText("Chưa có phiên đã lưu cho phạm vi này.").waitFor();
    console.log("PASS · Chromium: điều hướng, replay trên trình duyệt khác, phản chứng, duyệt Obsidian, về bản gốc và đổi tài khoản.");
  } finally { await browser.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => server.close());
