// D4 (19/11/2026) — khối "Tác động lên cổ phiếu": hợp đồng JSON của GET /api/elite/impact/:ticker, dấu từ sổ bằng chứng, aggregate null.
process.env.MARKET_ALERTS_ENABLED = "false";
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { buildImpactProfile, createImpactProfile, ER_R1_FIRST_VERDICT } from "../src/market/elite/impactProfile.js";
import { evidenceRegistry, IMPACT_EVIDENCE, IMPACT_SEALS, EVIDENCE_REGISTRY } from "../src/market/elite/evidenceRegistry.js";
import { createEliteRouter } from "../src/routes/elite.js";

const NOW = Date.parse("2026-11-19T08:15:00Z");
const fa = { earnings: { available: true, quarter: "2026Q3", published: "2026-10-28", nowcast: { growth: 0.18, est: 1.2e13, lo: 1.0e13, hi: 1.4e13, cumShare: 0.74 }, surprise: { sueCore: 1.3 } } };
const commodities = { items: [
  { id: "IRON_ORE", nameVi: "Quặng sắt 62% Fe", unit: "USD/tấn", available: true, value: 90.7, period: "2026-11-18", change: { pct: 0.15, basisVi: "so với phiên trước" }, vnTickers: ["HPG", "HSG"], transmission: { speed: "slow" }, proxy: false },
  { id: "STEEL_ASIA", nameVi: "Giá thép châu Á (đại diện)", unit: "CNY/cổ phiếu", available: true, value: 6.3, period: "2026-11-19", change: { pct: -0.32, basisVi: "so với phiên trước" }, vnTickers: ["HPG"], transmission: { speed: "slow" }, proxy: true },
  { id: "BRENT", nameVi: "Dầu Brent", available: true, value: 71, period: "2026-11-18", change: { pct: 1 }, vnTickers: ["GAS"], transmission: { speed: "immediate" } },
  { id: "COTTON", nameVi: "Bông", available: true, value: 64, period: "2026-11-18", change: { pct: -0.5 }, vnTickers: ["TNG"], transmission: { speed: "slow" } },
] };
const ws = { ok: true, data: { ticker: "HPG", sector: { icb: "1750", nameVi: "Kim loại công nghiệp" }, sectorShort: { stance: "overweight", alphaBps: 4.2, pOutperform: 0.53 },
  sectorMedium: { stance: "adverse", ws3m: -0.8, rrg: "lagging" }, stockExposure: { weightPct: 41.5, betaPct: 0.62, corr: 0.31 }, drivers: [], note: null } };
const catalyst = { ok: true, data: { scannedAt: "2026-11-19T07:00:00Z", isStale: false, impact: { direction: "benefit", compositeScore: 2.1 }, found: true,
  cards: [{ catalyst: "Giá thép tăng", direction: "benefit", corroboration: 2, priceInStatus: "not_reflected" }, { catalyst: "Thuế chống bán phá giá", direction: "benefit" }, { catalyst: "Tồn kho", direction: "harm" }] } };
const x6 = { signals: 191, clusters: 175, matured5: 153, matured20: 0, minN: 30, estimatedReadyOn: "2026-11-30" };
const radar = { events: [
  { eventId: "e1", title: "HPG ký hợp đồng", eventLabel: "Hợp đồng", severity: "high", sentiment: 0.4, corroborationCount: 3, sourceAuthority: "configured_official_feed", publishedAt: "2026-11-18T03:00:00Z" },
  { eventId: "e2", title: "Tin cũ", eventLabel: "Khác", sentiment: -0.2, publishedAt: "2026-09-01T03:00:00Z" },
] };
const dilution = { asOf: "2026-11-19", phase: { phase: "NONE" } };

test("đủ nguồn: 7 lớp, mỗi lớp có dấu lấy từ sổ bằng chứng, aggregate null", () => {
  const d = buildImpactProfile({ ticker: "HPG", nowMs: NOW, fa, commodities, ws, catalyst, x6, radar, dilution });
  assert.equal(d.aggregate, null);
  assert.deepEqual(d.layers.map((l) => l.id), ["earnings", "commodity", "world_short", "world_medium", "catalyst", "events", "dilution"]);
  const byId = Object.fromEntries(d.layers.map((l) => [l.id, l]));
  const seals = new Map(IMPACT_EVIDENCE.map((e) => [e.id, e.seal]));
  for (const l of d.layers) {
    assert.ok(IMPACT_SEALS.includes(l.seal), `${l.id} có dấu hợp lệ`);
    assert.equal(l.seal, seals.get(l.evidenceId), `${l.id}: dấu đúng sổ`);
  }
  assert.equal(byId.earnings.seal, "THĂM DÒ"); assert.equal(byId.earnings.value.nowcastYoY, 0.18); assert.equal(byId.earnings.direction, 1);
  assert.equal(byId.commodity.evidenceId, "CT-r1"); assert.equal(byId.commodity.seal, "CHƯA KIỂM ĐỊNH"); assert.equal(byId.commodity.direction, null);
  assert.deepEqual(byId.commodity.value.items.map((i) => i.id), ["IRON_ORE", "STEEL_ASIA"]);
  assert.equal(byId.world_short.seal, "MỘT PHẦN"); assert.equal(byId.world_short.direction, 1);
  assert.equal(byId.world_medium.seal, "KHÔNG ĐẠT"); assert.equal(byId.world_medium.direction, -1);
  assert.equal(byId.catalyst.seal, "ĐANG TÍCH LUỸ"); assert.deepEqual([byId.catalyst.value.benefit, byId.catalyst.value.harm], [2, 1]);
  assert.deepEqual(byId.catalyst.progress, { n: 0, need: 30, signals: 191, clusters: 175, estimatedReadyOn: "2026-11-30" });
  assert.equal(byId.events.value.count, 1, "chỉ tin trong 30 ngày"); assert.equal(byId.events.progress.earliestVerdict, ER_R1_FIRST_VERDICT); assert.equal(byId.events.direction, null);
  assert.equal(byId.dilution.seal, "KHÔNG ĐẠT"); assert.equal(byId.dilution.value.phase, "NONE");
});

