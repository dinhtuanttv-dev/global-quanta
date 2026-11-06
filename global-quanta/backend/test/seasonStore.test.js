import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { itemsFromRow, oracle, projectAPath, readSeasonItems, setSeasonReader, stableJson } from "../src/market/fundamentals/seasonStore.js";
import { createSeasonalityBundle } from "../src/market/fundamentals/seasonalityBundle.js";
import { createSeasonMap } from "../src/market/fundamentals/seasonMap.js";

const row = { ticker: "AAA", calendar: { ticker: "AAA", quarters: [{ quarter: 4, typicalAnnounceMonth: 1 }], asOf: "2026-11-05T00:00:00Z" },
  stats: { 1: { selectedWindowId: null, windows: [{ id: "e1", label: "E1", nEvents: 6, netExpectancy: 0.01, netExpectancyLcb: -0.01, fdrQValue: 0.15, winRate: 0.5 }] } },
  paths: { 1: { eventPaths: [{ exDate: "2025-04-20" }] } } };

test("SD-v1 hợp đồng 3 route Project A: 200 + body, 404 khi thiếu cột / thiếu quý / thiếu mã", () => {
  const it = itemsFromRow(row);
  assert.equal(Object.keys(it).length, 9);
  assert.equal(it.calendar.status, 200);
  assert.deepEqual(it["stats:1"].body, row.stats[1]);
  assert.equal(it["stats:2"].status, 404);
  assert.equal(it["paths:3"].status, 404);
  assert.ok(Object.values(itemsFromRow(null)).every((x) => x.status === 404));
  assert.equal(projectAPath("FPT", "stats:3"), "/api/cotuc/earnings-cycle-stats?ticker=FPT&quarter=3");
  assert.equal(projectAPath("FPT", "calendar"), "/api/cotuc/annual-earnings-calendar?ticker=FPT");
  assert.equal(stableJson({ b: 1, a: [1, { d: 2, c: 3 }] }), stableJson({ a: [1, { c: 3, d: 2 }], b: 1 }));
});

test("SD-v1 oracle: khớp tuyệt đối, phát hiện lệch nội dung và lệch trạng thái", async () => {
  const read = async () => itemsFromRow(row);
  const same = async (url) => {
    const u = new URL(url), t = u.searchParams.get("ticker"), q = u.searchParams.get("quarter");
    const k = u.pathname.includes("calendar") ? "calendar" : `${u.pathname.includes("stats") ? "stats" : "paths"}:${q}`;
    const it = itemsFromRow(row)[k];
    return it.status === 404 ? { ok: false, status: 404 } : { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(it.body)) };
  };
  const ok = await oracle({ tickers: ["AAA"], base: "https://a", fetchImpl: same, read });
  assert.equal(ok.items, 9); assert.equal(ok.equal, 9); assert.equal(ok.mismatched, 0);
  const off = await oracle({ tickers: ["AAA"], base: "https://a", read, fetchImpl: async (url) => (url.includes("quarter=1") && url.includes("stats") ? { ok: true, status: 200, json: async () => ({ ...row.stats[1], selectedWindowId: "e1" }) } : same(url)) });
  assert.equal(off.mismatched, 1); assert.equal(off.diffs[0].k, "stats:1");
  const gone = await oracle({ tickers: ["AAA"], base: "https://a", read, fetchImpl: async (url) => (url.includes("calendar") ? { ok: false, status: 404 } : same(url)) });
  assert.equal(gone.mismatched, 1); assert.equal(gone.diffs[0].projectA, 404);
});

test("SD-v1 gói S7 + bản đồ S2 đọc kho: 0 lần gọi Project A; kho lỗi -> lùi về Project A", async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); return { ok: true, status: 200, json: async () => ({ selectedWindowId: null, windows: [] }) }; };
  setSeasonReader(async (t) => (t === "AAA" ? row : null));
  try {
    const b = createSeasonalityBundle({ fetchImpl });
    const g = await b.get("AAA");
    assert.equal(g.origin, "store"); assert.equal(calls.length, 0);
    assert.deepEqual(await readSeasonItems("ZZZ"), itemsFromRow(null));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sd-"));
    fs.writeFileSync(path.join(dir, "AAA.json.gz"), zlib.gzipSync(JSON.stringify({ ticker: "AAA", quarters: [] })));
    const sm = createSeasonMap({ dir, fetchImpl, log: { log() {}, warn() {} } });
    await sm.build();
    assert.equal(calls.length, 0);
    assert.equal(sm.map().source, "gateway-store");
    assert.equal(sm.map().rows.AAA.q[1].status, "WATCH");
    assert.equal(sm.map().rows.AAA.months[4], 1);
    fs.rmSync(dir, { recursive: true, force: true });
    setSeasonReader(async () => { throw new Error("hỏng"); });
    const b2 = createSeasonalityBundle({ fetchImpl, log: { warn() {} } });
    assert.equal((await b2.get("AAA")).origin, "projectA");
    assert.equal(calls.length, 9);
  } finally { setSeasonReader(null); }
});
