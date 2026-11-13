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

// F01 (13/11/2026): danh mục chính thức là Elite HL -> công cụ phải mô tả đúng loại danh mục, tiền mặt, K0; thiếu số -> null (không phải 0).
test("E5 elite_decision với tài liệu E4-HL: portfolioKind, tiền mặt, lớp hợp lưu, K0, không gán ngữ nghĩa ERC; mã vắng dữ liệu -> null", async () => {
  const hlDoc = {
    ...decision, version: "E4-HL v1", construction: { method: "hl-g2r", retained: 1, previous: 1, turnover: 0.05 },
    portfolio: [
      { ticker: "FPT", sectorKey: "9500", weight: 0.1, Z: 0.4, alpha5Pct: 0.02, pOutperform: 0.502, close: 100000, stop: 91000, target: 113500, retained: true, riskContribution: 0.6,
        hl: { rank: 1, cls: "STRONG", t1: 9, t2: 1, t3: 3, lsPct: 92.4, taCount: 4, rrg: 2, status: "HOLD", since: "2026-11-09", exitBufferLs: 32.4, warnings: [], sinceRet: 0.031 } },
      // Mã đang giữ nhưng vắng khỏi bảng phiên này (bộ đếm vắng mặt): mọi số điểm / giá đều null.
      { ticker: "ABC", sectorKey: null, weight: 0.08, Z: null, alpha5Pct: null, pOutperform: null, close: null, stop: null, target: null, retained: true, riskContribution: 0.4,
        hl: { rank: 9999, cls: "NOT_T1", t1: 0, t2: 0, t3: 0, lsPct: null, taCount: 0, rrg: null, status: "HOLD", since: "2026-11-02", exitBufferLs: null, warnings: ["Không có dữ liệu của mã phiên này (lần 1/2) — chưa ra"] } },
    ],
    flowPortfolio: [{ ticker: "ORS", weight: 0.14, Z: 2.25 }], flowLedgerSummary: decision.ledgerSummary,
    hl: {
      version: "E4-HL v1 (G2r, 12/11/2026)", invested: 0.18, cash: 0.82, rebalance: false, dataGuard: { frozen: false, reasonsVi: [] },
      market: { regime: "WEAK", regimeVi: "Thị trường yếu", breadth: 41, guard: false },
      rule: { slots: 10, maxPerSector: 3, sectorCap: 0.3, minAdvBn: 5, exitLsPct: 60, warnLsPct: 70, exitTaMin: 1, costBuy: 0.002, costSell: 0.0025, bandSessions: 20 },
      changes: { added: [], kept: 2, exits: [{ ticker: "HPG", weight: 0.09, reasonVi: "Ngành rơi vào góc Tụt hậu trên RRG" }], turnover: 0.045, costEst: 0.0002 },
      queue: [{ ticker: "MWG", hlRank: 3, reasonVi: "Chờ phiên cân bằng đầu tuần kế tiếp" }], against: [{ ticker: "VCB", rrgVi: "Suy yếu" }],
      k0: { noteVi: "Mô phỏng khám phá (K0)… NGANG thị trường… (t ≈ 0)." }, labelVi: "THĂM DÒ — quy tắc chọn do chủ dự án đặt",
    },
  };
  const t = createEliteChatTools({ decision: async () => hlDoc, panel: async () => panel, evidence: async () => evidence });
  const d = (await t.run("elite_decision", {})).data;
  assert.equal(d.portfolioKind, "ELITE_HL");
  assert.equal(d.hl.cashPct, 82);
  assert.equal(d.hl.investedPct, 18);
  assert.match(d.hl.k0NoteVi, /NGANG thị trường/);
  assert.match(d.labelVi, /THĂM DÒ/);
  assert.doesNotMatch(d.construction.method, /ERC|nghịch biến động/);
  assert.match(d.construction.method, /không cân lại/);
  const fpt = d.portfolio[0];
  assert.deepEqual([fpt.hlClass, fpt.status, fpt.lsPercentile, fpt.taModelsPassing, fpt.sectorRrg, fpt.exitBufferLsPoints, fpt.returnSinceEntryPct], ["Hợp lưu mạnh", "Giữ", 92, 4, "Dẫn dắt", 32, 3.1]);
  const abc = d.portfolio[1];
  assert.deepEqual([abc.stop, abc.target, abc.close, abc.Z, abc.pOutperformPct, abc.lsPercentile], [null, null, null, null, null, null]);
  assert.equal(abc.warnings.length, 1);
  assert.deepEqual(d.hl.changes.exits, [{ ticker: "HPG", weightPct: 9, reasonVi: "Ngành rơi vào góc Tụt hậu trên RRG" }]);
  assert.equal(d.hl.queue[0].reasonVi, "Chờ phiên cân bằng đầu tuần kế tiếp");
  assert.deepEqual(d.flowPortfolio, [{ ticker: "ORS", weightPct: 14, Z: 2.25 }]);
  assert.match(d.weightedSignalsNoteVi, /không chọn mã theo Điểm Elite/);
  // Tài liệu cũ (không có hl) giữ nguyên hình dạng và nhãn.
  assert.equal((await tools.run("elite_decision", {})).data.portfolioKind, "ELITE_FLOW");
  assert.match(tools.specs().guidelines, /portfolioKind/);
  assert.doesNotMatch(ELITE_TOOL_SPECS[1].description, /21 tín hiệu/);
});
