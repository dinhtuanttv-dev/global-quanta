process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createCotucStore } from "../src/market/cotuc/cotucStore.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { CATALYST_SNAPSHOT_KEY, CATALYST_STALE_MINUTES, createCatalystRouter, readCatalystSnapshot } from "../src/routes/catalysts.js";
import { routeToJob } from "../src/market/cotuc/qmsJobs.js";

const T = Date.parse("2026-10-31T02:00:00Z");
const store = () => createCotucStore({ store: createMemoryStore(), now: () => T });

test("Chất xúc tác trên Gateway: chưa có dữ liệu -> null; có -> thêm isStale + ageMinutes", async () => {
  const s = store();
  assert.equal(await readCatalystSnapshot(s, T), null);
  await s.upsert("catkv", [{ key: CATALYST_SNAPSHOT_KEY, value: { scannedAt: "2026-10-31T01:00:00Z", sectors: [{ sector: "Thep" }] } }]);
  const fresh = await readCatalystSnapshot(s, T);
  assert.equal(fresh.ageMinutes, 60);
  assert.equal(fresh.isStale, false);
  assert.deepEqual(fresh.sectors, [{ sector: "Thep" }]);
  assert.equal((await readCatalystSnapshot(s, T + CATALYST_STALE_MINUTES * 60_000)).isStale, true);
});

test("GET /api/catalysts/latest: giữ hợp đồng cũ — { error } khi trống, 503 transient khi kho lỗi", async () => {
  const s = store();
  let broken = false;
  const app = express();
  app.use("/api/catalysts", createCatalystRouter({ getStore: () => (broken ? { list: async () => { throw new Error("hỏng"); } } : s), now: () => T }));
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}/api/catalysts/latest`;
  try {
    assert.match((await (await fetch(base)).json()).error, /Chua co du lieu/);
    await s.upsert("catkv", [{ key: CATALYST_SNAPSHOT_KEY, value: { scannedAt: "2026-10-31T01:30:00Z" } }]);
    assert.equal((await (await fetch(base)).json()).ageMinutes, 30);
    broken = true;
    const r = await fetch(base);
    assert.equal(r.status, 503);
    assert.equal((await r.json()).transient, true);
  } finally { srv.close(); }
});

test("routeToJob: /api/catalysts/scan chạy tại Gateway", () => {
  assert.deepEqual(routeToJob("/api/catalysts/scan"), { fn: "runCatalystScan", params: {} });
});
