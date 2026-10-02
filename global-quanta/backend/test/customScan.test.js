process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { runScan, scoreCustom } from "../src/market/scanner/scanEngine.js";
import { classify, normalizeLabel, SECTOR_GROUPS, GROUP_OF } from "../src/market/scanner/taxonomy.js";
import { scoreCustomTickers, parseTickers, MAX_CUSTOM_TICKERS } from "../src/market/scanner/customScan.js";
import { KV } from "../src/market/scanner/scannerJobs.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { addDays } from "../src/market/util.js";

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
function makeBars(r, n, start = "2025-06-02") {
  const bars = [];
  let close = 10_000 + r() * 80_000;
  let date = start;
  for (let i = 0; i < n; i++) {
    const open = close * (1 + (r() - 0.5) * 0.03);
    close = Math.max(500, open * (1 + (r() - 0.48) * 0.05));
    bars.push({ date, open, high: Math.max(open, close) * (1 + r() * 0.015), low: Math.min(open, close) * (1 - r() * 0.015), close, closeAdj: close * 0.97, volume: Math.round(r() * 3e6) });
    date = addDays(date, 1);
  }
  return bars;
}
function makeQuarter(r) {
  return {
    revenue: r() * 5e12, netProfit: (r() - 0.2) * 8e11, grossProfit: r() * 1e12, totalAssets: r() * 2e13, totalLiabilities: r() * 1e13,
    totalEquity: r() * 1e13, currentAssets: r() * 6e12, currentLiabilities: r() * 5e12, longTermDebt: r() * 3e12,
  };
}
function makeWorld(seed = 3, n = 40) {
  const r = rng(seed);
  const tickers = Array.from({ length: n }, (_, i) => `M${String(i).padStart(2, "0")}`);
  const barsByTicker = new Map(), fundamentals = new Map();
  for (const t of tickers) {
    barsByTicker.set(t, makeBars(r, 200));
    const quarters = Array.from({ length: 6 }, () => makeQuarter(r));
    fundamentals.set(t, { income: { available: true, quarters }, balance: { available: true, quarters } });
  }
  const indexBars = makeBars(r, 250).map(({ closeAdj, ...b }) => b);
  const events = [{ verifiedStatus: "user_confirmed", sectors: ["Ngân hàng"], magnitude: "medium", direction: "positive", expectedDurationDays: 14, createdAt: "2026-09-28T00:00:00Z" }];
  return { tickers, barsByTicker, fundamentals, indexBars, events, now: new Date("2026-10-01T09:00:00Z") };
}

test("taxonomy: nhãn có dấu/không dấu/tiếng Anh quy về cùng ngành; ưu tiên nhãn tuyển chọn, rồi TradingView industry, rồi sector", () => {
  assert.equal(normalizeLabel("Bất Động Sản"), "bat dong san");
  assert.deepEqual(classify({ legacy: "Ngân hàng" }), { industry: "Ngân hàng", group: "Tài chính" });
  assert.deepEqual(classify({ legacy: "Ngan hang" }), { industry: "Ngân hàng", group: "Tài chính" });
  assert.deepEqual(classify({ legacy: "Khu cong nghiep", tvIndustry: "Homebuilding" }), { industry: "Khu công nghiệp", group: "Bất động sản" });
  assert.deepEqual(classify({ tvIndustry: "Investment Banks/Brokers", tvSector: "Finance" }), { industry: "Chứng khoán", group: "Tài chính" });
  assert.deepEqual(classify({ tvIndustry: "Real Estate Development", tvSector: "Finance" }), { industry: "Bất động sản", group: "Bất động sản" });
  assert.deepEqual(classify({ legacy: "Khac", tvSector: "Utilities" }), { industry: "Điện", group: "Tiện ích" });
  assert.deepEqual(classify({ legacy: "Finance" }), { industry: "Dịch vụ tài chính", group: "Tài chính" });
  assert.deepEqual(classify({}), { industry: "Khác", group: "Khác" });
  assert.deepEqual(classify({ symbol: "ABW" }), { industry: "Ngân hàng", group: "Tài chính" }, "phân ngành tay cho mã không có nhãn");
  // Mỗi ngành thuộc đúng một nhóm.
  const all = SECTOR_GROUPS.flatMap((g) => g.industries);
  assert.equal(new Set(all).size, all.length);
  assert.equal(GROUP_OF.size, all.length);
});

