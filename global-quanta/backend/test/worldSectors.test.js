import { test } from "node:test";
import assert from "node:assert/strict";
import { instrumentsFor, MATCH_WEIGHT, REGIONS, VN_SECTORS, WORLD_SECTOR_INSTRUMENTS } from "../src/market/worldSectors/catalog.js";
import { createWorldSectorService, horizonReturns, mergeTail, parseSpark } from "../src/market/worldSectors/worldSectorService.js";

test("catalog: mã không trùng, ICB hợp lệ, STOXX 600 khớp chuẩn, mọi ngành VN có ≥ 2 khu vực", () => {
  const syms = WORLD_SECTOR_INSTRUMENTS.map((i) => i.symbol);
  assert.equal(new Set(syms).size, syms.length);
  assert.equal(syms.length, 74);
  const icbs = new Set(VN_SECTORS.map((s) => s.icb));
  for (const i of WORLD_SECTOR_INSTRUMENTS) {
    assert.ok(REGIONS[i.region], i.symbol);
    assert.ok(["prev", "same"].includes(i.session), i.symbol);
    for (const m of i.maps) { assert.ok(icbs.has(m.icb), `${i.symbol} -> ${m.icb}`); assert.ok(MATCH_WEIGHT[m.match]); }
  }
  for (const i of WORLD_SECTOR_INSTRUMENTS.filter((x) => x.region === "EU")) assert.equal(i.maps[0].match, "exact", i.symbol);
  for (const s of VN_SECTORS) {
    const regions = new Set(instrumentsFor(s.icb).map((x) => x.region));
    assert.ok(regions.size >= 2, `${s.icb} chỉ có ${[...regions]}`);
  }
  assert.equal(instrumentsFor("8300")[0].symbol, "EXV1.DE"); // khớp chuẩn đứng đầu
  assert.equal(WORLD_SECTOR_INSTRUMENTS.find((i) => i.symbol === "XLP").maps.some((m) => m.icb === "3500"), true); // XLP = tiêu dùng thiết yếu, không phải cà phê
});

test("horizonReturns / parseSpark / mergeTail", () => {
  const pts = Array.from({ length: 130 }, (_, i) => [`d${String(i).padStart(3, "0")}`, 100 + i]);
  const r = horizonReturns(pts);
  assert.equal(r.d1, Math.round((229 / 228 - 1) * 1e6) / 1e4);
  assert.equal(r.m6, Math.round((229 / 103 - 1) * 1e6) / 1e4);
  assert.equal(horizonReturns(pts.slice(0, 3)).w1, null);
  const ts = [Date.UTC(2026, 9, 15, 20) / 1000, Date.UTC(2026, 9, 16, 20) / 1000];
  const sp = parseSpark({ spark: { result: [{ symbol: "A", response: [{ timestamp: ts, indicators: { quote: [{ close: [10, null] }] } }] }] } });
  assert.deepEqual(sp.get("A"), [["2026-10-15", 10]]);
  assert.deepEqual(mergeTail([["2026-10-14", 9], ["2026-10-15", 9.5]], [["2026-10-15", 10], ["2026-10-16", 11]]), [["2026-10-14", 9], ["2026-10-15", 10], ["2026-10-16", 11]]);
});

test("snapshot: ghép spark vào lịch sử, ngành VN từ ICB, mã lỗi được liệt kê (không bịa), cache lịch sử", async () => {
  const days = Array.from({ length: 30 }, (_, i) => Date.UTC(2026, 8, 1 + i, 20) / 1000);
  let calls = 0;
  const fetchImpl = async (url) => {
    calls++;
    if (url.includes("/spark")) {
      const syms = decodeURIComponent(/symbols=([^&]+)/.exec(url)[1]).split(",");
      return { ok: true, json: async () => ({ spark: { result: syms.map((s) => ({ symbol: s, response: [{ timestamp: [Date.UTC(2026, 9, 1, 20) / 1000], indicators: { quote: [{ close: [200] }] } }] })) } }) };
    }
    if (url.includes("KWEB")) return { ok: false, status: 404 };
    return { ok: true, json: async () => ({ chart: { result: [{ meta: {}, timestamp: days, indicators: { quote: [{ close: days.map((_, i) => 100 + i) }] } }] } }) };
  };
  const icb = Object.fromEntries(VN_SECTORS.map((s) => [s.icb, { name: s.nameVi, index: days.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), 50 + i, 10]) }]));
  const svc = createWorldSectorService({ fetchImpl, sectorIndices: async () => icb, now: () => Date.UTC(2026, 9, 2), log: { warn() {} } });
  const d = await svc.snapshot();
  const xle = d.instruments.find((i) => i.symbol === "XLE");
  assert.equal(xle.last, 200);
  assert.equal(xle.lastDate, "2026-10-01");
  const kweb = d.instruments.find((i) => i.symbol === "KWEB");
  assert.equal(kweb.error, "HTTP 404");
  assert.equal(d.vn.find((v) => v.icb === "8300").members, 10);
  assert.equal(d.vn.length, VN_SECTORS.length);
  const before = calls;
  await svc.snapshot();
  assert.equal(calls, before); // lịch sử 6 giờ + spark 5 phút trong bộ đệm
});

test("M2 scores/detail: nhãn EXPERIMENTAL, xếp hạng, 404/400, biểu đồ ≤ 4 đường, cổ phiếu thành phần theo trọng số", async () => {
  const n = 320;
  const dts = Array.from({ length: n }, (_, i) => new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10));
  const ts = dts.map((d) => Date.parse(`${d}T20:00:00Z`) / 1000);
  const fetchImpl = async (url) => {
    if (url.includes("/spark")) return { ok: true, json: async () => ({ spark: { result: [] } }) };
    const up = /XLE|EXH1|1618/.test(decodeURIComponent(url));
    return { ok: true, json: async () => ({ chart: { result: [{ meta: {}, timestamp: ts, indicators: { quote: [{ close: dts.map((_, i) => 100 + (i % 3) + (up && i === n - 1 ? 8 : 0)) }] } }] } }) };
  };
  const icb = Object.fromEntries(VN_SECTORS.map((s) => [s.icb, { name: s.nameVi, index: dts.slice(0, n - 1).map((d, i) => [d, 50 + (i % 4), 5]), rebalances: [{ date: "2025-10-01", weights: { AAA: 0.5, BBB: 0.3, CCC: 0.2 } }] }]));
  const taSeries = { get: async () => ({ priceBasis: "ADJUSTED_CUMULATIVE", bars: dts.map((d, i) => ({ date: d, close: 10 + (i % 5) })) }) };
  const svc = createWorldSectorService({ fetchImpl, sectorIndices: async () => icb, taSeries, now: () => Date.UTC(2025, 10, 20), log: { warn() {} } });
  const sc = await svc.scores();
  assert.equal(sc.evidence.label, "EXPERIMENTAL");
  assert.equal(sc.rows.length, VN_SECTORS.length);
  assert.ok(sc.rankings.short.tailwind.some((r) => r.icb === "0500"));
  assert.ok(sc.rows.find((r) => r.icb === "0500").heat.US);
  assert.equal((await svc.detail("9999")).status, 404);
  assert.equal((await svc.detail("8300", "7y")).status, 400);
  const d = (await svc.detail("8300", "1y")).body;
  assert.ok(d.chart.length >= 2 && d.chart.length <= 4);
  assert.equal(d.chart[0].key, "vn");
  assert.deepEqual(d.stocks.map((s) => s.symbol), ["AAA", "BBB", "CCC"]);
  assert.ok(d.stocks[0].beta != null);
  assert.ok(d.relations.length >= 3);
});
