// HL-RADAR P4 (20/11/2026) — lịch sử gọn danh mục Elite HL: trích đúng trường đã lưu, bỏ phiên chưa có HL, đủ n phiên có HL,
// nhớ theo phiên mới nhất, và hợp đồng GET /api/elite/hl-history.
process.env.MARKET_ALERTS_ENABLED = "false";
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { hlHistoryFromDocs, hlSession } from "../src/market/elite/hlHistory.js";
import { createDecisionService, DECISION_KV } from "../src/market/elite/decisionService.js";
import { createEliteRouter } from "../src/routes/elite.js";

const pick = (ticker, ls, o = {}) => ({ ticker, weight: 0.15, close: 95_900, hl: { rank: 1, cls: "STRONG", lsPct: ls, t1: 10, taCount: 5, rrg: 2, status: "HOLD", since: "2026-11-12", sinceRet: 0.0123456, pz: { state: "BUY_ZONE", lane: "CORE" }, ...o } });
const doc = (date, picks, extra = {}) => ({
  date, portfolio: [...picks, { ticker: "OLD", weight: 0.1 }], // mã không có hl (danh mục dòng tiền cũ) -> bỏ
  hl: { rebalance: false, cash: 0.276, invested: 0.724, rule: { exitLsPct: 60 }, changes: { added: ["VJC"], exits: [{ ticker: "HSG", code: "ls", reasonVi: "LS-v1 dưới 60", weight: 0.099 }] }, ...extra },
});

test("hlSession: trích đúng trường đã lưu, làm tròn, bỏ mã không có hl; tài liệu chưa có HL -> null", () => {
  const s = hlSession(doc("2026-11-19", [pick("VPL", 97.6103)]));
  assert.deepEqual(s.held, [{ t: "VPL", rank: 1, cls: "STRONG", w: 0.15, ls: 97.6, t1: 10, ta: 5, rrg: 2, status: "HOLD", since: "2026-11-12", ret: 0.0123, pz: "BUY_ZONE", lane: "CORE", close: 95_900 }]);
  assert.equal(s.exitLsPct, 60); assert.equal(s.cash, 0.276); assert.deepEqual(s.added, ["VJC"]);
  assert.deepEqual(s.exits, [{ t: "HSG", code: "ls", reasonVi: "LS-v1 dưới 60", w: 0.099 }]);
  assert.equal(hlSession({ date: "2026-11-05", portfolio: [] }), null);
  assert.equal(hlSession(null), null);
});

test("hlHistoryFromDocs: sắp cũ -> mới, bỏ phiên không có HL", () => {
  const h = hlHistoryFromDocs([doc("2026-11-19", [pick("A", 90)]), { date: "2026-11-11", portfolio: [] }, doc("2026-11-12", [pick("A", 80)])]);
  assert.deepEqual(h.dates, ["2026-11-12", "2026-11-19"]); assert.equal(h.version, "HL-H2"); // C6 (20/11/2026): HL-H1 -> HL-H2, thêm queue / ill (tương thích ngược)
});

function fakeStore(docs) {
  const kv = new Map([[DECISION_KV.index, { dates: docs.map((d) => d.date) }], ...docs.map((d) => [DECISION_KV.decision(d.date), d])]);
  let reads = 0;
  return { reads: () => reads, getKv: async (k) => { reads++; return kv.has(k) ? { value: kv.get(k) } : null; }, setKv: async () => {}, getMarketDailyRange: async () => [] };
}

test("dịch vụ hlHistory: n phiên có HL gần nhất (đọc lùi qua phiên chưa có HL), kẹp 2–30, nhớ theo phiên mới nhất", async () => {
  const docs = [{ date: "2026-11-10", portfolio: [] }, { date: "2026-11-11", portfolio: [] },
    ...["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-17", "2026-11-18", "2026-11-19"].map((d, i) => doc(d, [pick("VPL", 90 + i)]))];
  const store = fakeStore(docs);
  const svc = createDecisionService({ store, panel: null, evidence: null, vnIndex: null, log: { warn() {}, info() {}, error() {} } });
  const h = await svc.hlHistory(3);
  assert.deepEqual(h.dates, ["2026-11-17", "2026-11-18", "2026-11-19"]);
  assert.deepEqual(h.sessions.map((s) => s.held[0].ls), [93, 94, 95]);
  const all = await svc.hlHistory(99);
  assert.deepEqual(all.dates, ["2026-11-12", "2026-11-13", "2026-11-14", "2026-11-17", "2026-11-18", "2026-11-19"]);
  const before = store.reads(); await svc.hlHistory(99);
  assert.equal(store.reads() - before, 1, "lần hai chỉ đọc chỉ mục (đã nhớ)");
  assert.equal((await svc.hlHistory("x")).dates.length, 6); // mặc định 10 -> có 6
  assert.equal((await svc.hlHistory(1)).dates.length, 2); // kẹp tối thiểu 2
});

test("GET /api/elite/hl-history: 200 + Cache-Control; chưa có dịch vụ -> 503/404 có lời nhắn", async () => {
  const h = hlHistoryFromDocs([doc("2026-11-19", [pick("VPL", 97.6)])]);
  const seen = [];
  const app = express();
  app.use("/api/elite", createEliteRouter({ getPanel: () => null, getDecision: () => ({ hlHistory: async (d) => { seen.push(d); return h; } }) }));
  const srv = app.listen(0); const port = srv.address().port;
  try {
    const r = await fetch(`http://127.0.0.1:${port}/api/elite/hl-history?days=5`);
    assert.equal(r.status, 200); assert.match(r.headers.get("cache-control") ?? "", /max-age=300/);
    const j = await r.json(); assert.deepEqual(j.dates, ["2026-11-19"]); assert.equal(j.sessions[0].held[0].t, "VPL"); assert.deepEqual(seen, ["5"]);
  } finally { srv.close(); }
  const app2 = express();
  app2.use("/api/elite", createEliteRouter({ getPanel: () => null, getDecision: () => ({ hlHistory: async () => null }) }));
  const srv2 = app2.listen(0);
  try {
    const r = await fetch(`http://127.0.0.1:${srv2.address().port}/api/elite/hl-history`);
    assert.ok(r.status >= 400); assert.match((await r.json()).error, /Chưa có lịch sử danh mục Elite HL/);
  } finally { srv2.close(); }
});

test("HL-H2 (buồng lái C6): mỗi phiên có queue [{ t, code }] và ill [mã]; tài liệu thiếu hàng chờ -> mảng rỗng; trường cũ không đổi", () => {
  const withQ = doc("2026-11-20", [pick("VPL", 98)], { queue: [{ ticker: "VPI", code: "wait", reasonVi: "Chờ phiên cân bằng", hlRank: 2 }, { ticker: "CDC", code: "full" }], queueIlliquid: [{ ticker: "HDA", code: "illiquid" }] });
  const s = hlSession(withQ);
  assert.deepEqual(s.queue, [{ t: "VPI", code: "wait" }, { t: "CDC", code: "full" }]);
  assert.deepEqual(s.ill, ["HDA"]);
  assert.deepEqual(Object.keys(s), ["date", "rebalance", "frozen", "cash", "invested", "exitLsPct", "held", "added", "exits", "queue", "ill"]);
  const bare = hlSession(doc("2026-11-19", [pick("VPL", 97)]));
  assert.deepEqual([bare.queue, bare.ill], [[], []]);
});
