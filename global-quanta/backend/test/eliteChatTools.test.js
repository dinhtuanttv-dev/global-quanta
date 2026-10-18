process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createEliteChatTools, ELITE_TOOL_SPECS } from "../src/market/elite/chatTools.js";
import { createEliteRouter } from "../src/routes/elite.js";

const decision = {
  date: "2026-10-16", version: "E3-v2", icComb: 0.0146, universe: { panel: 3, eligible: 2 },
  ledgerSummary: { label: "EXPERIMENTAL", labelVi: "THĂM DÒ", criteria: { sessions: 1 }, horizons: { 5: { n: 0 }, 10: { n: 0 } } },
  weights: [{ id: "stealth20", labelVi: "Stealth 20", tier: "A", icMeas: 0.0159, n: 215, icPost: 0.0168, w: 1 }],
  portfolio: [{ ticker: "ORS", sectorKey: "8700", weight: 0.14, Z: 2.25, alpha5Pct: 0.14, pOutperform: 0.513, close: 13500, stop: 12896.4, target: 14406.2 }],
  scores: [{ ticker: "ORS", rank: 1, Z: 2.25, alpha5Pct: 0.14, pOutperform: 0.513, eligible: true, reason: null, contributions: [{ id: "stealth20", contribution: 1.2 }] }],
};
const panel = {
  date: "2026-10-16", missingSources: ["cotuc"],
  signals: [{ id: "stealth20", tab: "Siêu quét AI", labelVi: "Stealth 20", tier: "A" }, { id: "smart_score", tab: "Siêu quét AI", labelVi: "Smart Score", tier: "C" }],
  rows: [{ ticker: "ORS", icb: { l2: "8700" }, values: { stealth20: 1.74, smart_score: 47.8 } }],
};
const evidence = { version: "E2-v1", calendarLast: "2026-10-16", counts: { A: 3, B: 2, C: 16 }, signals: [{ id: "stealth20", labelVi: "Stealth 20", tab: "x", priorTier: "A", tier: "A", reasonVi: "Giữ", source: "hồi cứu", mainH: 5, byH: { 5: { n: 215, mean: 0.0159, t: 2.0, q: 0.2, stable: true } } }, { id: "smart_score", tier: "C", byH: {} }] };
const tools = createEliteChatTools({ decision: async () => decision, panel: async () => panel, evidence: async () => evidence });

test("E5 elite_*: quyết định kèm nhãn, hồ sơ mã đủ tín hiệu + bậc + đóng góp, bằng chứng lọc theo id, lỗi rõ ràng", async () => {
  const d = await tools.run("elite_decision", {});
  assert.equal(d.ok, true);
  assert.equal(d.data.label, "EXPERIMENTAL");
  assert.deepEqual(d.data.portfolio[0], { ticker: "ORS", sectorIcb: "8700", weightPct: 14, Z: 2.25, alpha5Pct: 0.14, pOutperformPct: 51.3, close: 13500, stop: 12896, target: 14406, riskContributionPct: null, retainedFromPrevious: false });
  const t = await tools.run("elite_ticker", { ticker: "ors" });
  assert.equal(t.data.elite.inPortfolio, true);
  assert.deepEqual(t.data.signals.map((s) => [s.id, s.tier, s.contribution]), [["stealth20", "A", 1.2], ["smart_score", "C", null]]);
  assert.equal((await tools.run("elite_ticker", { ticker: "VNINDEX" })).ok, false);
  assert.equal((await tools.run("elite_ticker", {})).error, "Thiếu tham số ticker");
  const e = await tools.run("elite_evidence", { ids: ["stealth20"] });
  assert.equal(e.data.signals.length, 1);
  assert.equal(e.data.signals[0].byH[5].ic, 0.0159);
  assert.match((await tools.run("elite_x", {})).error, /Không có công cụ/);
  assert.equal((await tools.run("elite_decision", { foo: 1 })).ok, false);
  assert.match(tools.specs().guidelines, /THĂM DÒ/);
  assert.equal(tools.specs().anthropic.length, ELITE_TOOL_SPECS.length);
});

test("E5 route /api/elite/tools", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/elite", createEliteRouter({ getPanel: () => ({ panel: async () => panel }), getChatTools: () => tools }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/elite`;
  try {
    assert.equal((await (await fetch(`${base}/tools`)).json()).anthropic.length, 3);
    const r = await (await fetch(`${base}/tools/elite_ticker`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker: "ORS" }) })).json();
    assert.equal(r.data.ticker, "ORS");
  } finally {
    server.close();
  }
});
