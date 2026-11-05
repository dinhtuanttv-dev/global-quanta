import test from "node:test";
import assert from "node:assert/strict";
import { alignPrev, bootstrapSharpeP, CG, episodes, holm, metrics, regimeSeries, simulate, targets, verdict } from "../src/market/cashGate/cashGateCore.js";

test("CG-r1: VIX dùng phiên Mỹ gần nhất TRƯỚC ngày VN (không cùng ngày, không nhìn trước)", () => {
  const us = [["2026-01-01", 20], ["2026-01-02", 30], ["2026-01-05", 26]];
  assert.deepEqual(alignPrev(["2026-01-01", "2026-01-02", "2026-01-05", "2026-01-06"], us), [null, 20, 30, 26]);
});

test("CG-r1: DOWNTREND theo regime.js; H1 30%, H1b 50% chỉ khi đồng thời VIX > 25; H3 theo VolSlope", () => {
  const closes = Array.from({ length: 120 }, (_, i) => 100 * (1 - 0.004 * i)); // giảm đều -> DOWNTREND sau khi đủ MA
  const reg = regimeSeries(closes);
  assert.equal(reg[100], "DOWNTREND");
  const vix = closes.map((_, i) => (i >= 100 ? 30 : 18));
  const vix3m = closes.map((_, i) => (i >= 110 ? 25 : 20)); // i ≥ 110: 30/25 − 1 = +0,2 > −0,05
  const t = targets({ closes, vix, vix3m });
  assert.equal(t.H1[99], 1); assert.equal(t.H1[100], CG.h1Low); assert.equal(t.H1b[100], CG.h1bLow);
  assert.equal(t.H3[50], 1, "18/20 − 1 = −0,10 -> không kích hoạt");
  assert.equal(t.H3[100], CG.h3Low, "30/20 − 1 = +0,5");
});

test("CG-r1: mục tiêu quyết định ở d chỉ áp cho lợi suất d+1 -> d+2; phí 0,2%/chiều; tiền mặt 4%/năm", () => {
  const closes = [100, 100, 110, 121, 121];
  const target = [1, 0.5, 0.5, 0.5, 0.5]; // quyết định tại phiên 1
  const s = simulate(closes, target, { from: 1, to: 4, cashYield: 0 });
  // lợi suất phiên 2 (1->2): vị thế còn 100% (khớp ở đóng cửa 2) -> +10%
  assert.ok(Math.abs(s.rets[1] - 0.10) < 1e-12);
  // lợi suất phiên 3 (2->3): 50% × 10% sau phí 0,2% × 0,5
  assert.ok(Math.abs(s.rets[2] - ((1 - 0.001) * 1.05 - 1)) < 1e-12);
  assert.equal(s.switches, 1);
  const cash = simulate([100, 100, 100], [0, 0, 0], { from: 1, to: 2, cost: 0, cashYield: 0.04 });
  assert.ok(Math.abs(cash.rets[1] - 0.04 / 252) < 1e-12);
});

test("CG-r1: H2 nhắm biến động: giảm tỷ trọng khi σ̂ tăng vọt, trong [0,3; 1], chỉ đổi khi |Δw| ≥ 0,10", () => {
  const closes = [100];
  for (let i = 1; i < 400; i++) closes.push(closes[i - 1] * (1 + (i < 300 ? 0.005 : 0.05) * (i % 2 ? 1 : -1)));
  const t = targets({ closes, vix: closes.map(() => null), vix3m: closes.map(() => null) });
  assert.equal(t.H2[250], 1);
  assert.ok(t.H2[399] < 0.5 && t.H2[399] >= CG.wMin, `w=${t.H2[399]}`);
  for (let i = 1; i < t.H2.length; i++) if (t.H2[i] !== t.H2[i - 1]) assert.ok(Math.abs(t.H2[i] - t.H2[i - 1]) >= 0.1 - 1e-12);
});

test("CG-r1: thống kê — sụt giảm tối đa, Holm, bootstrap cùng chuỗi p = 1, đợt kích hoạt", () => {
  const m = metrics([0.1, -0.5, 0.2]);
  assert.ok(Math.abs(m.mdd - -0.5) < 1e-12);
  assert.deepEqual(holm([0.01, 0.04, 0.03, 0.2]).map((x) => +x.toFixed(4)), [0.04, 0.09, 0.09, 0.2]);
  const a = Array.from({ length: 300 }, (_, i) => Math.sin(i) / 100);
  assert.equal(bootstrapSharpeP(a, a, { reps: 200 }).p, 1);
  const better = a.map((x) => x + 0.002);
  assert.ok(bootstrapSharpeP(better, a, { reps: 500 }).p < 0.05);
  assert.deepEqual(episodes(["a", "b", "c", "d"], [1, 0.3, 0.3, 1]), [{ from: "b", to: "c", sessions: 2, minW: 0.3 }]);
});

