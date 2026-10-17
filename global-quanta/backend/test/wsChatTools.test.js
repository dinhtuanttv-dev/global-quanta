import { test } from "node:test";
import assert from "node:assert/strict";
import { createWsChatTools, WS_TOOL_SPECS } from "../src/market/worldSectors/chatTools.js";

const strategy = async () => ({
  vnLast: "2026-10-16", version: "S1", regime: { stressed: false, vix: 15, vixChg: 1, noteVi: "ok" }, evidence: { short: { label: "EVIDENCE" }, medium: { label: "EXPERIMENTAL" } },
  short: { rows: [{ icb: "1750", nameVi: "Kim loại", stance: "overweight", alphaBps: 3.5, pOutperform: 0.51, zx: 1.2, ic: 0.02, constituents: [{ ticker: "HPG", weight: 0.25 }] }, { icb: "9500", nameVi: "CN", stance: "underweight", alphaBps: -5, pOutperform: 0.48, zx: -1.9, ic: 0.02, constituents: [] }] },
  medium: [{ icb: "1750", nameVi: "Kim loại", stance: "supportive", ws: { score: 0.3 }, rrg: { quadrant: "IMPROVING" } }],
});
const detail = async (icb) => ({ status: 200, body: { available: true, icb, nameVi: "Kim loại", vnLast: "2026-10-16", scores: { short: { score: 1, label: "tailwind", sectors: { byRegion: {} }, commodity: null }, medium: { score: 0.3, label: "neutral", gap3m: 0.1 } }, evidence: { short: { labelVi: "x" }, medium: { labelVi: "y" } }, relations: [], drivers: [{ id: "IRON_ORE", nameVi: "Quặng sắt", sign: 1, short: null, medium: null }], stocks: [{ symbol: "HPG", weight: 0.25, beta: 0.4, corr: 0.17, d1: 0.7, m1: -1.4, m3: -5.9 }] } });
const tools = createWsChatTools({ strategy, worldSectors: { detail }, commodities: { snapshot: async () => ({ items: [], pinkSheet: null }), history: async () => ({ status: 404, body: { error: "x" } }) }, taxonomy: async () => ({ symbols: { HPG: { l1: "1000", l2: "1700", l3: "1750" }, ABC: { l1: "9000", l2: "9900", l3: "9990" } } }) });

test("ws tools: đặc tả hợp lệ, kiểm tra tham số, cổ phiếu -> ngành ICB + phơi nhiễm, nhãn bằng chứng", async () => {
  assert.equal(WS_TOOL_SPECS.length, 5);
  for (const s of WS_TOOL_SPECS) { assert.equal(s.input_schema.additionalProperties, false); assert.ok(s.name.startsWith("ws_")); }
  assert.equal((await tools.run("ws_sector", {})).ok, false);
  assert.equal((await tools.run("ws_sector", { icb: "1234" })).ok, false);
  assert.equal((await tools.run("ws_strategy", { topN: 99 })).ok, false);
  assert.equal((await tools.run("ws_strategy", { foo: 1 })).ok, false);
  assert.equal((await tools.run("ws_hack", {})).ok, false);
  const s = await tools.run("ws_strategy", { topN: 1 });
  assert.equal(s.data.shortTop[0].icb, "1750");
  assert.equal(s.data.shortBottom[0].icb, "9500");
  assert.ok(s.guidance.join(" ").includes("lợi thế nhỏ"));
  const h = await tools.run("ws_stock", { ticker: "hpg" });
  assert.equal(h.data.sector.icb, "1750");
  assert.equal(h.data.stockExposure.weightPct, 25);
  assert.equal(h.data.sectorShort.stance, "overweight");
  const x = await tools.run("ws_stock", { ticker: "ABC" });
  assert.equal(x.data.sector, null);
  assert.equal((await tools.run("ws_stock", { ticker: "ZZZ" })).ok, false);
  assert.equal((await tools.run("ws_commodity", { id: "GOLD" })).ok, false);
  assert.equal(tools.specs().anthropic.length, 5);
});
