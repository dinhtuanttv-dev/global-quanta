process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fetchVndShares, impactSummary, indexImpact } from "../src/market/tradingMatrix/indexImpact.js";
import { riskFlags } from "../src/market/tradingMatrix/riskRules.js";
import { createMatrixService } from "../src/market/tradingMatrix/matrixService.js";
import { createLocalStore } from "../src/market/store/localStore.js";
import { tradingDatesBack } from "../src/market/scanner/scannerJobs.js";

const row = (symbol, close, refPrice, exchange = "HOSE") => ({ symbol, exchange, close, refPrice, value: 1e9 });

test("Index Impact: đóng góp = I(t−1)·ΔP·N / Σ R·N; Σ đóng góp khớp biến động thật -> MATCH", () => {
  // Vốn hoá tham chiếu: A 100·10 = 1000, B 50·20 = 1000 -> mỗi mã 50%. A +10%, B −2% -> chỉ số +4%.
  const shares = new Map([["A", 10], ["B", 20]]);
  const r = indexImpact({ date: "2026-10-21", rows: [row("A", 110, 100), row("B", 49, 50), row("C", 9, 10, "HNX")], shares, indexPrev: 1000, indexClose: 1040, taxonomy: { A: ["Tài chính", "Ngân hàng"] } });
  assert.deepEqual(r.items.map((x) => [x.symbol, x.points, x.weightPct]), [["A", 50, 50], ["B", -10, 50]]);
  assert.equal(r.items[0].industry, "Ngân hàng");
  assert.deepEqual(r.check, { predictedPoints: 40, actualPoints: 40, predictedPct: 4, actualPct: 4, diffPp: 0, status: "MATCH" });
  assert.deepEqual(r.coverage, { symbols: 2, of: 2, missing: [] }, "mã HNX không thuộc VN-Index");
  assert.equal(r.sectors[0].industry, "Ngân hàng");
});

test("Index Impact: ngày GDKHQ — giá tham chiếu SSI chưa điều chỉnh -> điều chỉnh theo sự kiện quyền (không tính sụt giá giả)", () => {
  const shares = new Map([["A", 11], ["B", 20]]);
  // A thưởng 10%: tham chiếu SSI 100 (= đóng cửa hôm trước), giá đúng ≈ 90,9; A đóng cửa 91 -> gần như đứng giá.
  const eventsOf = (s) => (s === "A" ? [{ exDate: "2026-09-21", cash: 0, ratio: 0.1, label: "Thưởng CP 10%" }] : null);
  const r = indexImpact({ date: "2026-09-21", rows: [row("A", 91, 100), row("B", 50, 50)], shares, eventsOf, indexPrev: 1000, indexClose: 1000 });
  const a = r.items.find((x) => x.symbol === "A");
  assert.ok(Math.abs(a.points) < 1, `A gần như không đóng góp (${a.points})`);
  assert.equal(a.adjusted.label, "Thưởng CP 10%");
  // Thiếu số cổ phiếu -> báo thiếu, không đoán.
  const m = indexImpact({ date: "2026-09-21", rows: [row("A", 91, 100), row("Z", 10, 10)], shares, indexPrev: 1000, indexClose: 999 });
  assert.deepEqual(m.coverage.missing, ["Z"]);
  assert.equal(m.check.status, "DEVIATION", "không điều chỉnh sự kiện -> lệch, UI ghi rõ");
  assert.equal(indexImpact({ date: "d", rows: [], shares, indexPrev: null, indexClose: null }).check, null);
});

test("impactSummary: trụ kéo / đè và độ tập trung 5 mã", () => {
  const r = indexImpact({ date: "d", rows: [row("A", 110, 100), row("B", 49, 50), row("C", 20, 20)], shares: new Map([["A", 10], ["B", 20], ["C", 1]]), indexPrev: 1000, indexClose: 1039.6 });
  const s = impactSummary(r);
  assert.deepEqual(s.up.map((x) => x.symbol), ["A"]);
  assert.deepEqual(s.down.map((x) => x.symbol), ["B"]);
  assert.equal(s.top5Share, 100);
});

test("fetchVndShares: gộp mã, đọc OUTSTANDING_SHARES", async () => {
  const urls = [];
  const m = await fetchVndShares(["FPT", "VCB"], { fetchImpl: async (u) => { urls.push(u); return new Response(JSON.stringify({ data: [{ code: "FPT", value: 1.885727648e9 }, { code: "VCB", value: 8.355675094e9 }] })); } });
  assert.equal(urls.length, 1);
  assert.equal(m.get("FPT"), 1.885727648e9);
});

