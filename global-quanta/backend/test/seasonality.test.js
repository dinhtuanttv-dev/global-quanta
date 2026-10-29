// MV1 — engine mùa vụ tháng SEAS-v1: lợi suất tháng (biên: thiếu tháng, MTD, phiên cuối < ngày 20), thống kê ô, hoán vị + FDR,
// co rút ngành × tháng, Beta-Binomial (đối chiếu nghiệm giải tích) và hợp đồng đầu ra.
import test from "node:test";
import assert from "node:assert/strict";
import { monthEnds, monthlyReturns, wilson, describe } from "../src/market/seasonality/monthly.js";
import { benjaminiHochberg, betweenMonthVariance, seasonalStrength, seedOf } from "../src/market/seasonality/strength.js";
import { betaBinomialPosterior, estimatePriorFromRates, regularizedIncompleteBeta } from "../src/market/seasonality/betaBinomial.js";
import { analyzeSeasonality, sampleYears } from "../src/market/seasonality/analyze.js";

/** Chuỗi ngày làm việc với lợi suất tháng định trước: monthly(y, m) -> r (m 0..11). */
function series(from, to, monthly, { skip = () => false } = {}) {
  const bars = [];
  let px = 100, lastYm = null, days = [];
  const flush = () => {
    if (!days.length) return;
    const [y, m] = lastYm.split("-").map(Number);
    const r = monthly(y, m - 1);
    const daily = (1 + r) ** (1 / days.length);
    for (const d of days) { px *= daily; bars.push({ date: d, close: Math.round(px * 1e6) / 1e6 }); }
    days = [];
  };
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const w = d.getUTCDay(); if (w === 0 || w === 6) continue;
    const iso = d.toISOString().slice(0, 10);
    if (skip(iso)) continue;
    const ym = iso.slice(0, 7);
    if (ym !== lastYm) { flush(); lastYm = ym; }
    days.push(iso);
  }
  flush();
  return bars;
}

test("lợi suất tháng: phiên cuối tháng -> phiên cuối tháng; tháng đang chạy là MTD, không vào mẫu", () => {
  const bars = series("2025-11-03", "2026-02-12", (y, m) => (m === 0 ? 0.1 : m === 11 ? -0.05 : 0.02));
  const r = monthlyReturns(bars, { asOf: "2026-02-12" });
  assert.ok(Math.abs(r.returns.get("2025-12") - -0.05) < 1e-6);
  assert.ok(Math.abs(r.returns.get("2026-01") - 0.1) < 1e-6);
  assert.equal(r.returns.has("2025-11"), false, "tháng đầu không có cơ sở tháng trước");
  assert.equal(r.returns.has("2026-02"), false);
  assert.equal(r.mtd.ym, "2026-02");
  assert.ok(Math.abs(r.mtd.r - 0.02) < 1e-6, "tháng 2 đủ 10 phiên đầu đã tích luỹ toàn bộ 2% của tháng tổng hợp");
});

test("tháng có phiên cuối trước ngày 20 (dữ liệu dừng giữa tháng) -> không có quan sát, cũng không làm cơ sở cho tháng sau", () => {
  const bars = series("2025-01-01", "2025-06-30", () => 0.01, { skip: (d) => d >= "2025-03-12" && d <= "2025-03-31" });
  const ends = monthEnds(bars);
  assert.equal(ends.get("2025-03").valid, false);
  const r = monthlyReturns(bars, { asOf: "2025-07-15" });
  assert.equal(r.returns.has("2025-03"), false);
  assert.equal(r.returns.has("2025-04"), false);
  assert.ok(r.returns.has("2025-05"));
});

test("Wilson 90% và mô tả ô: trung vị, x/n, n = 0 -> null (không bao giờ thành 0)", () => {
  const [lo, hi] = wilson(3, 5);
  // p = 0,6, n = 5, z = 1,6449: (p + z²/2n ± z·√(p(1−p)/n + z²/4n²)) / (1 + z²/n)
  assert.ok(Math.abs(lo - 0.272483) < 1e-5 && Math.abs(hi - 0.857294) < 1e-5, `${lo} ${hi}`);
  assert.equal(wilson(0, 0), null);
  const d = describe([0.03, -0.01, 0.05, 0.02]);
  assert.equal(d.n, 4); assert.equal(d.positive, 3); assert.ok(Math.abs(d.median - 0.025) < 1e-12);
  assert.deepEqual(describe([]), { n: 0, mean: null, median: null, min: null, max: null, positive: 0, positiveCi: null });
});