test("scoreCustom: chấm một mã theo bối cảnh universe cho ĐÚNG kết quả như khi mã nằm trong lần quét", () => {
  const w = makeWorld();
  const universe = w.tickers.map((t) => ({ ticker: t, sector: "Ngân hàng", name: `Cty ${t}`, industry: "Ngân hàng", sectorGroup: "Tài chính" }));
  const scan = runScan({ universe, barsByTicker: w.barsByTicker, fundamentals: w.fundamentals, indexBars: w.indexBars, events: w.events, foreignNetBuySet: new Set(["M03"]), now: w.now });
  const target = scan.items.find((i) => i.ticker === "M03");
  const again = scoreCustom({
    tickers: [universe.find((u) => u.ticker === "M03")], barsByTicker: w.barsByTicker, fundamentals: w.fundamentals,
    context: scan.context, foreignNetBuySet: new Set(["M03"]), now: w.now,
  });
  assert.deepEqual(again.items[0], target);
  assert.equal(target.industry, "Ngân hàng");
  assert.equal(target.sectorGroup, "Tài chính");
  // Ít hơn 50 nến -> bỏ qua có lý do.
  const short = scoreCustom({ tickers: [{ ticker: "NEW" }], barsByTicker: new Map([["NEW", makeBars(rng(1), 30)]]), fundamentals: new Map(), context: scan.context, now: w.now });
  assert.deepEqual(short.skipped.map((s) => [s.ticker, s.reason]), [["NEW", "INSUFFICIENT_BARS"]]);
});

test("customScan: mã trong bảng giữ nguyên điểm; mã ngoài universe được chấm theo cùng bối cảnh; báo mã không tồn tại / thiếu dữ liệu", async () => {
  const w = makeWorld(5, 40);
  const store = createMemoryStore();
  const inUni = w.tickers.slice(0, 30), outside = w.tickers.slice(30);
  const universe = inUni.map((t) => ({ ticker: t, sector: "Thép", industry: "Thép & Kim loại", sectorGroup: "Xây dựng & Vật liệu" }));
  const scan = runScan({ universe, barsByTicker: w.barsByTicker, fundamentals: w.fundamentals, indexBars: w.indexBars, events: w.events, foreignNetBuySet: new Set(), now: w.now });
  const dataAsOf = w.barsByTicker.get("M00").at(-1).date;
  await store.setKv(KV.latest, { generatedAt: "2026-10-01T09:00:00Z", dataAsOf, items: scan.items, indexState: scan.indexState });
  await store.setKv(KV.context, { dataAsOf, ...scan.context });
  await store.setKv(KV.taxonomy, { map: { M30: ["Tài chính", "Chứng khoán"] }, names: { M30: "CTCP Chứng khoán M30" } });
  await store.setSecurities([...w.tickers, "SHORT"].map((s) => ({ symbol: s, exchange: "HOSE", sector: null })), "TEST");
  const rows = [];
  for (const t of w.tickers) for (const b of w.barsByTicker.get(t)) rows.push({ symbol: t, exchange: "HOSE", ...b });
  for (const b of makeBars(rng(9), 20, addDays(dataAsOf, -19))) rows.push({ symbol: "SHORT", exchange: "HOSE", ...b });
  await store.upsertMarketDaily(rows);
  // BCTC: mã ngoài universe chưa có -> tải VCI (giả lập lỗi 404) -> vẫn chấm, FA rỗng.
  for (const t of inUni) await store.upsertFundamentals([{ ticker: t, ...w.fundamentals.get(t) }]);
  let vciCalls = 0;
  const fetchImpl = async () => { vciCalls++; return new Response("{}", { status: 404 }); };

  const out = await scoreCustomTickers({ store }, ["m05", "M30", "M31", "ZZZ", "SHORT", "M05"], { fetchImpl, now: () => w.now.getTime() });
  assert.equal(out.requested, 5, "chuẩn hoá chữ hoa + bỏ trùng");
  assert.deepEqual(out.items.map((i) => [i.ticker, i.inUniverse]), [["M05", true], ["M30", false], ["M31", false]]);
  assert.deepEqual(out.items[0], { ...scan.items.find((i) => i.ticker === "M05"), inUniverse: true });
  const m30 = out.items[1];
  assert.equal(m30.industry, "Chứng khoán");
  assert.equal(m30.sectorGroup, "Tài chính");
  assert.equal(m30.companyName, "CTCP Chứng khoán M30");
  assert.ok(Number.isFinite(m30.smartScore) && Number.isFinite(m30.rsRating));
  assert.equal(out.items[2].industry, "Khác");
  assert.deepEqual(out.notFound, ["ZZZ"]);
  assert.deepEqual(out.insufficient, ["SHORT"]);
  assert.ok(vciCalls >= 4, "tải BCTC cho các mã ngoài universe chưa có");
  assert.equal(out.fundamentalsFetched, 0);
});