test("CG-r1: tiêu chí — ĐẠT chỉ khi đủ C1–C4", () => {
  const rule = (o) => ({ deltaSharpe: 0.3, p: 0.001, mdd: -0.2, cagr: 0.1, ...o });
  const main = { base: { mdd: -0.3, cagr: 0.105 }, rules: { H1: rule(), H1b: rule({ mdd: -0.27 }), H2: rule({ cagr: 0.08 }), H3: rule({ p: 0.2 }) } };
  const robust = { rules: { H1: { deltaSharpe: 0.1 }, H1b: { deltaSharpe: 0.1 }, H2: { deltaSharpe: 0.1 }, H3: { deltaSharpe: 0.1 } } };
  const v = verdict(main, robust);
  assert.equal(v.H1.pass, true);
  assert.equal(v.H1b.C2, false, "chỉ nông hơn 3 điểm %");
  assert.equal(v.H2.C3, false, "mất 2,5 điểm % lợi suất năm");
  assert.equal(v.H3.C1, false);
  assert.equal(verdict(main, { rules: { ...robust.rules, H1: { deltaSharpe: -0.01 } } }).H1.pass, false, "C4");
});

test("CG-r1 service: trạng thái phiên đã đóng, tỷ lệ chính thức 100% khi không đạt, sổ bóng ghi một lần mỗi phiên", async () => {
  const { createCashGateService, CASH_GATE_LEDGER_KV, holdoutSummary } = await import("../src/market/cashGate/cashGateService.js");
  const { createMemoryStore } = await import("../src/market/store/memoryStore.js");
  const dates = [];
  for (let d = Date.UTC(2025, 0, 1); dates.length < 300; d += 86_400_000) { const wd = new Date(d).getUTCDay(); if (wd && wd !== 6) dates.push(new Date(d).toISOString().slice(0, 10)); }
  const bars = dates.map((date, i) => ({ date, close: 1500 * (1 - 0.0015 * Math.max(0, i - 200)) }));
  const yahoo = (v) => ({ chart: { result: [{ timestamp: dates.map((d) => Date.parse(`${d}T20:00:00Z`) / 1000 - 86_400), indicators: { quote: [{ close: dates.map(() => v) }] } }] } });
  const fetchImpl = async (url) => ({ ok: true, json: async () => yahoo(url.includes("VIX3M") ? 24 : 28) });
  const report = JSON.parse((await import("node:fs")).readFileSync(new URL("../src/market/cashGate/cg-r1-report.json", import.meta.url), "utf8"));
  const store = createMemoryStore();
  const svc = createCashGateService({ store, vnIndexBars: async () => bars, fetchImpl, report });
  const s = await svc.status({ recordLedger: true });
  assert.equal(s.asOf, dates.at(-1));
  assert.equal(s.inputs.regime, "DOWNTREND");
  assert.equal(s.rules.H1.target, 0.3, "DOWNTREND ∧ VIX 28 > 25");
  assert.equal(s.rules.H3.target, 0.5, "28/24 − 1 > −0,05");
  assert.equal(s.official.equityShare, 1, "không quy tắc nào đạt -> giữ 100%");
  assert.equal(s.holdout.passed.length, holdoutSummary(report).passed.length);
  assert.equal(s.ledger.entries, 1);
  await svc.status({ refresh: true, recordLedger: true });
  assert.equal((await store.getKv(CASH_GATE_LEDGER_KV)).value.entries.length, 1, "không ghi trùng phiên");
});

test("CG-r1 service R4: nguồn lỗi khi làm mới -> trả bản gần nhất kèm stale; chưa có bản nào -> báo lỗi", async () => {
  const { createCashGateService } = await import("../src/market/cashGate/cashGateService.js");
  const { createMemoryStore } = await import("../src/market/store/memoryStore.js");
  const dates = [];
  for (let d = Date.UTC(2025, 0, 1); dates.length < 300; d += 86_400_000) { const wd = new Date(d).getUTCDay(); if (wd && wd !== 6) dates.push(new Date(d).toISOString().slice(0, 10)); }
  const bars = dates.map((date, i) => ({ date, close: 1500 + i }));
  const yahoo = { chart: { result: [{ timestamp: dates.map((d) => Date.parse(`${d}T20:00:00Z`) / 1000 - 86_400), indicators: { quote: [{ close: dates.map(() => 18) }] } }] } };
  let fail = false;
  const fetchImpl = async () => { if (fail) throw new Error("Yahoo down"); return { ok: true, json: async () => yahoo }; };
  const svc = createCashGateService({ store: createMemoryStore(), vnIndexBars: async () => bars, fetchImpl, report: null });
  const ok = await svc.status();
  assert.equal(ok.stale, undefined);
  fail = true;
  const st = await svc.status({ refresh: true });
  assert.equal(st.stale, true);
  assert.equal(st.asOf, ok.asOf);
  assert.match(st.staleReason, /Yahoo down/);
  const fresh = createCashGateService({ store: createMemoryStore(), vnIndexBars: async () => bars, fetchImpl, report: null });
  await assert.rejects(() => fresh.status(), /Yahoo down/);
});