test("Beta: I_x(2,3) khớp nghiệm giải tích; hậu nghiệm Beta(1,1)+3/1 thắng -> TB 4/6; prior mô-men có trần", () => {
  for (const x of [0.1, 0.35, 0.5, 0.8]) {
    const closed = 6 * x * x - 8 * x ** 3 + 3 * x ** 4; // I_x(2,3) = ∫₀ˣ 12 t(1−t)² dt
    assert.ok(Math.abs(regularizedIncompleteBeta(x, 2, 3) - closed) < 1e-10, `x=${x}`);
  }
  const post = betaBinomialPosterior(3, 1, 1, 1, 0.9);
  assert.ok(Math.abs(post.mean - 4 / 6) < 1e-12);
  assert.ok(post.ci[0] < post.mean && post.ci[1] > post.mean);
  const pr = estimatePriorFromRates([0.4, 0.6, 0.5, 0.5, 0.45], 10);
  assert.ok(pr.alpha0 + pr.beta0 <= 10 + 1e-9);
  assert.deepEqual(estimatePriorFromRates([]), { alpha0: 1, beta0: 1 });
});

test("hoán vị: mùa vụ dựng sẵn -> p nhỏ; nhiễu -> p lớn; seed cố định -> cùng p; BH-FDR", () => {
  const strong = [2021, 2022, 2023, 2024, 2025].map((y) => Array.from({ length: 12 }, (_, m) => (m === 3 ? 0.08 : -0.01) + ((y * 7 + m * 13) % 5) / 1000));
  const rng = (s) => () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 - 0.5; };
  const r1 = rng(42);
  const noise = [2021, 2022, 2023, 2024, 2025].map(() => Array.from({ length: 12 }, () => r1() * 0.1));
  const a = seasonalStrength(strong, { permutations: 999, seed: seedOf("A") });
  const b = seasonalStrength(noise, { permutations: 999, seed: seedOf("B") });
  assert.ok(a.p < 0.01, `p mạnh ${a.p}`);
  assert.ok(b.p > 0.05, `p nhiễu ${b.p}`);
  assert.equal(seasonalStrength(strong, { permutations: 999, seed: seedOf("A") }).p, a.p);
  assert.equal(seasonalStrength([[0.01, null, null]], {}).p, null, "thiếu dữ liệu -> null");
  assert.ok(betweenMonthVariance(strong) > betweenMonthVariance(noise));
  const q = benjaminiHochberg([0.01, 0.04, null, 0.03, 0.5]);
  assert.equal(q[2], null);
  assert.ok(Math.abs(q[0] - 0.04) < 1e-12 && Math.abs(q[1] - 0.04 * 4 / 3 * 1) < 0.02 && q[4] === 0.5);
});