test("chọn kiểm định hàng hoá theo mã: bông -> CT-r2, dầu -> MÔ TẢ, mã không gắn hàng hoá -> lớp trống", () => {
  const of = (t) => buildImpactProfile({ ticker: t, nowMs: NOW, commodities }).layers.find((l) => l.id === "commodity");
  assert.equal(of("TNG").evidenceId, "CT-r2");
  assert.equal(of("GAS").evidenceId, "CM-x"); assert.equal(of("GAS").seal, "MÔ TẢ");
  const none = of("FPT"); assert.equal(none.available, false); assert.equal(none.none, true); assert.equal(none.direction, null);
});

test("thiếu nguồn: lớp vẫn có dấu, có lý do, không có hướng; X6-F vẫn mang tiến độ", () => {
  const d = buildImpactProfile({ ticker: "ABC", nowMs: NOW, x6, ws: { ok: false, error: "Không tìm thấy mã ABC trong phân ngành ICB." }, catalyst: null });
  for (const l of d.layers) { assert.equal(l.direction, null); assert.ok(l.seal); if (!l.available) assert.ok(l.reasonVi, `${l.id} có lý do`); }
  assert.match(d.layers.find((l) => l.id === "world_short").reasonVi, /ICB/);
  assert.equal(d.layers.find((l) => l.id === "catalyst").progress.need, 30);
});

test("sổ bằng chứng: lớp Elite HL không đổi, thêm impact[] (chỉ thêm trường)", () => {
  const r = evidenceRegistry();
  assert.equal(r.entries.length, EVIDENCE_REGISTRY.length);
  assert.deepEqual(r.entries.map((e) => e.id), ["HL", "PZ", "PX", "LQ", "CG", "FA"]);
  assert.ok(r.impact.every((e) => IMPACT_SEALS.includes(e.seal) && e.detail && e.src));
  assert.ok(!r.impact.some((e) => e.seal === "ĐẠT"), "chưa lớp tác động nào ĐẠT ở 19/11/2026");
});

test("dịch vụ: nguồn lỗi / treo không làm hỏng route; bộ nhớ đệm theo mã", async () => {
  let calls = 0;
  const svc = createImpactProfile({ now: () => NOW, timeoutMs: 50, log: { warn() {} }, sources: {
    fa: async () => { calls++; return fa; }, commodities: async () => { throw new Error("yahoo down"); },
    ws: () => new Promise(() => {}), catalyst: async () => catalyst, x6: async () => x6, radar: async () => radar, dilution: async () => dilution,
  } });
  const d = await svc.ticker("HPG");
  assert.equal(d.layers.find((l) => l.id === "commodity").available, false);
  assert.equal(d.layers.find((l) => l.id === "world_short").available, false);
  assert.equal(d.layers.find((l) => l.id === "earnings").available, true);
  await svc.ticker("HPG"); assert.equal(calls, 1);
});

test("route GET /api/elite/impact/:ticker: hợp đồng JSON + kiểm mã", async () => {
  const svc = createImpactProfile({ now: () => NOW, sources: { fa: async () => fa, commodities: async () => commodities, ws: async () => ws, catalyst: async () => catalyst, x6: async () => x6, radar: async () => radar, dilution: async () => dilution } });
  const app = express(); app.use("/api/elite", createEliteRouter({ getImpact: () => svc, getPanel: () => null }));
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const r = await fetch(`${base}/api/elite/impact/hpg`); assert.equal(r.status, 200);
    const j = await r.json();
    assert.equal(j.ticker, "HPG"); assert.equal(j.aggregate, null); assert.equal(j.layers.length, 7);
    for (const k of ["id", "labelVi", "evidenceId", "seal", "available", "value", "direction", "source", "at"]) assert.ok(k in j.layers[0], `trường ${k}`);
    assert.equal((await fetch(`${base}/api/elite/impact/x`)).status, 400);
    const reg = await (await fetch(`${base}/api/elite/evidence-registry`)).json();
    assert.ok(Array.isArray(reg.entries) && Array.isArray(reg.impact));
  } finally { srv.close(); }
});
