process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { getRadarSignals, parseSignalTickers, signalEvidence, MAX_SIGNAL_TICKERS } from "../src/market/radar/radarSignals.js";
import { RESEARCH_KV, T } from "../src/market/research/researchJobs.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";

const feat = (stealth20, netIntent = 0) => ({ zEffort: 0, zResult: 0, zLarge: 0, stealth5: 0, stealth20, netIntent, pocDistAtr: 0, valueAreaPos: 0, logRvol: 0, mom5Atr: 0, impulse: 0 });
const perfRow = (signal, regime, horizon, z, verdict) => ({ signal, regime, horizon, n: 1700, hitRate: 0.54, baseline: 0.48, zHitClustered: z, verdict });

test("parseSignalTickers: chuẩn hoá, bỏ trùng, giới hạn", () => {
  assert.deepEqual(parseSignalTickers("fpt, HPG,fpt"), ["FPT", "HPG"]);
  assert.throws(() => parseSignalTickers(""), /tickers/);
  assert.throws(() => parseSignalTickers(Array.from({ length: MAX_SIGNAL_TICKERS + 1 }, (_, i) => `A${String(i).padStart(2, "0")}`).join(",")), /Tối đa/);
});

test("signalEvidence: chọn kỳ hạn có z cụm cao nhất; theo trạng thái thị trường nếu có", () => {
  const rows = [perfRow("STEALTH_20", "ALL", 3, 2.64, "edge"), perfRow("STEALTH_20", "ALL", 5, 2.25, "edge"), perfRow("STEALTH_20", "SIDEWAY", 5, 1.1, "none")];
  const e = signalEvidence(rows, "STEALTH_20", "SIDEWAY");
  assert.equal(e.verdict, "edge");
  assert.equal(e.all.horizon, 3);
  assert.equal(e.regime.zClustered, 1.1);
  assert.equal(signalEvidence([], "IFE_INTENT", null).verdict, "insufficient");
});

test("getRadarSignals: tín hiệu 'nóng' trong 3 phiên gần nhất, ý đồ IFE có nhãn, mô hình chưa đạt -> không có xác suất", async () => {
  const store = createMemoryStore();
  const days = ["2026-09-24", "2026-09-25", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"];
  await store.upsertRows(T.flow, days.flatMap((d) => [
    { symbol: "AAA", trading_date: d, features: feat(d === "2026-10-02" ? 1.8 : 0.2, 0.4) },
    { symbol: "BBB", trading_date: d, features: feat(-0.3) },
  ]), "symbol,trading_date");
  await store.upsertRows(T.ledger, [
    { symbol: "AAA", signal_date: "2026-10-02", signal: "STEALTH_20", direction: 1, score: 1.8, features: {} },
    { symbol: "AAA", signal_date: "2026-10-01", signal: "IFE_INTENT", direction: 1, score: 0.81, features: { state: "ACC_ACTIVE" } },
    { symbol: "BBB", signal_date: "2026-09-25", signal: "STEALTH_20", direction: -1, score: -1.7, features: {} }, // quá cũ
  ], "symbol,signal_date,signal");
  await store.setKv(RESEARCH_KV.performance, { rows: [perfRow("STEALTH_20", "ALL", 5, 2.25, "edge"), perfRow("IFE_INTENT", "ALL", 5, 0.12, "none")], currentRegime: { regime: "SIDEWAY" } });

  const r = await getRadarSignals(store, ["AAA", "BBB", "CCC"], new Date("2026-10-02T09:00:00Z"));
  assert.equal(r.asOf, "2026-10-02");
  assert.equal(r.freshFrom, "2026-09-30");
  assert.equal(r.evidence.STEALTH_20.verdict, "edge");
  assert.equal(r.evidence.IFE_INTENT.verdict, "none");
  assert.deepEqual(r.adaptiveModels.map((m) => m.active), [false, false, false]);
  assert.deepEqual(r.items.AAA.stealth20, { z: 1.8, on: true, direction: 1, score: 1.8, date: "2026-10-02" });
  assert.equal(r.items.AAA.intent.label, "Gom chủ động");
  assert.deepEqual(r.items.AAA.adaptive, []);
  assert.equal(r.items.BBB.stealth20.on, false);
  assert.equal(r.items.CCC, null);
});