test("customScan: kiểm tra đầu vào và trạng thái chưa quét", async () => {
  assert.deepEqual(parseTickers("fpt, hpg ;VNM  fpt"), ["FPT", "HPG", "VNM"]);
  assert.throws(() => parseTickers(""), /ít nhất 1 mã/);
  assert.throws(() => parseTickers("VNINDEX"), /không hợp lệ/);
  assert.throws(() => parseTickers(Array.from({ length: MAX_CUSTOM_TICKERS + 1 }, (_, i) => `A${String(i).padStart(2, "0")}`)), /Tối đa/);
  const store = createMemoryStore();
  await assert.rejects(() => scoreCustomTickers({ store }, ["FPT"]), (e) => e.statusCode === 503);
});

test("refreshTaxonomy: gắn ngành 2 cấp cho universe hiện tại mà KHÔNG đổi danh sách mã", async () => {
  const { createScannerJobs } = await import("../src/market/scanner/scannerJobs.js");
  const store = createMemoryStore();
  await store.setKv(KV.universe, { builtAt: "x", tickers: [{ ticker: "SSI", sector: "Finance" }, { ticker: "KBC", sector: "Khu cong nghiep" }, { ticker: "AAA", sector: "Khac" }] });
  const fakeFetch = async (url) => {
    const json = (body) => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => body });
    if (String(url).includes("tradingview")) return json({ data: [
      { s: "HOSE:SSI", d: ["SSI", "Finance", "SSI Securities", "Investment Banks/Brokers"] },
      { s: "HOSE:KBC", d: ["KBC", "Consumer Durables", "Kinh Bac City", "Homebuilding"] },
      { s: "HOSE:GEX", d: ["GEX", "Producer Manufacturing", "Gelex", "Electrical Products"] },
    ] });
    if (String(url).includes("/api/sieu-quet-ai/scanner")) return json({ items: [{ ticker: "KBC", sector: "Khu cong nghiep" }] });
    if (String(url).includes("/api/universe")) return json({ tickers: [] });
    throw new Error(`unexpected ${url}`);
  };
  const jobs = createScannerJobs({ store }, { fetchImpl: fakeFetch, now: () => Date.parse("2026-10-02T03:00:00Z") });
  const res = await jobs.refreshTaxonomy();
  const uni = (await store.getKv(KV.universe)).value;
  assert.deepEqual(uni.tickers.map((t) => [t.ticker, t.sectorGroup, t.industry]), [
    ["SSI", "Tài chính", "Chứng khoán"], ["KBC", "Bất động sản", "Khu công nghiệp"], ["AAA", "Khác", "Khác"],
  ]);
  assert.equal(uni.builtAt, "x", "không dựng lại universe");
  assert.equal(res.universe, 3);
  const tax = (await store.getKv(KV.taxonomy)).value;
  assert.deepEqual(tax.map.GEX, ["Công nghiệp", "Máy móc & Thiết bị"]);
  assert.equal(tax.names.GEX, "Gelex");
});