test("analyzeSeasonality: 5 năm dương lịch hoàn tất, n/5, năm nay + MTD tách riêng, co rút về ngành, xác suất có prior bỏ chính mã", () => {
  assert.deepEqual(sampleYears("2026-10-29"), [2021, 2022, 2023, 2024, 2025]);
  const bench = series("2020-03-02", "2026-10-28", () => 0.01);
  const seriesOf = new Map();
  const sectorOf = new Map();
  // Ngành X: 4 mã, tháng 4 luôn vượt VN-Index 6%; mã AAA thêm tháng 12 vượt 10%.
  for (const t of ["AAA", "BBB", "CCC", "DDD"]) {
    seriesOf.set(t, series("2020-03-02", "2026-10-28", (y, m) => 0.01 + (m === 3 ? 0.06 : 0) + (t === "AAA" && m === 11 ? 0.1 : 0) + ((t.charCodeAt(0) + y + m) % 3 - 1) / 500));
    sectorOf.set(t, "X");
  }
  // Mã niêm yết muộn (từ 2023): n < 5 cho các năm trước.
  seriesOf.set("NEW", series("2023-01-02", "2026-10-28", () => 0.01));
  sectorOf.set("NEW", "Y");
  const res = analyzeSeasonality({ seriesOf, benchBars: bench, sectorOf, asOf: "2026-10-29", cfg: { ...(awaitCfg()), permutations: 299 } });
  assert.equal(res.version, "SEAS-v1.1");
  assert.deepEqual(res.years, [2021, 2022, 2023, 2024, 2025]);
  const aaa = res.items.find((i) => i.ticker === "AAA");
  const apr = aaa.months[3], dec = aaa.months[11];
  assert.equal(apr.n, 5); assert.equal(apr.expected, 5);
  assert.ok(apr.excess.mean > 0.055 && apr.excess.mean < 0.07, `${apr.excess.mean}`);
  assert.equal(apr.priorScope, "SECTOR");
  assert.ok(apr.prob.mean > 0.75, `P tháng 4 ${apr.prob.mean}`);
  assert.equal(apr.prob.wins + apr.prob.losses, 5);
  assert.ok(dec.shrunkExcess < dec.excess.mean, "tháng 12 riêng AAA bị co về ngành (không có ở mã khác)");
  assert.ok(aaa.current.length === 9 && aaa.current[0].month === 1, "năm nay: các tháng đã đóng 1–9");
  assert.equal(aaa.mtd.ym, "2026-10");
  const nw = res.items.find((i) => i.ticker === "NEW");
  assert.equal(nw.months[0].n, 2, "NEW (niêm yết 02/01/2023): tháng 1/2023 không có phiên cuối 12/2022 làm cơ sở -> chỉ 2024, 2025");
  assert.equal(nw.months[1].n, 3, "NEW: tháng 2 có 2023–2025");
  assert.equal(nw.months[0].lowSample, true);
  assert.equal(nw.months[0].priorScope, "UNIVERSE", "ngành Y không đủ 3 mã khác -> prior toàn universe");
  assert.ok(aaa.strength.p != null && aaa.strength.q != null);
  assert.ok(["CLEAR", "WEAK", "NOISE", "INSUFFICIENT"].includes(aaa.strength.label));
});

function awaitCfg() { return { version: "SEAS-v1.1", years: 5, monthEndMinDay: 20, roundTripCost: 0.004, permutations: 299, fdrQ: 0.1, level: 0.9, priorStrength: 10, minSectorPeers: 3, lowSampleN: 4 }; }

