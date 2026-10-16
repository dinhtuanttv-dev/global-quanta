import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorldPulse, parseQuote, PULSE_MARKETS } from "../src/market/world/worldPulse.js";

const chart = (closes, { price, time } = {}) => {
  const ts = closes.map((_, i) => Date.UTC(2026, 9, 13 + i, 20) / 1000);
  return { chart: { result: [{ meta: { regularMarketPrice: price ?? closes.at(-1), regularMarketTime: time ?? ts.at(-1) }, timestamp: ts, indicators: { quote: [{ close: closes }] } }] } };
};

test("parseQuote: giá hiện tại so với phiên NGÀY TRƯỚC, kèm ngày", () => {
  const q = parseQuote(chart([100, 101, 102]));
  assert.equal(q.value, 102);
  assert.equal(q.prevClose, 101);
  assert.ok(Math.abs(q.changePct - (102 / 101 - 1) * 100) < 1e-9);
  assert.equal(q.date, "2026-10-15");
  assert.equal(parseQuote({ chart: { result: [] } }), null);
});

test("pulse: mọi số có nguồn + ngày; Risk-On gắn HEURISTIC_FAILED; thiếu mã thì liệt kê, không bịa", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("%5ESTI")) return { ok: false, status: 404 };
    const v = url.includes("DX-Y") ? 101 : url.includes("VIX") ? 14 : url.includes("TNX") ? 3.9 : 50;
    return { ok: true, json: async () => chart([v, v]) };
  };
  const p = createWorldPulse({ fetchImpl, now: () => Date.UTC(2026, 9, 16) });
  const d = await p.get();
  assert.equal(d.source, "gateway");
  assert.equal(d.macro.risk_on_score, 100);
  assert.equal(d.macro.risk_on_evidence, "HEURISTIC_FAILED");
  for (const q of Object.values(d.macro.quotes)) { assert.ok(q.date); assert.match(q.source, /^Yahoo:/); }
  assert.equal(d.markets.length, PULSE_MARKETS.length - 1);
  assert.deepEqual(d.missing, ["^STI"]);
  assert.ok(d.markets.every((m) => m.date && m.source));
  assert.equal(await p.get(), d); // cache 5 phút
});
