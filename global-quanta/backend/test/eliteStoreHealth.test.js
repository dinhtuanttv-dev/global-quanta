process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createEliteRouter } from "../src/routes/elite.js";
import { createDecisionService } from "../src/market/elite/decisionService.js";
import { __resetStoreHealth } from "../src/market/elite/storeHealth.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";

test("kho dữ liệu lỗi (Supabase 402) -> 503 kèm nguyên nhân thật; kho bình thường mà chưa có dữ liệu -> 404", async () => {
  __resetStoreHealth();
  const broken = { getKv: async () => { throw new Error('Supabase GET market_kv lỗi HTTP 402: {"message":"exceed_egress_quota"}'); } };
  const okStore = createMemoryStore();
  let store = okStore;
  const dec = () => createDecisionService({ store, panel: { panel: async () => null }, evidence: { evidence: async () => null }, vnIndex: async () => [] });
  const app = express();
  app.use("/api/elite", createEliteRouter({ getPanel: () => ({ panel: async () => null }), getDecision: dec }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/elite`;
  try {
    const a = await fetch(`${base}/decision`);
    assert.equal(a.status, 404);
    store = broken;
    const b = await fetch(`${base}/decision`);
    assert.equal(b.status, 503);
    const body = await b.json();
    assert.equal(body.storeUnavailable, true);
    assert.match(body.error, /vượt hạn mức/);
    assert.equal((await fetch(`${base}/panel`)).status, 503, "các route khác cũng báo đúng nguyên nhân trong 15 phút");
  } finally {
    server.close();
    __resetStoreHealth();
  }
});
