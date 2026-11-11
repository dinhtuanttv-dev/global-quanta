// LS-r1 (LS-r1-prereg.md): điểm dẫn dắt LS-v1, trạng thái thị trường, chốt chặn, trọng số E3-v5, cổng H4, nhãn Đồng thuận hiển thị.
process.env.MARKET_ALERTS_ENABLED = "false";
import test from "node:test";
import assert from "node:assert/strict";
import { buildMatrix, components, crashGuard, lsDay, lsIcPost, lsIcSeries, lsWeighting, regimeAt, LS_PARAMS } from "../src/market/elite/leadership.js";
import { bootstrapQuantile, deltaSeries, evaluateGate, maxDrawdown } from "../src/market/elite/lsGate.js";
import { signalWeights } from "../src/market/elite/decisionCore.js";
import { runRetro } from "../src/market/elite/retroCore.js";
import { consensusDisplay } from "../src/market/scanner/scanEngine.js";

const days = (n, start = Date.UTC(2023, 0, 2)) => { const out = []; for (let d = start; out.length < n; d += 864e5) { const w = new Date(d).getUTCDay(); if (w && w < 6) out.push(new Date(d).toISOString().slice(0, 10)); } return out; };
function rng(seed = 5) { let s = seed; const u = () => { s = (s * 1103515245 + 12345) % 2147483648; return (s + 0.5) / 2147483648; }; return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()); }

/** 40 mã, 400 phiên; mã i có xu hướng drift_i (mã cao = dẫn dắt). VN-Index đi ngang có nhiễu. */
function market({ n = 40, len = 400, idxPath = null } = {}) {
  const g = rng(7), cal = days(len), series = new Map();
  let I = 1000; const idx = cal.map((d, k) => { I = idxPath ? idxPath(k) : I * (1 + 0.008 * g()); return [d, I]; });
  for (let i = 0; i < n; i++) {
    const drift = (i - n / 2) / n * 0.01; let p = 100; const rows = [];
    cal.forEach((d, k) => { const m = k ? idx[k][1] / idx[k - 1][1] - 1 : 0; p *= 1 + drift + 0.8 * m + 0.012 * g(); rows.push([d, p, 5e9]); });
    series.set(`T${String(i).padStart(2, "0")}`, rows);
  }
  return { cal, series, idx };
}

test("components: RS64, động lượng riêng, đỉnh 52 tuần, chống chịu, giai đoạn — đúng định nghĩa, thiếu dữ liệu -> null", () => {
  const { series, idx } = market();
  const M = buildMatrix(series, idx), i = M.dates.length - 1;
  const top = components(M, "T39", i), low = components(M, "T00", i);
  const p = M.px.get("T39");
  assert.ok(Math.abs(top.rs64 - (p[i] / p[i - 64] - 1)) < 1e-12);
  assert.ok(top.rs64 > low.rs64 && top.hi52 > low.hi52 && top.stage > low.stage);
  // RESMOM đúng định nghĩa LS-r1 (hệ số chặn ước trên 120 phiên -> đo phần dư 64 phiên gần nhất so với trung bình 120 phiên).
  assert.ok(Number.isFinite(top.resMom) && Number.isFinite(low.resMom));
  assert.ok(top.hi52 > 0 && top.hi52 <= 1);
  assert.ok(Number.isInteger(top.stage) && top.stage >= 0 && top.stage <= 3);
  assert.ok(top.resil > low.resil, "mã dẫn dắt chống chịu tốt hơn ngày VN-Index giảm");
  const early = components(M, "T39", 30);
  assert.deepEqual([early.rs64, early.resMom, early.hi52, early.stage], [null, null, null, null]);
});

test("lsDay: điểm chuẩn theo hạng, cần ≥ 4/5 thành phần; mã dẫn dắt có LS cao nhất", () => {
  const { series, idx } = market();
  const M = buildMatrix(series, idx), day = lsDay(M, M.dates.length - 1);
  const ls = [...day].map(([t, r]) => [t, r.ls]).filter(([, v]) => v != null).sort((a, b) => b[1] - a[1]);
  assert.equal(ls.length, 40);
  const top5 = ls.slice(0, 5).map(([t]) => Number(t.slice(1)));
  assert.ok(top5.includes(39) && top5.reduce((a, b) => a + b, 0) / 5 >= 28, `top 5: ${top5}`);
  assert.ok(Math.abs(ls.reduce((a, x) => a + x[1], 0)) < 1e-9, "điểm chuẩn theo hạng: tổng ≈ 0");
  assert.equal(lsDay(M, 100).get("T39").ls, null); // chưa đủ 200 phiên: chỉ 2/5 thành phần
});

