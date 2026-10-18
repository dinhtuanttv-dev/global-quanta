process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { buildDecision, capWeights, evaluateEntry, normInv, normalScores, signalWeights, summarizeLedger, COST_ROUND_TRIP } from "../src/market/elite/decisionCore.js";
import { createDecisionService, DECISION_KV } from "../src/market/elite/decisionService.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";

const evidence = {
  version: "E2-v1",
  signals: [
    { id: "stealth20", tier: "A", mainH: 5, byH: { 5: { n: 200, mean: 0.016 } } },
    { id: "ws_sector_alpha", tier: "A", mainH: 1, byH: { 1: { n: 0, mean: null } } },
    { id: "top20_alpha", tier: "B", mainH: 5, byH: { 5: { n: 100, mean: -0.05 } } },
    { id: "smart_score", tier: "C", mainH: 5, byH: { 5: { n: 300, mean: 0.2 } } },
  ],
};

test("E3 lõi: Φ⁻¹, điểm chuẩn theo hạng, trọng số IC hậu nghiệm (chỉ A/B), trần tỷ trọng khả thi", () => {
  assert.ok(Math.abs(normInv(0.975) - 1.959964) < 1e-5);
  assert.ok(Math.abs(normInv(0.5)) < 1e-12);
  const z = normalScores([["A", 1], ["B", 2], ["C", 2], ["D", 3], ["E", null]]);
  assert.equal(z.size, 4);
  assert.equal(z.get("B"), z.get("C"));
  assert.ok(Math.abs([...z.values()].reduce((a, b) => a + b, 0)) < 1e-9);
  const { weights, icComb } = signalWeights(evidence);
  assert.deepEqual(weights.map((w) => w.id), ["stealth20", "ws_sector_alpha", "top20_alpha"], "bậc C không có trọng số");
  const s20 = weights[0];
  assert.ok(Math.abs(s20.icPost - (200 * 0.016 + 60 * 0.02) / 260) < 1e-12);
  assert.equal(weights[1].icPost, 0, "E3-v3 (5): α ngành thế giới lệch kỳ hạn -> tiên nghiệm 0, chưa đo -> IC hậu nghiệm 0");
  assert.equal(weights[1].w, 0);
  assert.equal(weights[2].w, 0, "IC hậu nghiệm âm -> trọng số 0");
  assert.ok(Math.abs(weights.reduce((a, w) => a + w.w, 0) - 1) < 1e-12);
  assert.ok(icComb > 0.015 && icComb < 0.02);
  const w = capWeights([10, 1, 1, 1, 1, 1, 1, 1, 1, 1], 0.2);
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(Math.max(...w) <= 0.2 + 1e-9);
  const few = capWeights([5, 1, 1], 0.2);
  assert.ok(Math.abs(few.reduce((a, b) => a + b, 0) - 1) < 1e-9, "3 mã: trần hiệu dụng 1/3, vẫn đủ 100%");
});

/** 60 mã, 120 phiên; mã i có stealth20 = i; 6 mã điểm cao nhất cùng ngành; một mã kém thanh khoản, một mã giá thấp. */
function world() {
  const cal = [];
  for (let d = Date.UTC(2026, 3, 1); cal.length < 120; d += 86_400_000) {
    const wd = new Date(d).getUTCDay();
    if (wd !== 0 && wd !== 6) cal.push(new Date(d).toISOString().slice(0, 10));
  }
  const tick = (i) => `T${String(i).padStart(2, "0")}`;
  const rows = [], daily = [];
  for (let i = 0; i < 60; i++) {
    const t = tick(i);
    rows.push({ ticker: t, icb: { l2: i >= 54 ? "8300" : `S${i % 9}` }, values: { stealth20: i, ws_sector_alpha: null, top20_alpha: 60 - i, smart_score: 100 - i } });
    // T57: giá bị neo (như NAF 10/2026) -> loại theo E3-v2.
    cal.forEach((date, k) => daily.push({ symbol: t, date, closeAdj: i === 57 ? 48000 + (k % 3 === 0 ? -50 : 0) : (i === 3 ? 3000 : 20000) * (1 + 0.0004 * i * k + 0.03 * Math.sin(k + i)), value: i === 5 ? 1e9 : 2e10 }));
  }
  for (const s of ["VNM", "FPT", "HPG", "VCB", "MWG"]) cal.forEach((date) => daily.push({ symbol: s, date, closeAdj: 10, value: 1e11 }));
  return { cal, rows, daily, tick };
}

