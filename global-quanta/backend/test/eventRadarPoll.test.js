process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEventRadar, MACRO_RSS_FEEDS } from "../src/market/news/eventRadar.js";
import { createEventRadarRepository } from "../src/market/news/eventRadarRepository.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";

const rss = (items) => `<?xml version="1.0"?><rss><channel>${items.map((i) => `<item><title>${i.title}</title><link>${i.link}</link><description>${i.summary ?? ""}</description><pubDate>Thu, 30 Oct 2026 08:00:00 +0700</pubDate></item>`).join("")}</channel></rss>`;

function fakeFetch() {
  return async (url) => {
    const u = String(url);
    if (u === MACRO_RSS_FEEDS[0].url) {
      return new Response(rss([{ title: "Chuyên gia World Bank: Mô hình cũ không thể giúp Việt Nam giàu", link: "https://vietstock.vn/vi-mo-1.htm", summary: "Ngân hàng Vietcombank và FPT được nhắc tới." }]));
    }
    if (/\.rss/.test(u)) return new Response(rss([{ title: "FPT báo lãi ròng quý 3 tăng 20%", link: `https://example.vn/${encodeURIComponent(u)}.htm` }]));
    return new Response(JSON.stringify({ data: [] }), { headers: { "content-type": "application/json" } });
  };
}

test("EV-R hồi quy (30/10/2026): lượt quét với sự kiện MỚI không lỗi; tin chuyên mục vĩ mô -> MACRO_NEWS; quét lại không tạo phiên bản mới", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-"));
  try {
    const store = createMemoryStore();
    const service = { store, getUniverse: async () => ({ tickers: [{ ticker: "FPT", name: "FPT", avgValue20: 1 }, { ticker: "VCB", name: "Vietcombank", avgValue20: 1 }] }) };
    let t = Date.parse("2026-10-30T02:00:00Z");
    const radar = createEventRadar({ service, repository: createEventRadarRepository({ dataDir: dir }), fetchImpl: fakeFetch(), now: () => t, enabled: true });

    const first = await radar.poll({ force: true });
    assert.ok(first.ingested > 0, "lượt đầu phải lưu được sự kiện mới (trước đây: Cannot read properties of undefined (reading 'payload'))");
    const listed = await radar.list({ category: "MACRO_NEWS,MONETARY_POLICY", limit: 250 });
    const macro = listed.events.find((e) => /World Bank/.test(e.title));
    assert.equal(macro?.eventType, "MACRO_NEWS");
    assert.ok(listed.events.every((e) => ["MACRO_NEWS", "MONETARY_POLICY"].includes(e.eventType)));

    t += 10 * 60_000;
    await radar.poll({ force: true });
    const again = (await radar.list({ limit: 250 })).events.find((e) => e.eventId === macro.eventId);
    assert.equal(again.revision, 1);
    assert.notEqual(again.verificationStatus, "updated_needs_review");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