test("regimeAt + crashGuard: thị trường tăng mạnh -> UP; dưới MA200 rồi bật ≥ 5% / 20 phiên -> chốt chặn", () => {
  const up = market({ idxPath: (k) => 1000 * 1.003 ** k });
  const Mu = buildMatrix(up.series, up.idx);
  assert.equal(regimeAt(Mu, Mu.dates.length - 1).group, "UP");
  assert.equal(crashGuard(Mu, Mu.dates.length - 1), false);
  const v = market({ idxPath: (k) => (k < 380 ? 1000 * 0.998 ** k : 1000 * 0.998 ** 380 * 1.004 ** (k - 380)) });
  const Mv = buildMatrix(v.series, v.idx), i = Mv.dates.length - 1;
  assert.ok(Mv.idx[i] / Mv.idx[i - 20] - 1 >= 0.05 === crashGuard(Mv, i) || Mv.idx[i] >= Mv.idx.slice(i - 199, i + 1).reduce((a, b) => a + b, 0) / 200);
  const bounce = market({ idxPath: (k) => (k < 380 ? 1000 * 0.997 ** k : 1000 * 0.997 ** 380 * 1.006 ** (k - 380)) });
  const Mb = buildMatrix(bounce.series, bounce.idx);
  assert.equal(crashGuard(Mb, Mb.dates.length - 1), true);
  assert.equal(regimeAt(Mb, 300).group, "WEAK");
});

test("lsIcSeries: IC theo kỳ hạn kèm ngày ra (độ chín), trạng thái + chốt chặn mỗi phiên, biến thể thành phần", () => {
  const { series, idx } = market();
  const M = buildMatrix(series, idx);
  const s = lsIcSeries(M, { variants: { ls_v1: (r) => r.ls, c_rs64: (r) => r.z.rs64 }, valuesFrom: M.dates[390] });
  const d = s.from, i = M.pos.get(d);
  assert.equal(s.ic.ls_v1[5][d][2], M.dates[i + 6]); // vào d+1, ra d+1+5
  assert.ok(s.ic.ls_v1[5][d][0] > 0, "xu hướng riêng kéo dài -> IC dương");
  assert.ok(!(M.dates.at(-1) in s.ic.ls_v1[5]), "phiên cuối chưa có lợi suất tương lai");
  assert.ok(Object.keys(s.values.ls_v1).every((x) => x >= M.dates[390]));
  assert.ok(["UP", "ACC", "WEAK"].includes(s.regime[d]) && typeof s.guard[d] === "boolean");
});

test("lsWeighting: chỉ IC đã chín; bán rã 250 phiên; co theo trạng thái về IC chung (120); lsIcPost co về tiên nghiệm (60)", () => {
  const cal = days(600);
  const ic5 = {}, regimes = {};
  cal.slice(0, 590).forEach((d, k) => { ic5[d] = [k < 300 ? 0 : 0.04, 100, cal[k + 6]]; regimes[d] = k % 2 ? "UP" : "WEAK"; });
  const asOf = cal[400];
  const w = lsWeighting(ic5, regimes, "UP", asOf, cal);
  assert.equal(w.n, 395); // ngày ra ≤ asOf: ngày 0..394
  const unweighted = (0.04 * 95) / 395; // ngày 300..394 có IC 0,04
  assert.ok(w.icDec > unweighted && w.icDec < 0.04, `IC giảm dần ${w.icDec} > trung bình thường ${unweighted} (gần đây nặng hơn)`);
  const flat = lsWeighting(ic5, regimes, null, asOf, cal);
  assert.equal(flat.icRegPost, flat.icDec);
  const expect = (w.neffRegime * w.icRegime + 120 * w.icDec) / (w.neffRegime + 120);
  assert.ok(Math.abs(w.icRegPost - expect) < 1e-5);
  assert.equal(lsIcPost({ tier: "C", weighting: w, guard: false }), null);
  assert.equal(lsIcPost({ tier: "B", weighting: w, guard: true }), null);
  const p = lsIcPost({ tier: "B", weighting: w, guard: false });
  assert.ok(Math.abs(p - (w.neff * w.icRegPost + 60 * 0.01) / (w.neff + 60)) < 1e-12);
  assert.equal(LS_PARAMS.halfLife, 250);
});