test("E3 buildDecision: xếp theo Z, trần 3 mã/ngành, loại mã không đủ điều kiện, α cùng dấu Z, đóng góp chỉ A/B", () => {
  const { cal, rows, daily } = world();
  const date = cal[99];
  const prices = new Map();
  for (const r of daily) if (r.date <= date) { if (!prices.has(r.symbol)) prices.set(r.symbol, []); prices.get(r.symbol).push(r); }
  const d = buildDecision({ panel: { date, rows }, evidence, prices, cal: cal.slice(0, 100) });
  assert.equal(d.portfolio.length, 10);
  assert.equal(d.portfolio.filter((x) => x.sectorKey === "8300").length, 3, "6 mã cùng ngành điểm cao nhất -> chỉ lấy 3");
  assert.ok(!d.portfolio.some((x) => ["T03", "T05", "T57"].includes(x.ticker)), "giá < 5.000đ / GTGD < 10 tỷ / giá bị neo bị loại");
  assert.equal(d.scores.find((x) => x.ticker === "T05").reason, "GTGD TB20 < 10 tỷ");
  assert.match(d.scores.find((x) => x.ticker === "T57").reason, /giá bị neo/);
  assert.ok(Math.abs(d.portfolio.reduce((a, x) => a + x.weight, 0) - 1) < 1e-9);
  assert.ok(d.portfolio.every((x) => x.weight <= 0.2 + 1e-9 && x.stop < x.close && x.target > x.close));
  assert.equal(d.scores[0].ticker, "T59");
  assert.ok(d.scores[0].alpha5Pct > 0 && d.scores[d.scores.length - 1].alpha5Pct < 0);
  assert.ok(d.scores[0].pOutperform > 0.5);
  assert.deepEqual(d.scores[0].contributions.map((c) => c.id), ["stealth20", "ws_sector_alpha", "top20_alpha"]);
  assert.equal(d.universe.eligible, 57);
});

test("E3 sổ theo dõi: chấm sau d+1+h, lợi suất vượt = danh mục − rổ đều; tiêu chí cần ≥ 60 phiên", () => {
  const cal = ["d0", "d1", "d2", "d3", "d4", "d5", "d6", "d7"];
  const px = new Map();
  const names = Array.from({ length: 40 }, (_, i) => `U${i}`);
  for (const t of names) { px.set(`${t}|d1`, 100); px.set(`${t}|d6`, 101); }
  px.set("U0|d6", 110);
  const entry = { date: "d0", holdings: [{ ticker: "U0", weight: 1 }], universe: names, z: Object.fromEntries(names.map((t, i) => [t, t === "U0" ? 2 : -i / 40])) };
  const r = evaluateEntry(entry, 5, px, cal, new Map([["d1", 1000], ["d6", 1010]]));
  assert.equal(r.from, "d1");
  assert.equal(r.to, "d6");
  assert.ok(Math.abs(r.portfolioNet - (0.1 - COST_ROUND_TRIP)) < 1e-12);
  assert.ok(Math.abs(r.excess - (0.1 - (0.1 + 39 * 0.01) / 40)) < 1e-12);
  assert.ok(Math.abs(r.vnIndex - 0.01) < 1e-12);
  assert.equal(evaluateEntry(entry, 10, px, cal, new Map()), null, "chưa đủ kỳ hạn");
  const s = summarizeLedger([{ results: { 5: r } }]);
  assert.equal(s.label, "EXPERIMENTAL");
  assert.match(s.labelVi, /1 phiên/);
});

