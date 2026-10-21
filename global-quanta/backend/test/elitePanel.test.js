process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { buildSignalRows, icbFor, SIGNAL_SPECS } from "../src/market/elite/signalRegistry.js";
import { createElitePanelService, ELITE_KV, panelDue } from "../src/market/elite/elitePanel.js";
import { createEliteRouter } from "../src/routes/elite.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { KV as SCANNER_KV } from "../src/market/scanner/scannerJobs.js";
import { ALPHA_KV } from "../src/market/alpha/alphaService.js";

const scanner = (date = "2026-10-16") => ({
  dataAsOf: date,
  items: [
    { ticker: "HPG", smartScore: 81.2, rsRating: 70, taScore: 60, faScore: 55, riskAdjustedMomentum: 1.2, foreignNetBuyFlag: true, industry: "Thép" },
    { ticker: "fpt", smartScore: 42.4, rsRating: 29.8, taScore: 40, faScore: 70, riskAdjustedMomentum: -1.8, foreignNetBuyFlag: false },
    { ticker: "VIC", smartScore: null, rsRating: 95, foreignNetBuyFlag: null },
  ],
});
const sources = (over = {}) => ({
  scanner: scanner(),
  features: new Map([["HPG", { stealth20: 1.8, stealth5: 0.4, netIntent: 0.2, mom5Atr: 0.9, logRvol: 0.3 }]]),
  top20: { top20: [{ ticker: "VIC", score: 0.913 }], others: [{ ticker: "HPG", score: 0.12 }] },
  strategies: {
    sepa: { results: [{ ticker: "HPG", status: "BREAKOUT", list: "SẴN SÀNG MUA" }, { ticker: "FPT", status: "FORMING", list: "THEO DÕI" }] },
    patterns: { results: [{ ticker: "FPT", dir: "bear", status: "CONFIRMED" }] },
    convergence: { results: [{ ticker: "HPG", side: "buy", grade: "A" }] },
    "base-breakout": null,
  },
  wsStrategy: { short: { rows: [{ icb: "1700", alphaBps: 2.1 }, { icb: "1750", alphaBps: 3.47 }, { icb: "9500", alphaBps: -5.29 }] } },
  rrg: { sectors: [{ code: "1700", liveQuadrant: "IMPROVING" }, { code: "9500", quadrant: "LAGGING" }] },
  taxonomy: { symbols: { HPG: { l1: "1000", l2: "1700", l3: "1750" }, FPT: { l1: "9000", l2: "9500" }, VIC: { l2: "8600" } } },
  catalyst: { tickerImpacts: { FPT: { direction: "benefit", compositeScore: 24 }, HPG: { direction: "none", compositeScore: 0 } } },
  cotuc: null,
  ...over,
});

test("E1 buildSignalRows: chuẩn hoá đúng chiều, null khi không có dữ liệu (không điền 0 giả), ghi nguồn thiếu", () => {
  const { rows, coverage, missingSources } = buildSignalRows(sources());
  assert.deepEqual(rows.map((r) => r.ticker), ["FPT", "HPG", "VIC"]);
  const hpg = rows.find((r) => r.ticker === "HPG").values;
  assert.equal(hpg.ws_sector_alpha, 3.47, "ngành cụ thể nhất (l3 1750) được ưu tiên");
  assert.equal(hpg.stealth20, 1.8);
  assert.equal(hpg.sepa_s2, 1);
  assert.equal(hpg.sepa_state, 2);
  assert.equal(hpg.convergence, 3);
  assert.equal(hpg.rrg_quadrant, 1, "RRG theo ngành có trong tài liệu (1700)");
  assert.equal(hpg.foreign_net_buy, 1);
  assert.equal(hpg.catalyst_impact, 0);
  assert.equal(hpg.base_breakout, null, "bộ lọc không có tài liệu -> null, không phải 0");
  const fpt = rows.find((r) => r.ticker === "FPT").values;
  assert.equal(fpt.ws_sector_alpha, -5.29);
  assert.equal(fpt.pattern_state, -1, "mô hình giảm -> âm");
  assert.equal(fpt.sepa_s2, 0);
  assert.equal(fpt.stealth20, null, "không có đặc trưng dòng tiền -> null");
  assert.equal(fpt.catalyst_impact, 24);
  assert.equal(fpt.top20_alpha, null);
  const vic = rows.find((r) => r.ticker === "VIC").values;
  assert.equal(vic.smart_score, null);
  assert.equal(vic.top20_alpha, 0.913);
  assert.equal(vic.ws_sector_alpha, null, "ngành 8600 không có trong chiến lược -> null");
  assert.equal(vic.cotuc_decision, null);
  assert.equal(coverage.smart_score, 2);
  assert.ok(missingSources.includes("strategies:base-breakout"));
  assert.ok(missingSources.includes("cotuc"));
  assert.equal(Object.keys(hpg).length, SIGNAL_SPECS.length, "mỗi dòng có đủ mọi tín hiệu trong sổ");
  assert.ok(SIGNAL_SPECS.every((s) => ["A", "B", "C"].includes(s.tier) && s.evidenceVi));
});

test("E1 buildSignalRows: mọi nguồn lỗi vẫn trả bảng rỗng an toàn", () => {
  const out = buildSignalRows({});
  assert.deepEqual(out.rows, []);
  assert.ok(out.missingSources.includes("scanner"));
  assert.equal(icbFor(null, "X", new Set()), null);
});

