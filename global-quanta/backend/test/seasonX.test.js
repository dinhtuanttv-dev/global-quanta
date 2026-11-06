import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { announceFromNews, classify, parsePage, periodOf } from "../src/market/fundamentals/cafefAnnounce.js";
import { createCafefAnnounce } from "../src/market/fundamentals/cafefAnnounceService.js";
import { createSeasonX } from "../src/market/fundamentals/seasonX.js";
import { mergeAnnounce } from "../src/market/fundamentals/seasonXJob.mjs";

test("S8 nhận diện tin: kỳ, lớp, loại kiểm toán / dự báo / giải trình muộn", () => {
  assert.deepEqual(periodOf("ket qua kinh doanh 06 thang nam 2025"), { q: 2, y: 2025 });
  assert.deepEqual(periodOf("bctc quy iii/2024"), { q: 3, y: 2024 });
  assert.deepEqual(periodOf("cong bo ket qua kinh doanh nam 2023"), { q: 4, y: 2023 });
  assert.deepEqual(classify("2025-07-18", "FPT: Thông báo kết quả kinh doanh 06 tháng năm 2025"), { fiscal: "2025-06-30", tier: "FILING", lag: 18 });
  assert.deepEqual(classify("2024-01-19", "FPT: Công bố kết quả kinh doanh năm 2023"), { fiscal: "2023-12-31", tier: "FILING", lag: 19 });
  assert.equal(classify("2026-04-22", "Vinamilk báo lãi quý 1 tăng vọt 55%").tier, "PRESS");
  assert.equal(classify("2025-03-25", "FPT: Báo cáo tài chính năm 2024 đã kiểm toán"), null);
  assert.equal(classify("2026-11-06", "CTCK đưa ra dự báo bất ngờ về lợi nhuận quý 4 của FPT"), null);
  assert.equal(classify("2024-08-15", "DGC: Giải trình chênh lệch lợi nhuận sau thuế 6 tháng đầu năm 2024"), null); // 46 ngày: bản soát xét
  assert.equal(classify("2024-07-22", "DGC: Giải trình chênh lệch lợi nhuận quý 2/2024").tier, "FILING");
  const m = announceFromNews([["2024-01-25", "MWG lãi quý 4/2023 tăng mạnh"], ["2024-01-30", "MWG: Báo cáo tài chính quý 4/2023"], ["2024-01-31", "MWG: Giải trình biến động lợi nhuận quý 4/2023"]]);
  assert.deepEqual(m.get("2023-12-31"), { date: "2024-01-30", tier: "FILING", title: "MWG: Báo cáo tài chính quý 4/2023" }); // lớp 1 thắng tin báo sớm hơn
  assert.deepEqual(parsePage('<li>21/10/2026 10:15 <img src="x"/> <a href="/a">FPT: Kết quả kinh doanh 9 tháng năm 2026</a></li>'), [["2026-10-21", "FPT: Kết quả kinh doanh 9 tháng năm 2026"]]);
});

test("S8 ghép ngày làm mốc: thay ngày VNDirect bằng ngày CafeF cùng kỳ, thêm kỳ chỉ CafeF có", () => {
  const vnd = { 1: ["2024-04-26", "2025-04-29"], 2: [], 3: [], 4: ["2025-01-31"] };
  const { announce, sources } = mergeAnnounce(vnd, { "2025-03-31": "2025-04-21", "2024-12-31": "2025-01-24", "2025-06-30": "2025-07-18" });
  assert.deepEqual(announce["1"], ["2024-04-26", "2025-04-21"]);
  assert.deepEqual(announce["4"], ["2025-01-24"]);
  assert.deepEqual(announce["2"], ["2025-07-18"]);
  assert.deepEqual(sources, { cafef: 3, vnd: 1, added: 1 });
});

test("S8 đọc CafeF từ mới về cũ, dừng ở mốc, chạy tiếp từ chỗ dừng; tiêu chí đặt trước so tin BCTC chính thức", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ca-"));
  fs.writeFileSync(path.join(dir, "AAA.json.gz"), zlib.gzipSync(JSON.stringify({ ticker: "AAA", quarters: [] })));
  const pages = { 1: [["2026-10-21", "AAA: Kết quả kinh doanh 9 tháng năm 2026"]], 2: [["2021-07-20", "AAA: Báo cáo tài chính quý 2/2021"]], 3: [["2019-07-19", "AAA: Báo cáo tài chính quý 2/2019"]], 4: [] };
  const html = (rows) => rows.map(([d, t]) => `${d.slice(8)}/${d.slice(5, 7)}/${d.slice(0, 4)} <a>${t}</a>`).join("\n");
  const seen = [];
  const fetchImpl = async (url) => { const p = Number(new URL(url).searchParams.get("PageIndex")); seen.push(p); return { ok: true, text: async () => html(pages[p] ?? []) }; };
  const ca = createCafefAnnounce({ dir, fetchImpl, delayMs: 0, log: { log() {} } });
  const a = await ca.crawl({ until: "2020-01-01" });
  assert.deepEqual(seen, [1, 2, 3]); // trang 3 đã qua 2020 -> dừng
  assert.equal(a.reached, 1);
  assert.equal(ca.dates("AAA").get("2026-09-30").date, "2026-10-21");
  await ca.crawl({ until: "2013-01-01" });
  assert.deepEqual(seen, [1, 2, 3, 4]); // tiếp từ trang 4, hết tin
  assert.equal(ca.status().reached2013, 1);
  const ev = ca.evaluate();
  assert.equal(ev.pass, false); // < 100 kỳ đối chiếu
  fs.rmSync(dir, { recursive: true, force: true });
});

test("S8 bản THĂM DÒ: không chạy khi chưa đạt tiêu chí; chạy (force) ghi seasonx/, trả 9 mục theo hợp đồng", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sx-"));
  const cafef = { evaluate: () => ({ pass: false, precision: 0.8, found: 50 }), dates: () => new Map([["2025-03-31", { date: "2025-04-21", tier: "FILING" }], ["2025-06-30", { date: "2025-07-10", tier: "PRESS" }]]) };
  const calls = [];
  const runJob = async ({ fn, params }) => {
    calls.push({ fn, params });
    if (fn === "collectX") return { status: 200, body: { rows: params.tickers.map((t) => ({ ticker: t, ok: true, samples: {}, paths: { 1: { eventPaths: [] } }, announce: { 1: ["2025-04-21"] }, sources: { cafef: 1, vnd: 0, added: 0 }, priceSource: "SSI_TOTAL_RETURN" })) } };
    return { status: 200, body: { rows: Object.fromEntries(params.collected.map((c) => [c.ticker, { stats: { 1: { windows: [] } }, calendar: { ticker: c.ticker }, priorScope: {} }])) } };
  };
  const sx = createSeasonX({ dir, cafef, listMeta: async () => [{ ticker: "AAA", sector: "X" }], runJob, log: { log() {} } });
  assert.match((await sx.run()).skipped, /chưa đạt/);
  assert.equal(sx.items("AAA"), null);
  const r = await sx.run({ force: true });
  assert.equal(r.tickers, 1);
  assert.deepEqual(calls[0].params.overrides.AAA, { "2025-03-31": "2025-04-21" }); // chỉ lớp FILING
  assert.equal(calls[1].params.collected[0].sector, "X");
  const it = sx.items("AAA");
  assert.equal(it.items.calendar.status, 200);
  assert.equal(it.items["stats:2"].status, 404);
  assert.equal(it.items["paths:1"].status, 200);
  assert.equal(it.sources.cafef, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});