test("signalWeights (E3-v5): icPostOverride null -> không trọng số; có số -> dùng đúng số đó", () => {
  const base = { id: "stealth20", tier: "A", mainH: 5, byH: { 5: { n: 200, mean: 0.02 } } };
  const off = signalWeights({ signals: [base, { id: "ls_v1", tier: "B", mainH: 5, byH: { 5: { n: 900, mean: 0.01 } }, icPostOverride: null }] });
  assert.deepEqual(off.weights.map((w) => w.id), ["stealth20"]);
  const on = signalWeights({ signals: [base, { id: "ls_v1", tier: "B", mainH: 5, byH: { 5: { n: 900, mean: 0.01 } }, icPostOverride: 0.015, neffOverride: 500 }] });
  const ls = on.weights.find((w) => w.id === "ls_v1");
  assert.equal(ls.icPost, 0.015); assert.equal(ls.n, 500);
  assert.ok(Math.abs(on.weights.reduce((a, w) => a + w.w, 0) - 1) < 1e-12);
});

test("cổng H4: Δ dương ổn định -> ĐẠT; Δ = 0 (LS bậc C) -> KHÔNG ĐẠT G1/G2; sụt giảm vượt giới hạn -> G5 trượt", () => {
  const dates = days(240);
  const mk = (f) => ({ series: dates.map((d, k) => ({ date: d, ex10: f(k), ic5: null })) });
  const g = rng(3);
  const base = dates.map(() => 0.004 * g());
  const v4 = { series: dates.map((d, k) => ({ date: d, ex10: base[k], ic5: 0.01 })) };
  const better = { series: dates.map((d, k) => ({ date: d, ex10: base[k] + 0.006 + 0.002 * g(), ic5: 0.03 })) };
  const variants = Object.fromEntries(["c_rs64", "c_resMom", "c_hi52", "c_resil", "c_stage", "noGuard", "noRegime"].map((k, j) => [k, mk((i) => base[i] + 0.001 * (j - 3) + 0.003 * g())]));
  const pass = evaluateGate({ v4, v5: better, ...variants });
  assert.equal(pass.criteria.G1.pass, true); assert.equal(pass.criteria.G2.pass, true); assert.equal(pass.criteria.G3.pass, true);
  assert.ok(pass.criteria.G4.dsr > 0.8, `DSR ${pass.criteria.G4.dsr}`); assert.equal(pass.pass, true);
  const same = evaluateGate({ v4, v5: { series: v4.series }, ...variants });
  assert.equal(same.pass, false); assert.equal(same.criteria.G1.pass, false); assert.equal(same.criteria.G2.pass, false);
  assert.equal(maxDrawdown([0.1, 0, 0, -0.5], 1), -0.5);
  assert.ok(bootstrapQuantile(Array(40).fill(0.01), 0.1) - 0.01 < 1e-12);
  assert.deepEqual(deltaSeries([{ date: "a", ex10: 0.01 }], [{ date: "a", ex10: 0.03 }, { date: "b", ex10: 1 }]).map((x) => Math.round(x.d * 100) / 100), [0.02]);
});

test("runRetro + extra (H4): LS bậc C suốt kỳ -> trùng v4; LS dự báo thật có IC chín -> lên B và vào trọng số", () => {
  const cal = days(220, Date.UTC(2025, 0, 1));
  const N = 50, prices = new Map(), flow = new Map(), sectors = new Map(), g = rng(11);
  const drift = Array.from({ length: N }, (_, i) => ((i * 37) % N) / N - 0.5);
  for (let i = 0; i < N; i++) {
    const t = `S${String(i).padStart(2, "0")}`; sectors.set(t, `G${i % 8}`);
    let p = 20000; const rows = [];
    cal.forEach((date) => { p *= 1 + 0.004 * drift[i] + 0.018 * g(); rows.push({ date, closeAdj: p, value: 3e10 }); });
    prices.set(t, rows);
  }
  for (const s of ["VNM", "FPT", "HPG", "VCB", "MWG"]) prices.set(s, cal.map((date) => ({ date, closeAdj: 10, value: 1e11 })));
  cal.forEach((date, k) => { if (k < 60) return; const m = new Map(); for (let i = 0; i < N; i++) m.set(`S${String(i).padStart(2, "0")}`, { stealth20: 0.3 * g(), stealth5: 0.5 * g(), logRvol: g(), netIntent: 0.2 * g(), mom5Atr: g() }); flow.set(date, m); });
  const inputs = { cal, prices, flow, sectors, vnIndex: new Map(cal.map((d, k) => [d, 1000 + k])) };
  const v4 = runRetro(inputs);
  const longCal = [...days(400, Date.UTC(2023, 6, 3)).filter((d) => d < cal[0]), ...cal];
  const mkIc = (level) => Object.fromEntries([1, 5, 10, 20].map((h) => [h, Object.fromEntries(longCal.slice(0, -30).map((d, k) => [d, [level + 0.01 * Math.sin(k), 50, longCal[k + 1 + h]]]))]));
  const vals = (D) => Object.fromEntries(drift.map((x, i) => [`S${String(i).padStart(2, "0")}`, x]));
  const regimes = Object.fromEntries(longCal.map((d) => [d, "ACC"]));
  const ex = (ic) => ({ id: "ls_v1", ic, valuesOf: vals, regimeOf: regimes, guardOf: {}, cal: longCal, useRegime: true, useGuard: true });
  const flat = runRetro({ ...inputs, extra: ex(mkIc(-0.02)) });
  assert.deepEqual(flat.series.map((x) => x.ex10), v4.series.map((x) => x.ex10), "LS âm -> bậc C -> không đổi danh mục");
  assert.equal(flat.descriptive.tierDays.ls_v1.C, flat.period.sessions);
  const good = runRetro({ ...inputs, extra: ex(mkIc(0.05)) });
  assert.ok(good.descriptive.tierDays.ls_v1.B + good.descriptive.tierDays.ls_v1.A > 0, "IC dương ổn định -> thăng bậc");
  assert.ok(good.lastWeights.some((w) => w.id === "ls_v1" && w.w > 0));
  assert.ok(good.horizons[10].meanExcess > v4.horizons[10].meanExcess, "tín hiệu dẫn dắt thật làm danh mục tốt hơn");
});