test("cờ RF1/RF3 có liên kết mã / ngành; RF1 UNAVAILABLE chỉ khi không có nguồn sự kiện", () => {
  const links = { impact: { up: [{ symbol: "VCB" }, { symbol: "BID" }] }, sectors: { laggards: [{ industry: "Bất động sản" }], medianReturn5: { "Thép & Kim loại": { m1: 1, m5: 4.2, breadth: 40, breadth5: 60 } } } };
  const ev = [{ industries: ["Thép & Kim loại"], direction: "positive" }];
  const f = riskFlags({ day: null, flow: null, links, events: ev });
  assert.deepEqual(f.find((x) => x.id === "RF3").related, { tickers: ["VCB", "BID"], sectors: ["Bất động sản"] });
  const rf1 = f.find((x) => x.id === "RF1");
  assert.equal(rf1.status, "ON");
  assert.deepEqual(rf1.related.sectors, ["Thép & Kim loại"]);
  assert.equal(riskFlags({ day: null, flow: null, links, events: [] }).find((x) => x.id === "RF1").status, "OFF");
  assert.equal(riskFlags({ day: null, flow: null, links, events: null }).find((x) => x.id === "RF1").status, "UNAVAILABLE");
});

test("service: Index Impact từ kho cục bộ + snapshot tổng hợp có liên kết (trụ chỉ số, ngành); VNDirect lỗi -> dùng bản lưu", async () => {
  const store = createLocalStore({ dir: fs.mkdtempSync(path.join(os.tmpdir(), "gq-ii-")), log: { warn() {} } });
  const dates = tradingDatesBack("2026-10-21", 80);
  const syms = Array.from({ length: 8 }, (_, i) => `S${i}`);
  for (const [k, date] of dates.entries()) await store.upsertMarketDaily(syms.map((symbol, j) => {
    const c = 100 + k * (j < 4 ? 0.5 : -0.2), p = 100 + (k - 1) * (j < 4 ? 0.5 : -0.2);
    return { symbol, date, exchange: "HOSE", open: c, high: c * 1.01, low: c * 0.99, close: c, closeAdj: c, refPrice: p, volume: 1e5, value: 1e9, foreignBuyVal: 1, foreignSellVal: 0 };
  }));
  await store.setKv("scanner:taxonomy", { map: Object.fromEntries(syms.map((s, j) => [s, ["Tài chính", j < 4 ? "Ngân hàng" : "Chứng khoán"]])) });
  // Chỉ số dựng từ đúng vốn hoá (mỗi mã 1 triệu cổ phiếu) -> Σ đóng góp phải khớp.
  const capOf = (k) => syms.reduce((a, _s, j) => a + (100 + k * (j < 4 ? 0.5 : -0.2)), 0);
  const idx = dates.map((date, k) => ({ date, open: 0, high: 0, low: 0, close: (1000 * capOf(k)) / capOf(0) }));
  const service = { cache: { wrap: (_k, _t, fn) => fn() }, getIndexComponents: async () => ({ symbols: syms }), getBreadth: async () => { throw new Error("x"); }, getOhlcv: async () => ({ bars: idx }) };
  let calls = 0, fail = false;
  const fetchShares = async (list) => { calls++; if (fail) throw new Error("VNDirect down"); return new Map(list.map((s) => [s, 1e6])); };
  let t = Date.parse("2026-10-21T10:00:00Z");
  const mx = createMatrixService({ service, store, fetchShares, now: () => t, log: { warn() {} } });
  const ii = await mx.impact();
  assert.equal(ii.date, "2026-10-21");
  assert.equal(ii.check.status, "MATCH");
  assert.ok(Math.abs(ii.check.diffPp) < 1e-6);
  assert.deepEqual(ii.items.slice(0, 4).map((x) => x.industry), ["Ngân hàng", "Ngân hàng", "Ngân hàng", "Ngân hàng"]);
  const o = await mx.overview({ scope: "VNINDEX" });
  assert.deepEqual(o.links.impact.up.map((x) => x.symbol).length, 4);
  assert.ok(o.links.sectors.leaders.some((x) => x.industry === "Ngân hàng"), JSON.stringify(o.links.sectors).slice(0, 600));
  assert.ok(o.links.sectors.laggards.some((x) => x.industry === "Chứng khoán"));
  assert.deepEqual(o.riskFlags.find((f) => f.id === "RF3").related.tickers.length, 4);
  // Bản lưu KV dùng lại; VNDirect lỗi sau 24 giờ -> vẫn có số liệu (ghi cảnh báo).
  t += 25 * 3600_000; fail = true;
  const mx2 = createMatrixService({ service, store, fetchShares, now: () => t, log: { warn() {} } });
  const ii2 = await mx2.impact("2026-10-21");
  assert.equal(ii2.check.status, "MATCH");
  assert.match(ii2.sharesWarning, /VNDirect down/);
});