test("ORACLE: engine JS khớp bản Python độc lập (scripts/seasonality-oracle.py, Beta = scipy betaincinv) trên 14 mã × 12 tháng", async () => {
  const fs = await import("node:fs");
  const { buildSeasonalityFixture } = await import("../scripts/seasonality-fixture.mjs");
  const { SEAS } = await import("../src/market/seasonality/config.js");
  const exp = JSON.parse(fs.readFileSync(new URL("./fixtures/seasonality-oracle.json", import.meta.url), "utf8"));
  const inp = buildSeasonalityFixture();
  const res = analyzeSeasonality({ seriesOf: new Map(inp.tickers.map((t) => [t.ticker, t.bars])), sectorOf: new Map(inp.tickers.map((t) => [t.ticker, t.sector])), benchBars: inp.bench, asOf: inp.asOf, cfg: { ...SEAS, permutations: exp.permutations } });
  const bad = [];
  let checks = 0;
  const near = (a, b, tol, what) => { checks++; if (a == null && b == null) return; if (a == null || b == null || Math.abs(a - b) > tol) bad.push(`${what}: js=${a} py=${b}`); };
  for (const e of exp.items) {
    const j = res.items.find((i) => i.ticker === e.ticker);
    near(j.strength.S, e.S, 1e-12, `${e.ticker} S`); near(j.strength.p, e.p, 0, `${e.ticker} p`); near(j.strength.q, e.q, 1e-12, `${e.ticker} q`);
    near(j.mtd?.r, e.mtd?.r, 1e-12, `${e.ticker} mtd`);
    e.months.forEach((em, m) => {
      const jm = j.months[m], t = `${e.ticker} T${m + 1}`;
      near(jm.n, em.n, 0, `${t} n`);
      for (const k of ["mean", "median", "positive"]) { near(jm.ret[k], em.ret[k], 1e-12, `${t} ret.${k}`); near(jm.excess[k], em.excess[k], 1e-12, `${t} ex.${k}`); }
      near(jm.ret.positiveCi?.[0], em.ret.positiveCi?.[0], 1e-12, `${t} wilson`); near(jm.ret.positiveCi?.[1], em.ret.positiveCi?.[1], 1e-12, `${t} wilson`);
      near(jm.shrunkExcess, em.shrunkExcess, 1e-12, `${t} shrunk`);
      near(jm.prob?.mean, em.prob?.mean, 1e-12, `${t} P`); near(jm.prob?.wins, em.prob?.wins, 0, `${t} wins`); near(jm.prob?.prior.alpha0, em.prob?.alpha0, 1e-12, `${t} α0`);
      near(jm.prob?.ci[0], em.prob?.ci[0], 2e-6, `${t} ci`); near(jm.prob?.ci[1], em.prob?.ci[1], 2e-6, `${t} ci`);
      if ((jm.prob?.prior.scope ?? null) !== (em.prob?.scope ?? null)) bad.push(`${t} scope`);
    });
  }
  assert.ok(checks > 2500);
  assert.deepEqual(bad, []);
});

test("v1.1 HỒI QUY: co rút KHÔNG đảo hạng — tín hiệu rõ giữ hạng thô; co toàn phần -> dự báo PHẲNG (v1: ngược hạng)", async () => {
  const { spearman } = await import("../src/market/seasonality/validate.js");
  const { mulberry32 } = await import("../src/market/seasonality/strength.js");
  const run = (scale, vol, seed) => {
    const rng = mulberry32(seed);
    const g = () => { const u = Math.max(1e-12, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    const mk = (fx) => { const out = []; let px = 50; for (let d = new Date("2020-11-02T00:00:00Z"); d <= new Date("2026-01-10T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) { const w = d.getUTCDay(); if (w === 0 || w === 6) continue; px *= Math.exp(fx(d.getUTCMonth()) / 21 + vol * g()); out.push({ date: d.toISOString().slice(0, 10), close: px }); } return out; };
    // 30 mã KHÔNG có ngành (phạm vi toàn universe — đúng trường hợp chỉ số ngành), hiệu ứng tháng 3 riêng từng mã.
    const effects = Array.from({ length: 30 }, () => scale * g());
    const seriesOf = new Map(effects.map((e, i) => [`T${i}`, mk((m) => (m === 2 ? e : 0))]));
    const res = analyzeSeasonality({ seriesOf, benchBars: mk(() => 0), sectorOf: null, asOf: "2026-01-15", cfg: { ...awaitCfg(), permutations: 0 } });
    return { effects, raw: res.items.map((i) => i.months[2].excess.mean), shrunk: res.items.map((i) => i.months[2].shrunkExcess), w: res.items.map((i) => i.months[2].shrinkWeight) };
  };
  const clear = run(0.08, 0.005, 77); // hiệu ứng lớn, nhiễu nhỏ -> τ² > 0
  assert.ok(clear.w.every((w) => w > 0.5));
  assert.ok(spearman(clear.raw, clear.shrunk) > 0.99, `giữ hạng thô (ρ = ${spearman(clear.raw, clear.shrunk)})`);
  assert.ok(spearman(clear.effects, clear.shrunk) > 0.9, "cùng chiều hiệu ứng thật");
  const noisy = run(0.005, 0.03, 78); // nhiễu át hiệu ứng -> co toàn phần
  assert.ok(noisy.w.every((w) => w === 0));
  assert.ok(Math.max(...noisy.shrunk) - Math.min(...noisy.shrunk) < 1e-12, "co toàn phần: mọi dự báo bằng nhau (không mang hạng ngược)");
});
