// Trading Matrix M3 — engine kịch bản: điều kiện theo nhóm bằng chứng, vòng đời + cooldown, không nhìn trước, kiểm định chạy trọn.
import test from "node:test";
import assert from "node:assert/strict";
import { buildStateSeries, evaluate, neutralState, RULES, runLifecycle } from "../src/market/tradingMatrix/scenarioEngine.js";
import { runScenarioValidation } from "../src/market/tradingMatrix/scenarioValidate.js";
import { tradingDatesBack } from "../src/market/scanner/scannerJobs.js";

const st = (o) => ({ regime: "UPTREND", b: 60, db5: 2, ddb: 0, med5: 1, idx5: 1, idx1: 0.2, rv: 1, rvPct: 50, coverage: 1, ...o });

test("điều kiện: SC1 cần giá + độ rộng + lọc biến động; SC2 chỉ số tăng nhưng cổ phiếu yếu; SC3 cần cả biến động lẫn độ rộng rơi", () => {
  assert.equal(evaluate(st({})).SC1.confirm, true);
  assert.equal(evaluate(st({ rvPct: 85 })).SC1.confirm, false, "biến động cao -> không đủ điều kiện");
  assert.match(evaluate(st({ rvPct: 85 })).SC1.contradictions.join(), /biến động cao/);
  assert.equal(evaluate(st({ b: 45, db5: 1 })).SC1.watch, true);
  const sc2 = evaluate(st({ idx5: 1.2, med5: -0.4, db5: -6 })).SC2;
  assert.equal(sc2.confirm, true); assert.equal(sc2.evidence.length, 3);
  assert.equal(evaluate(st({ rvPct: 95, ddb: -20 })).SC3.confirm, true);
  assert.equal(evaluate(st({ rvPct: 95, ddb: -5 })).SC3.confirm, false);
  assert.equal(evaluate(st({ rvPct: 95, ddb: -5 })).SC3.watch, true);
  assert.equal(evaluate(st({ idx1: -3, rv: 1, rvPct: 50, ddb: -18 })).SC3.confirm, true, "phiên giảm ≥ 2,5 độ lệch chuẩn");
  assert.equal(evaluate(st({ regime: null, b: null })).SC1.invalid, false, "thiếu dữ liệu không tự vô hiệu");
});

test("vòng đời: WATCH -> CONFIRMED (đợt) -> INVALIDATED -> COOLDOWN 5 phiên (không vào lại) -> INACTIVE", () => {
  const seq = [st({ b: 45 }), st({}), st({}), st({ regime: "SIDEWAY" }), ...Array.from({ length: 6 }, () => st({})), st({})].map((s, i) => ({ ...s, date: `d${String(i).padStart(2, "0")}` }));
  const { timeline, episodes } = runLifecycle(seq);
  assert.deepEqual(timeline.map((d) => d.SC1.state), ["WATCH", "CONFIRMED", "CONFIRMED", "INVALIDATED", "COOLDOWN", "COOLDOWN", "COOLDOWN", "COOLDOWN", "COOLDOWN", "INACTIVE", "CONFIRMED"]);
  assert.deepEqual(episodes.filter((e) => e.scenario === "SC1").map((e) => [e.start, e.end]), [["d01", "d03"], ["d10", null]]);
  assert.equal(RULES.cooldown, 5);
  assert.deepEqual(neutralState(timeline[5], { coverage: 0.7, regimeLabel: "TRANSITION" }).reasons.length, 3);
});

function synth(n, seed) {
  let a = seed; const r = () => ((a = (a * 16807) % 2147483647) / 2147483647);
  const dates = tradingDatesBack("2026-10-21", n);
  const idx = []; let p = 1000;
  for (let i = 0; i < n; i++) { p *= 1 + Math.sin(i / 30) * 0.004 + (r() - 0.5) * 0.02; idx.push({ date: dates[i], open: p, high: p, low: p, close: p, volume: 1 }); }
  const daily = { VNINDEX: idx };
  for (let k = 0; k < 40; k++) { let q = 20 + k; daily[`S${k}`] = dates.map((date, i) => { q *= 1 + (idx[i].close / (idx[i - 1]?.close ?? idx[i].close) - 1) * (0.5 + r()) + (r() - 0.5) * 0.02; return { date, open: q, high: q, low: q, close: q, closeAdj: q, volume: 1, value: 1 }; }); }
  return daily;
}

test("không nhìn trước: trạng thái + vòng đời tới t không đổi khi thêm dữ liệu sau t", () => {
  const d = synth(700, 11);
  const full = buildStateSeries({ bySymbol: new Map(Object.entries(d).filter(([k]) => k !== "VNINDEX")), indexBars: d.VNINDEX });
  const cut = 500;
  const part = buildStateSeries({ bySymbol: new Map(Object.entries(d).filter(([k]) => k !== "VNINDEX").map(([k, v]) => [k, v.slice(0, cut)])), indexBars: d.VNINDEX.slice(0, cut) });
  assert.deepEqual(part, full.slice(0, cut));
  const lf = runLifecycle(full).timeline.slice(0, cut).map((x) => [x.SC1.state, x.SC2.state, x.SC3.state]);
  const lp = runLifecycle(part).timeline.map((x) => [x.SC1.state, x.SC2.state, x.SC3.state]);
  assert.deepEqual(lp, lf);
});

test("kiểm định chạy trọn trên dữ liệu tổng hợp: đủ khoá, phán quyết hợp lệ, có độ nhạy ±20 %", () => {
  const rep = runScenarioValidation({ daily: synth(1250, 5), indexBars: synth(1250, 5).VNINDEX });
  assert.deepEqual(Object.keys(rep.verdicts.final), ["SC1", "SC2", "SC3"]);
  for (const v of Object.values(rep.verdicts.final)) assert.ok(["PASS", "FAIL", "FAIL_FDR", "INSUFFICIENT"].includes(v));
  assert.ok(rep.sensitivity.length >= 16);
  assert.equal(rep.ruleVersion, "M3-r1");
  assert.ok(rep.stats.SC1.episodes.IS >= 0);
});