test("E3 dịch vụ: khoá danh mục vào sổ một lần mỗi phiên, chấm khi có giá mới", async () => {
  const { cal, rows, daily } = world();
  const store = createMemoryStore();
  const upto = (k) => daily.filter((r) => r.date <= cal[k]);
  await store.upsertMarketDaily(upto(99));
  await store.setKv(DECISION_KV.ledger, { version: "E3-v1 (prereg 2026-10-17)", entries: [{ date: "2026-01-01", holdings: [], universe: [], results: {} }] });
  let panelDoc = { date: cal[99], version: "E1", rows };
  const svc = createDecisionService({
    store, panel: { panel: async () => panelDoc }, evidence: { evidence: async () => evidence },
    vnIndex: async () => cal.map((d, i) => [d, 1000 + i]), now: () => Date.parse("2026-08-20T11:00:00Z"), log: { warn() {} },
  });
  const d1 = await svc.build();
  assert.equal(d1.portfolio.length, 10);
  let ledger = (await store.getKv(DECISION_KV.ledger)).value;
  assert.equal(ledger.entries.length, 1, "đổi phiên bản -> sổ mới bắt đầu lại");
  assert.equal(ledger.previous, "E3-v1 (prereg 2026-10-17)");
  assert.equal((await store.getKv("elite:ledger:archive:E3-v1")).value.entries.length, 1, "sổ cũ được lưu trữ nguyên vẹn");
  await svc.build();
  ledger = (await store.getKv(DECISION_KV.ledger)).value;
  assert.equal(ledger.entries.length, 1, "cùng phiên -> không thêm bản ghi");
  assert.deepEqual(ledger.entries[0].results, {});

  await store.upsertMarketDaily(daily.filter((r) => r.date > cal[99] && r.date <= cal[111]));
  panelDoc = { date: cal[111], version: "E1", rows };
  await svc.build();
  ledger = (await store.getKv(DECISION_KV.ledger)).value;
  assert.equal(ledger.entries.length, 2);
  const first = ledger.entries[0];
  assert.ok(first.results[5] && first.results[10], "phiên đầu đã chấm đủ 5 và 10 phiên");
  assert.equal(first.z, undefined, "đã chấm đủ -> bỏ Z");
  assert.equal(first.universeSize, 57);
  assert.equal(ledger.summary.horizons[5].n, 1);
  const pub = await svc.ledger();
  assert.equal(pub.entries[0].universe, undefined);
  assert.equal((await svc.decision()).date, cal[111]);
});

import { correlationAdjust, ercWeights, solveLinear, alignedReturns } from "../src/market/elite/decisionCore.js";
import { ledoitWolf as lw } from "../src/market/elite/riskCore.js";

test("E3-v3: hệ tuyến tính, ERC đóng góp rủi ro bằng nhau", () => {
  const x = solveLinear([[2, 1], [1, 3]], [3, 5]);
  assert.ok(Math.abs(x[0] - 0.8) < 1e-12 && Math.abs(x[1] - 1.4) < 1e-12);
  assert.equal(solveLinear([[1, 2], [2, 4]], [1, 2]), null);
  const cov = [[0.04, 0.012, 0.006], [0.012, 0.09, 0.009], [0.006, 0.009, 0.01]];
  const w = ercWeights(cov);
  const Sw = cov.map((row) => row.reduce((a, v, j) => a + v * w[j], 0));
  const rc = w.map((v, i) => v * Sw[i]);
  assert.ok(Math.abs(w.reduce((a, b) => a + b, 0) - 1) < 1e-12);
  assert.ok(Math.max(...rc) - Math.min(...rc) < 1e-9, `RC ${rc}`);
  assert.ok(w[2] > w[0] && w[0] > w[1], "mã biến động thấp nhận tỷ trọng cao hơn");
});