function fakeDeps(store, { calls = { qms: 0 } } = {}) {
  return {
    store,
    wsStrategy: async () => sources().wsStrategy,
    rrgDoc: async () => sources().rrg,
    taxonomy: async () => sources().taxonomy,
    fetchImpl: async (url) => {
      calls.qms++;
      if (url.endsWith("/api/catalysts/latest")) return new Response(JSON.stringify({ scannedAt: "2026-10-10T22:56:25Z", isStale: true, tickerImpacts: { FPT: { direction: "harm", compositeScore: 10 } } }));
      return new Response("{}", { status: 500 });
    },
    projectABase: "https://pa.test",
    now: () => Date.parse("2026-10-16T10:30:00Z"),
    log: { warn() {} },
  };
}

test("E1 dịch vụ: dựng + lưu theo ngày (point-in-time), không dựng lại cùng phiên, force ghi đè; Project A lỗi -> cột null", async () => {
  const store = createMemoryStore();
  await store.setKv(SCANNER_KV.latest, scanner());
  await store.setKv(ALPHA_KV.top20, sources().top20);
  await store.setKv("strategies:sepa", sources().strategies.sepa);
  await store.upsertRows("market_flow_daily", [{ symbol: "HPG", trading_date: "2026-10-16", method: "x", features: { stealth20: 1.8, stealth5: 0.4 } }], "symbol,trading_date");
  const calls = { qms: 0 };
  const svc = createElitePanelService(fakeDeps(store, { calls }));
  const doc = await svc.build();
  assert.equal(doc.date, "2026-10-16");
  assert.equal(doc.universe, 3);
  assert.equal(doc.rows.find((r) => r.ticker === "HPG").values.stealth20, 1.8);
  assert.equal(doc.rows.find((r) => r.ticker === "FPT").values.catalyst_impact, -10);
  assert.equal(doc.asOf.catalystStale, true);
  assert.ok(doc.missingSources.includes("cotuc"));
  assert.ok(doc.missingSources.includes("strategies:patterns"));
  assert.deepEqual((await store.getKv(ELITE_KV.index)).value.dates, ["2026-10-16"]);

  const before = calls.qms;
  const again = await svc.build();
  assert.equal(again.builtAt, doc.builtAt, "cùng phiên -> giữ nguyên bản đã ghi");
  assert.equal(calls.qms, before, "đã có bảng cho phiên -> không gọi lại nguồn");
  const forced = await svc.build({ force: true });
  assert.equal(forced.date, "2026-10-16");
  assert.ok(calls.qms > before);

  await store.setKv(SCANNER_KV.latest, scanner("2026-10-17"));
  await svc.build();
  assert.deepEqual(await svc.dates(), ["2026-10-16", "2026-10-17"]);
  assert.equal((await svc.panel("2026-10-16")).date, "2026-10-16");
  assert.equal((await svc.panel()).date, "2026-10-17");
});

test("E1 panelDue: chỉ từ 17:00 giờ VN của ngày giao dịch", () => {
  const trading = () => true;
  assert.equal(panelDue(Date.parse("2026-10-16T09:59:00Z"), trading), false);
  assert.equal(panelDue(Date.parse("2026-10-16T10:00:00Z"), trading), true);
  assert.equal(panelDue(Date.parse("2026-10-16T12:00:00Z"), () => false), false);
});

test("E1 route: danh mục tín hiệu, bảng phiên, tra một mã, admin cần token", async () => {
  const store = createMemoryStore();
  const svc = createElitePanelService(fakeDeps(store));
  const app = express();
  app.use("/api/elite", createEliteRouter({ getPanel: () => svc, adminToken: () => "tok" }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/elite`;
  try {
    assert.equal((await (await fetch(`${base}/signals`)).json()).signals.length, SIGNAL_SPECS.length);
    assert.equal((await fetch(`${base}/panel`)).status, 404);
    assert.equal((await fetch(`${base}/admin/build`, { method: "POST" })).status, 401);
    await store.setKv(SCANNER_KV.latest, scanner());
    const built = await fetch(`${base}/admin/build`, { method: "POST", headers: { authorization: "Bearer tok" } });
    assert.equal(built.status, 200);
    assert.equal((await built.json()).universe, 3);
    const p = await (await fetch(`${base}/panel`)).json();
    assert.equal(p.rows.length, 3);
    const one = await (await fetch(`${base}/panel/hpg`)).json();
    assert.equal(one.ticker, "HPG");
    assert.equal(one.values.ws_sector_alpha, 3.47);
    assert.equal((await fetch(`${base}/panel/ZZZ`)).status, 404);
    assert.equal((await fetch(`${base}/panel/a!`)).status, 400);
    assert.equal((await fetch(`${base}/panel?date=2026-01-01`)).status, 404);
  } finally {
    server.close();
  }
});

test("T7 Cấu trúc MTF: giai đoạn / bảng kiểm / kết luận vào sổ tín hiệu (bậc C — chỉ đo IC); thiếu nguồn -> null + ghi nguồn thiếu", () => {
  const structure = { asOf: "2026-10-16", rows: [{ t: "HPG", st: "UP", sc: 6, v: "MUA" }, { t: "FPT", st: "DOWN", sc: 1, v: "BÁN" }] };
  const { rows, missingSources } = buildSignalRows(sources({ structure }));
  const by = Object.fromEntries(rows.map((r) => [r.ticker, r.values]));
  assert.deepEqual([by.HPG.structure_stage, by.HPG.structure_score, by.HPG.structure_verdict], [2, 6, 2]);
  assert.deepEqual([by.FPT.structure_stage, by.FPT.structure_score, by.FPT.structure_verdict], [-2, 1, -2]);
  assert.equal(by.VIC.structure_stage, null);
  assert.ok(!missingSources.includes("structure"));
  for (const id of ["structure_stage", "structure_score", "structure_verdict"]) assert.equal(SIGNAL_SPECS.find((s) => s.id === id)?.tier, "C");
  const none = buildSignalRows(sources());
  assert.ok(none.missingSources.includes("structure"));
  assert.equal(none.rows[0].values.structure_stage, null);
});