test("Index Impact trong phiên: ngoài giờ -> live=false; trong giờ: lần đầu 'đang tải' (không chặn), sau đó bản tính từ giá hiện tại + VN-Index snapshot", async () => {
  const store = createLocalStore({ dir: fs.mkdtempSync(path.join(os.tmpdir(), "gq-iil-")), log: { warn() {} } });
  await store.upsertMarketDaily(["A", "B", "C"].map((symbol) => ({ symbol, date: "2026-10-22", exchange: "HOSE", open: 100, high: 100, low: 100, close: 100, closeAdj: 100, refPrice: 100, volume: 1, value: 1 })));
  // Hôm nay A +10%, B 0%; mã lạ "X" (không thuộc HOSE hôm qua) bị loại khỏi mẫu.
  const fetchDay = async () => ({ rows: [
    { symbol: "A", exchange: "HOSE", close: 110, refPrice: 100 }, { symbol: "B", exchange: "HOSE", close: 100, refPrice: 100 }, { symbol: "X", exchange: "HOSE", close: 5, refPrice: 4 },
  ] });
  const service = { cache: { wrap: (_k, _t, fn) => fn() }, getOhlcv: async () => ({ bars: [{ date: "2026-10-22", close: 1000 }] }), getIndexSnapshot: async () => ({ value: 1000 * (1 + 0.1 / 3), provenance: { asOf: "2026-10-23T03:00:00Z" } }) };
  let t = Date.parse("2026-10-23T03:00:00Z"); // 10:00 VN thứ Sáu
  const mx = createMatrixService({ service, store, fetchShares: async (l) => new Map(l.map((s) => [s, 1e6])), fetchDay, now: () => t, log: { warn() {} } });
  const first = await mx.impactLive();
  assert.equal(first.live, true);
  assert.equal(first.pending, true);
  await new Promise((r) => setTimeout(r, 20));
  const doc = await mx.impactLive();
  assert.equal(doc.horizon, "intraday");
  assert.deepEqual(doc.coverage, { symbols: 3, of: 3, missing: [] }, "C chưa khớp lệnh vẫn trong mẫu số");
  assert.equal(doc.check.status, "MATCH", "A +10% × 1/3 tỷ trọng = +3,33% = 1000 -> 1033,3");
  t = Date.parse("2026-10-23T09:00:00Z"); // 16:00 VN
  assert.equal((await mx.impactLive()).live, false);
});

test("Index Impact trong phiên: SSI trả thiếu giá (0 dòng sau 13:00, đo 23/10/2026) -> không công bố, giữ bản đúng gần nhất kèm lý do", async () => {
  const store = createLocalStore({ dir: fs.mkdtempSync(path.join(os.tmpdir(), "gq-iil2-")), log: { warn() {} } });
  await store.upsertMarketDaily(["A", "B", "C", "D"].map((symbol) => ({ symbol, date: "2026-10-22", exchange: "HOSE", open: 100, high: 100, low: 100, close: 100, closeAdj: 100, refPrice: 100, volume: 1, value: 1 })));
  let full = true;
  const fetchDay = async () => ({ rows: full ? ["A", "B", "C", "D"].map((symbol) => ({ symbol, exchange: "HOSE", close: 100, refPrice: 100 })) : [] });
  const service = { cache: { wrap: (_k, _t, fn) => fn() }, getOhlcv: async () => ({ bars: [{ date: "2026-10-22", close: 1000 }] }), getIndexSnapshot: async () => ({ value: 1000, provenance: { asOf: "2026-10-23T03:00:00Z" } }) };
  let t = Date.parse("2026-10-23T03:00:00Z");
  const mx = createMatrixService({ service, store, fetchShares: async (l) => new Map(l.map((s) => [s, 1e6])), fetchDay, now: () => t, log: { warn() {}, info() {} } });
  await mx.impactLive(); await new Promise((r) => setTimeout(r, 20));
  assert.equal((await mx.impactLive()).check.status, "MATCH");
  full = false; t += 6 * 60_000; // hết hạn đệm -> làm mới, SSI trả 0 dòng
  await mx.impactLive(); await new Promise((r) => setTimeout(r, 20));
  const kept = await mx.impactLive();
  assert.equal(kept.check.status, "MATCH", "giữ bản đúng gần nhất");
  assert.match(kept.lastError, /chưa trả đủ giá trong phiên \(0\/4/);
  assert.ok(kept.ageSec >= 360);
  // Chưa có bản nào trong ngày -> báo rõ, không công bố số.
  const mx2 = createMatrixService({ service, store, fetchShares: async (l) => new Map(l.map((s) => [s, 1e6])), fetchDay, now: () => t, log: { warn() {}, info() {} } });
  await mx2.impactLive(); await new Promise((r) => setTimeout(r, 20));
  const p2 = await mx2.impactLive();
  assert.equal(p2.pending, true);
  assert.match(p2.reason, /chưa trả đủ giá/);
});