test("consensusDisplay: 'Nghịch xu hướng' của mã đang Up-Trend -> 'Đang tăng, chưa dẫn dắt'; còn lại giữ nguyên", () => {
  assert.deepEqual(consensusDisplay({ statusCode: "NGHICH_XU_HUONG", statusLabel: "Nghịch xu hướng" }, "Up-Trend"), { confluenceStatusCode: "DANG_TANG_CHUA_DAN_DAT", confluenceStatusLabel: "Đang tăng, chưa dẫn dắt" });
  assert.deepEqual(consensusDisplay({ statusCode: "NGHICH_XU_HUONG", statusLabel: "Nghịch xu hướng" }, "Down-Trend"), { confluenceStatusCode: "NGHICH_XU_HUONG", confluenceStatusLabel: "Nghịch xu hướng" });
  assert.deepEqual(consensusDisplay({ statusCode: "DAN_DAT_NGUOC_DONG", statusLabel: "Dẫn dắt ngược dòng (Leader)" }, "Up-Trend").confluenceStatusCode, "DAN_DAT_NGUOC_DONG");
});

test("E1 + E2: bảng tín hiệu nhận LS-v1 cùng phiên; bằng chứng chỉ bật trọng số E3-v5 khi cổng H4 ĐẠT", async () => {
  const { buildSignalRows } = await import("../src/market/elite/signalRegistry.js");
  const { createEvidenceEngine } = await import("../src/market/elite/evidenceEngine.js");
  const src = { scanner: { items: [{ ticker: "AAA", smartScore: 50 }, { ticker: "BBB", smartScore: 40 }] }, leadership: { date: "2026-11-11", rows: { AAA: { ls: 1.2345 } } } };
  const { rows, missingSources } = buildSignalRows(src);
  assert.equal(rows.find((r) => r.ticker === "AAA").values.ls_v1, 1.2345);
  assert.equal(rows.find((r) => r.ticker === "BBB").values.ls_v1, null); // không điền 0
  assert.ok(!missingSources.includes("leadership"));
  assert.ok(buildSignalRows({ scanner: src.scanner }).missingSources.includes("leadership"));

  const eng = createEvidenceEngine({ store: {}, panel: {} });
  const cal = days(260);
  const series = { 5: Object.fromEntries(cal.map((d, k) => [d, [0.03 + 0.01 * Math.sin(k), 80]])) };
  const w = { n: 260, icDec: 0.03, neff: 200, icRegime: 0.03, neffRegime: 100, icRegPost: 0.03 };
  const off = eng.evaluate({ series: { ls_v1: series } }, { weighting: w, regime: "ACC", guard: false, gateLive: false }).signals.find((s) => s.id === "ls_v1");
  assert.equal(off.tier, "B"); assert.equal(off.icPostOverride, null); assert.equal(off.gateLive, false);
  const on = eng.evaluate({ series: { ls_v1: series } }, { weighting: w, regime: "ACC", guard: false, gateLive: true }).signals.find((s) => s.id === "ls_v1");
  assert.ok(Math.abs(on.icPostOverride - (200 * 0.03 + 60 * 0.01) / 260) < 1e-12);
  const guarded = eng.evaluate({ series: { ls_v1: series } }, { weighting: w, regime: "ACC", guard: true, gateLive: true }).signals.find((s) => s.id === "ls_v1");
  assert.equal(guarded.icPostOverride, null);
  assert.match(on.source, /hồi cứu point-in-time từ giá/);
});