test("E3-v3: trọng số theo tương quan không đếm trùng tín hiệu trùng lặp; IC tổng = Σw·IC/√(wᵀC̃w)", () => {
  const tick = Array.from({ length: 60 }, (_, i) => `T${i}`);
  const z = (f) => new Map(tick.map((t, i) => [t, f(i)]));
  const a = z((i) => Math.sin(i * 1.7)), b = z((i) => Math.sin(i * 1.7) * 0.99 + 0.01 * Math.cos(i)), c = z((i) => Math.cos(i * 0.9 + 2));
  const base = { weights: [{ id: "a", icPost: 0.02, w: 1 / 3 }, { id: "b", icPost: 0.02, w: 1 / 3 }, { id: "c", icPost: 0.02, w: 1 / 3 }], icComb: 0.02 };
  const r = correlationAdjust(base, new Map([["a", a], ["b", b], ["c", c]]), tick);
  assert.equal(r.method, "correlation");
  const w = Object.fromEntries(r.weights.map((x) => [x.id, x.w]));
  assert.ok(w.c > w.a && w.c > w.b, `tín hiệu độc lập c phải nặng hơn từng tín hiệu trùng: ${JSON.stringify(w)}`);
  assert.ok(Math.abs(w.a + w.b + w.c - 1) < 1e-12);
  assert.ok(r.icComb > 0.02, "kết hợp tín hiệu ít tương quan làm IC tổng tăng");
  assert.ok(Math.abs(r.weights[0].wNaive - 1 / 3) < 1e-12, "giữ trọng số ∝ IC để đối chiếu");
  const few = correlationAdjust({ weights: [{ id: "a", icPost: 0.02, w: 0.5 }, { id: "b", icPost: 0.02, w: 0.5 }], icComb: 0.02 }, new Map([["a", a], ["b", new Map()]]), tick);
  assert.equal(few.method, "ic");
});

test("E3-v3 buildDecision: ERC khi đủ 60 phiên, vùng đệm giữ mã phiên trước còn trong top 20, vòng quay", () => {
  const { cal, rows, daily } = world();
  const date = cal[99];
  const prices = new Map();
  for (const r of daily) if (r.date <= date) { if (!prices.has(r.symbol)) prices.set(r.symbol, []); prices.get(r.symbol).push(r); }
  const first = buildDecision({ panel: { date, rows }, evidence, prices, cal: cal.slice(0, 100) });
  assert.equal(first.construction.method, "erc");
  assert.ok(first.construction.sessions >= 60);
  assert.ok(first.portfolio.every((p) => p.riskContribution != null));
  assert.ok(Math.abs(first.portfolio.reduce((a, p) => a + p.weight, 0) - 1) < 1e-9);
  // mã hạng ~15 (ngoài top 10, trong top 20) đang nắm giữ -> được giữ lại; mã hạng thấp -> không giữ
  const eligibleRanked = first.scores.filter((x) => x.eligible);
  const inBuffer = eligibleRanked[14].ticker, outBuffer = eligibleRanked[40].ticker;
  const second = buildDecision({ panel: { date, rows }, evidence, prices, cal: cal.slice(0, 100), prevHoldings: [{ ticker: inBuffer, weight: 0.5 }, { ticker: outBuffer, weight: 0.5 }] });
  const held = second.portfolio.map((p) => p.ticker);
  assert.ok(held.includes(inBuffer), "mã trong vùng đệm được giữ");
  assert.ok(!held.includes(outBuffer), "mã ngoài top 20 bị loại");
  assert.equal(second.portfolio.find((p) => p.ticker === inBuffer).retained, true);
  assert.equal(second.construction.retained, 1);
  assert.ok(second.construction.turnover > 0 && second.construction.turnover <= 1);
  assert.equal(alignedReturns(prices, ["T10", "T11"], date, 30).length, 30);
  assert.ok(lw(alignedReturns(prices, ["T10", "T11", "T12"], date, 120)).delta >= 0);
});
