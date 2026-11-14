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

test("E4-HL dịch vụ: danh mục chính thức = Elite HL, danh mục dòng tiền dựng song song; khoá sổ một lần mỗi phiên, chấm khi có giá mới", async () => {
  const { cal, rows: rows0, daily } = world();
  // 12 mã điểm cao nhất có LS-v1 cao + 2 mô hình TA + ngành Dẫn dắt -> đạt Hợp lưu HL-v1.
  const rows = rows0.map((r, i) => ({ ...r, values: { ...r.values, ls_v1: i, structure_score: 3, rrg_quadrant: i >= 48 ? 2 : -1, ...(i >= 48 ? { sepa_state: 2, base_breakout: 3 } : {}) } }));
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
  assert.match(d1.version, /^E4-HL v1/);
  assert.equal(d1.flowPortfolio.length, 10, "danh mục dòng tiền E3 vẫn dựng đủ 10 mã");
  assert.ok(d1.portfolio.length >= 3 && d1.portfolio.length <= 10);
  assert.ok(d1.portfolio.every((x) => x.hl.cls === "STRONG" || x.hl.cls === "CONFLUENCE"), "danh mục chính thức chỉ gồm mã Hợp lưu");
  assert.ok(Math.abs(d1.hl.cash + d1.portfolio.reduce((a, x) => a + x.weight, 0) - 1) < 1e-3, "ô trống là tiền mặt");
  assert.equal(d1.hl.rebalance, true);
  const flow1 = (await store.getKv(DECISION_KV.flowLedger)).value;
  assert.equal(flow1.entries.length, 2, "sổ dòng tiền tiếp nối sổ cũ");
  assert.match(flow1.version, /^E3-v4/);
  let ledger = (await store.getKv(DECISION_KV.ledger)).value;
  assert.equal(ledger.entries.length, 1, "đổi phiên bản -> sổ mới bắt đầu lại");
  assert.equal(ledger.previous, "E3-v1 (prereg 2026-10-17)");
  assert.equal((await store.getKv("elite:ledger:archive:E3-v1")).value.entries.length, 1, "sổ cũ được lưu trữ nguyên vẹn");
  await svc.build();
  ledger = (await store.getKv(DECISION_KV.ledger)).value;
  assert.equal(ledger.entries.length, 1, "cùng phiên -> không thêm bản ghi");
  // Dựng lại cùng phiên khi bản ghi chưa chấm: sổ được đồng bộ theo tài liệu mới (giữ giờ khoá ban đầu), không thêm bản ghi.
  const stale = (await store.getKv(DECISION_KV.ledger)).value;
  stale.entries[0].holdings = stale.entries[0].holdings.map(({ ref, ...h }) => h);
  await store.setKv(DECISION_KV.ledger, stale);
  await svc.build({ force: true });
  ledger = (await store.getKv(DECISION_KV.ledger)).value;
  assert.equal(ledger.entries.length, 1);
  assert.ok(ledger.entries[0].holdings.every((h) => h.ref > 0), "giá tham chiếu được ghi lại vào sổ");
  assert.equal(ledger.entries[0].lockedAt, stale.entries[0].lockedAt);
  assert.ok(ledger.entries[0].rebuiltAt);
  assert.deepEqual(ledger.entries[0].results, {});

  await store.upsertMarketDaily(daily.filter((r) => r.date > cal[99] && r.date <= cal[111]));
  panelDoc = { date: cal[111], version: "E1", rows };
  await svc.build();
  ledger = (await store.getKv(DECISION_KV.ledger)).value;
  assert.equal(ledger.entries.length, 2);
  const first = ledger.entries[0];
  assert.ok(first.results[5] && first.results[10], "phiên đầu đã chấm đủ 5 và 10 phiên");
  assert.equal(first.z, undefined, "đã chấm đủ -> bỏ Z");
  assert.ok(first.universeSize >= 57, "vũ trụ so sánh của HL = mã giao dịch được (≥ 5 tỷ)");
  assert.equal(first.holdings[0].since, cal[99]);
  const d2 = await svc.decision();
  assert.ok(d2.flowLedgerSummary && d2.hl.prevDate === cal[99]);
  assert.equal((await svc.ledger("flow")).entries.length, 3);
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

test("E3-v4 RRG: ngành Tụt hậu bị trừ 30% độ lớn Z khi xếp hạng; α / xác suất vượt theo Z mô hình; ngành khác giữ nguyên", async () => {
  const { rrgAdjust, RRG_RULE } = await import("../src/market/elite/decisionCore.js");
  assert.equal(rrgAdjust(2, -2), 2 - 0.6);
  assert.equal(rrgAdjust(-1, -2), -1.3, "Z âm vẫn bị phạt (không được lợi)");
  for (const q of [2, 1, -1, null, undefined]) assert.equal(rrgAdjust(1.5, q), 1.5);
  assert.equal(RRG_RULE.penalty, 0.3);

  const { cal, rows, daily } = world();
  const date = cal[99];
  const prices = new Map();
  for (const r of daily) if (r.date <= date) { if (!prices.has(r.symbol)) prices.set(r.symbol, []); prices.get(r.symbol).push(r); }
  const base = buildDecision({ panel: { date, rows }, evidence, prices, cal: cal.slice(0, 100) });
  const top = base.portfolio[0].ticker;
  const lagRows = rows.map((r) => (r.ticker === top ? { ...r, values: { ...r.values, rrg_quadrant: -2 } } : { ...r, values: { ...r.values, rrg_quadrant: 2 } }));
  const dec = buildDecision({ panel: { date, rows: lagRows }, evidence, prices, cal: cal.slice(0, 100) });
  const s = dec.scores.find((x) => x.ticker === top);
  const s0 = base.scores.find((x) => x.ticker === top);
  assert.ok(Math.abs(s.Z - 0.7 * s0.Z) < 1e-9 && s0.Z > 0);
  assert.equal(s.zModel, s0.Z);
  assert.equal(s.rrgPenalty, true);
  assert.equal(s.alpha5Pct, s0.alpha5Pct, "α theo Z mô hình");
  assert.ok(s.rank > s0.rank, "tụt hạng sau khi phạt");
  const others = dec.scores.filter((x) => x.ticker !== top && x.eligible).slice(0, 5);
  for (const o of others) assert.equal(o.rrgPenalty, false);
  const p = dec.portfolio.find((x) => x.ticker === top);
  if (p) assert.equal(p.rrgPenalty, true);
});

// F03 (13/11/2026): sổ Elite HL không có Z -> tiêu chí IC của E3 không bao giờ tính được; nhãn phải nói đúng là sổ MÔ TẢ.
import { hlLedgerSummary, HL_LEDGER_BASIS_VI } from "../src/market/elite/decisionService.js";
test("E4-HL sổ: nhãn THĂM DÒ mô tả (không hứa 'đủ 60 phiên'), kèm cơ sở chấm; số liệu chấm giữ nguyên như summarizeLedger", () => {
  const res = (ex) => ({ from: "2026-11-13", to: "2026-11-20", portfolioNet: ex, universeNet: 0, excess: ex, vnIndex: 0.01, ic: null, names: 100 });
  const entries = Array.from({ length: 70 }, (_, i) => ({ date: `d${String(i).padStart(3, "0")}`, holdings: [{ ticker: "A", weight: 0.1 }], results: { 5: res(0.01), 10: res(0.02) } }));
  const base = summarizeLedger(entries), s = hlLedgerSummary(entries);
  assert.equal(base.criteria.icPass, false); // không có IC -> tiêu chí E3 không thể đạt dù đã 70 phiên, lợi suất vượt dương
  assert.match(base.labelVi, /cần ≥ 60 phiên/); // nhãn cũ: lời hứa không có đường thành hiện thực với sổ HL
  assert.equal(s.kind, "ELITE_HL");
  assert.equal(s.label, "EXPERIMENTAL");
  assert.match(s.labelVi, /sổ mô tả của Elite HL \(70 phiên\)/);
  assert.doesNotMatch(s.labelVi, /cần ≥ 60 phiên/);
  assert.equal(s.basisVi, HL_LEDGER_BASIS_VI);
  assert.match(s.basisVi, /không tính phần tiền mặt/);
  assert.deepEqual(s.horizons, base.horizons);
});

// F08 / F11 (13/11/2026): lớp trình bày của GET /api/elite/decision — độ mới theo lịch phiên thật và ngưỡng hiển thị; không ghi vào KV.
test("E4-HL present(): freshness đếm số phiên đã đóng sau phiên của tài liệu; thêm tier1 + chi phí sổ; nguồn VN-Index lỗi -> null", async () => {
  const mk = (vnIndex) => createDecisionService({ store: createMemoryStore(), panel: { panel: async () => null }, evidence: { evidence: async () => null }, vnIndex, log: { warn() {} } });
  const vn = async () => [["2026-11-12", 1200], ["2026-11-13", 1210], ["2026-11-16", 1205], ["2026-11-17", 1215]];
  const doc = { date: "2026-11-13", version: "E4-HL v1", portfolio: [], hl: { rule: { slots: 10 } } };
  const p = await mk(vn).present(doc);
  assert.deepEqual(p.freshness, { latestSession: "2026-11-17", sessionsBehind: 2 });
  assert.deepEqual(p.hl.tier1, { lsLeaderPct: 80, taMin: 2, taModels: 7, maxScore: 10 });
  assert.equal(p.display.ledgerCostRoundTrip, COST_ROUND_TRIP);
  assert.equal(p.display.flowMinAdvBn, 10);
  assert.deepEqual([p.display.flowRrgPenalty, p.display.flowBufferRank, p.display.flowMaxPerSector, p.display.flowWeightCap], [0.3, 20, 3, 0.2]);
  assert.equal(doc.freshness, undefined); // tài liệu gốc (bản đã khoá / memo) không bị sửa
  assert.equal(doc.hl.tier1, undefined);
  assert.deepEqual((await mk(vn).present({ ...doc, date: "2026-11-17" })).freshness, { latestSession: "2026-11-17", sessionsBehind: 0 });
  assert.equal((await mk(async () => { throw new Error("nguồn lỗi"); }).present(doc)).freshness, null);
  assert.equal((await mk(vn).present(doc, { withFreshness: false })).freshness, undefined);
  assert.equal(await mk(vn).present(null), null);
});

// F03 (14/11/2026): thêm phép đo "tính cả tiền mặt" — KHÔNG đổi cách chấm chính thức.
test("sổ theo dõi: danh mục có tiền mặt — chấm chính thức giữ nguyên (quy về 100% cổ phiếu), thêm lợi suất danh mục thật tính cả tiền mặt", () => {
  const cal = ["d0", "d1", "d2", "d3", "d4", "d5", "d6"], px = new Map();
  const uni = Array.from({ length: 40 }, (_, i) => `U${i}`);
  for (const t of [...uni, "A", "B"]) { px.set(`${t}|d1`, 100); px.set(`${t}|d6`, t === "A" ? 110 : t === "B" ? 120 : 100); }
  const entry = { date: "d0", holdings: [{ ticker: "A", weight: 0.1 }, { ticker: "B", weight: 0.1 }], universe: uni };
  const r = evaluateEntry(entry, 5, px, cal, new Map([["d1", 1000], ["d6", 1010]]), 0.04);
  assert.ok(Math.abs(r.excess - 0.15) < 1e-12, "chấm chính thức: (0,1·10% + 0,1·20%) / 0,2 = 15% — không đổi");
  assert.ok(Math.abs(r.portfolioNet - (0.15 - COST_ROUND_TRIP)) < 1e-12);
  assert.equal(r.invested, 0.2);
  assert.ok(Math.abs(r.portfolioCashIncl - 0.03) < 1e-12, "danh mục thật: 80% tiền mặt -> +3%");
  const s = summarizeLedger([{ ...entry, results: { 5: r } }, { date: "old", holdings: [], results: { 5: { from: "a", to: "b", portfolioNet: 0, universeNet: 0, excess: 0.01, vnIndex: null, ic: null, names: 40 } } }]);
  assert.equal(s.horizons[5].n, 2);
  assert.deepEqual(s.horizons[5].cashIncl, { n: 1, meanPortfolio: r.portfolioCashIncl, meanInvested: 0.2, meanVnIndex: r.vnIndex }, "bản ghi cũ không có trường mới -> không tính vào");
  assert.equal(s.horizons[10].cashIncl, null);
});
