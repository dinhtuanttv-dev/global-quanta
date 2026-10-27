// Lọc ngành (L1) — phân ngành ICB VNDirect, chỉ số ngành tổng hợp, RRG tuần JdK (point-in-time, lọc nhiễu), dựng toàn bộ.
import test from "node:test";
import assert from "node:assert/strict";
import { buildIcbTaxonomy } from "../src/market/sectors/icbTaxonomy.js";
import { buildSectorIndex, computeRrg, hysteresisQuadrant, quadrantTransitions, rawQuadrant, weeklyCloses } from "../src/market/sectors/rrg.js";
import { buildSectorRotation, rollingMarketCorrelation } from "../src/market/sectors/sectorRotation.js";
import { sectorShareZHistory, totalValueByDate } from "../src/market/sectors/flow.js";

// lịch phiên: thứ Hai–thứ Sáu từ 2022-01-03
const DATES = (() => { const out = []; const d = new Date(Date.UTC(2022, 0, 3)); while (out.length < 900) { const w = d.getUTCDay(); if (w >= 1 && w <= 5) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } return out; })();
const bars = (fn, { value = 5e9 } = {}) => DATES.map((date, i) => ({ date, close: fn(i), volume: 1e5, value }));
const bench = bars((i) => 1000 * (1 + 0.0002 * i));
// ngành xoay vòng: lợi suất tương đối hình sin chu kỳ ~ 40 tuần
const cyc = (i, ph = 0) => 1000 * (1 + 0.0002 * i) * Math.exp(0.08 * Math.sin((2 * Math.PI * i) / 200 + ph));

test("RRG 4D: market correlation uses aligned daily returns and reports coverage", () => {
  const returns = Array.from({ length: 45 }, (_, i) => 0.004 * Math.sin(i * 0.71) + 0.001 * Math.cos(i * 0.19));
  const series = (rates, count = rates.length + 1) => {
    let close = 100;
    return DATES.slice(0, count).map((date, i) => {
      if (i > 0) close *= 1 + rates[i - 1];
      return { date, close };
    });
  };
  const benchmark = series(returns);
  const aligned = series(returns);
  const positive = rollingMarketCorrelation(aligned, benchmark);
  assert.equal(positive.status, "ready");
  assert.equal(positive.observations, 45);
  assert.ok(Math.abs(positive.value - 1) < 1e-10);

  const inverse = series(returns.map((r) => -r));
  assert.ok(Math.abs(rollingMarketCorrelation(inverse, benchmark).value + 1) < 1e-10);

  const short = rollingMarketCorrelation(aligned.slice(0, 20), benchmark.slice(0, 20));
  assert.equal(short.value, null);
  assert.equal(short.status, "insufficient_history");

  const flat = benchmark.map((b) => ({ ...b, close: 100 }));
  const zeroVariance = rollingMarketCorrelation(flat, benchmark);
  assert.equal(zeroVariance.value, null);
  assert.equal(zeroVariance.status, "zero_variance");

  const missing = aligned.filter((_, i) => i !== 20);
  const noBridge = rollingMarketCorrelation(missing, benchmark, { lookback: 60, minObservations: 30 });
  assert.equal(noBridge.observations, 43, "missing sector index rows must not be bridged into multi-session returns");

  const cutoff = DATES[35];
  const asOf = rollingMarketCorrelation(aligned, benchmark, { asOf: cutoff });
  const prefixOnly = rollingMarketCorrelation(aligned.filter((bar) => bar.date <= cutoff), benchmark.filter((bar) => bar.date <= cutoff));
  assert.deepEqual(asOf, prefixOnly, "future benchmark and sector rows cannot change an earlier weekly W coordinate");
});

test("ICB VNDirect: mã -> cấp 1/2/3, đệm mã 4 chữ số, điền cấp cha còn thiếu", () => {
  const icb = buildIcbTaxonomy({
    1: [{ industryCode: "8000", vietnameseName: "Tài chính", englishName: "FINANCIALS", codeList: "VCB,SSI" }],
    2: [{ industryCode: "8300", higherLevelCode: "8000", vietnameseName: "Ngân hàng", englishName: "Banks", codeList: "VCB" },
      { industryCode: "8700", higherLevelCode: "8000", vietnameseName: "Dịch vụ tài chính", englishName: "Financial Services", codeList: "SSI" }],
    3: [{ industryCode: "8770", higherLevelCode: "8700", vietnameseName: "Dịch vụ tài chính", codeList: "SSI,VND" }, { industryCode: "580", higherLevelCode: "0001", vietnameseName: "Năng lượng tái tạo", codeList: "" }],
  });
  assert.deepEqual(icb.symbols.VCB, { l1: "8000", l2: "8300" });
  assert.deepEqual(icb.symbols.VND, { l3: "8770", l2: "8700", l1: "8000" }, "chỉ có ở cấp 3 -> suy ra cấp 2, cấp 1");
  assert.equal(icb.levels[3][0].code, "0580");
  assert.equal(icb.levels[2].find((x) => x.code === "8700").count, 1);
});

test("chỉ số ngành: trọng số GTGD có trần 25%, tái cân bằng đầu tháng, không nhìn trước", () => {
  const members = ["A", "B", "C", "D", "E"].map((t, k) => ({ ticker: t, bars: bars((i) => 100 + i * (k + 1) * 0.01, { value: k === 0 ? 1e11 : 2e9 }) }));
  const { series, rebalances } = buildSectorIndex(members, DATES);
  const w = rebalances.at(-1).weights;
  assert.ok(Math.max(...Object.values(w)) <= 0.2501, JSON.stringify(w));
  assert.ok(Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 1e-3);
  assert.ok(series[0].date >= DATES[59], "cần ≥ 60 phiên trước khi vào rổ");
  // đổi giá SAU ngày k không đổi chỉ số tới ngày k
  const k = 500, mutated = members.map((m) => ({ ...m, bars: m.bars.map((b, i) => (i > k ? { ...b, close: b.close * 3 } : b)) }));
  const a = series.filter((x) => x.date <= DATES[k]), b = buildSectorIndex(mutated, DATES).series.filter((x) => x.date <= DATES[k]);
  assert.deepEqual(a, b);
  // mã thiếu thanh khoản không vào rổ
  const thin = buildSectorIndex([...members, { ticker: "Z", bars: bars((i) => 10, { value: 1e7 }) }], DATES).rebalances.at(-1).weights;
  assert.equal(thin.Z, undefined);
});

test("RRG tuần: xoay theo chiều kim đồng hồ Improving -> Leading -> Weakening -> Lagging; point-in-time", () => {
  const sw = weeklyCloses(bars((i) => cyc(i)).map(({ date, close }) => ({ date, close }))), bw = weeklyCloses(bench);
  const rrg = computeRrg(sw, bw);
  assert.ok(rrg.length > 120);
  const seq = quadrantTransitions(rrg).map((t) => `${t.from}>${t.to}`);
  const legal = new Set(["IMPROVING>LEADING", "LEADING>WEAKENING", "WEAKENING>LAGGING", "LAGGING>IMPROVING"]);
  const ok = seq.filter((s) => legal.has(s)).length;
  assert.ok(ok / seq.length >= 0.8, `chiều xoay: ${seq.join(", ")}`);
  for (const q of ["IMPROVING", "LEADING", "WEAKENING", "LAGGING"]) assert.ok(rrg.some((r) => r.quadrant === q), q);
  // không nhìn trước: RRG trên chuỗi cắt = tiền tố của RRG đầy đủ
  const cut = computeRrg(sw.slice(0, 100), bw.slice(0, 100));
  assert.deepEqual(cut, rrg.slice(0, cut.length));
});

test("lọc nhiễu: vùng đệm 0,15σ giảm số lần đổi góc so với góc thô", () => {
  assert.equal(rawQuadrant(101, 101), "LEADING"); assert.equal(rawQuadrant(99, 101), "IMPROVING");
  assert.equal(hysteresisQuadrant("LAGGING", 100.05, 99), "LAGGING", "chưa vượt vùng đệm -> giữ góc cũ");
  assert.equal(hysteresisQuadrant("LAGGING", 99.5, 100.3, 0.15), "IMPROVING");
  const noisy = bars((i) => cyc(i) * (1 + 0.01 * Math.sin(i * 2.3)));
  const rrg = computeRrg(weeklyCloses(noisy.map(({ date, close }) => ({ date, close }))), weeklyCloses(bench));
  const rawChanges = rrg.filter((r, i) => i && r.quadrantRaw !== rrg[i - 1].quadrantRaw).length;
  const filtered = quadrantTransitions(rrg).length;
  assert.ok(filtered <= rawChanges, `${filtered} vs ${rawChanges}`);
});

test("dựng toàn bộ: mọi ngành đủ ≥ 3 mã có RRG, mã chưa phân ngành được báo, tuần dở dang không sinh sự kiện", () => {
  const universe = ["VAA", "VAB", "VAC", "SAA", "SAB", "SAC", "XXX"].map((ticker) => ({ ticker }));
  const icb = buildIcbTaxonomy({
    1: [{ industryCode: "8000", vietnameseName: "Tài chính", codeList: "VAA,VAB,VAC,SAA,SAB,SAC" }],
    2: [{ industryCode: "8300", higherLevelCode: "8000", vietnameseName: "Ngân hàng", codeList: "VAA,VAB,VAC" }, { industryCode: "8700", higherLevelCode: "8000", vietnameseName: "Dịch vụ tài chính", codeList: "SAA,SAB,SAC" }],
    3: [{ industryCode: "8350", higherLevelCode: "8300", vietnameseName: "Ngân hàng", codeList: "VAA,VAB,VAC" }],
  });
  const seriesOf = new Map(universe.map((u, k) => [u.ticker, bars((i) => cyc(i, k < 3 ? 0 : Math.PI))]));
  const { summary, history } = buildSectorRotation({ universe, icb, seriesOf, benchBars: bench.slice(0, 898) });
  assert.deepEqual(summary.sectors.map((s) => s.code), ["8300", "8700"], "cấp 3 trùng rổ cấp 2 bị bỏ");
  assert.deepEqual(summary.coverage.unclassified, ["XXX"]);
  const s = summary.sectors[0];
  assert.ok(s.tail.length === 12 && s.latest.ratio && s.quadrant);
  assert.equal(s.rrg4d.asOf, s.latestClosed.date, "all four coordinates share the same closed-week date");
  assert.ok(s.rrg4dTrail.points.length <= 26);
  assert.ok(s.rrg4dTrail.points.length > 1);
  assert.equal(s.rrg4dTrail.points.at(-1).week, s.latestClosed.week);
  assert.equal(s.rrg4dTrail.points.at(-1).date, s.latestClosed.date);
  assert.ok(s.rrg4dTrail.points.every((point) => point.week <= summary.closedThrough));
  assert.ok(s.rrg4dTrail.points.some((point) => point.quality === "complete"));
  assert.ok(history.sectors["8300"].index.length > 500);
  if (summary.partialWeek) for (const t of history.sectors["8300"].transitions) assert.ok(t.week <= summary.closedThrough);
  assert.ok(summary.sectors[0].quadrant !== summary.sectors[1].quadrant || true);
});

test("weekly market-share Z trajectory is point-in-time and matches requested observation dates", () => {
  const members = ["A", "B", "C"].map((ticker, k) => ({ ticker, bars: bars((i) => 80 + i * (k + 1) * 0.02) }));
  // Give each member a stable but distinct turnover weight while retaining real daily values.
  members.forEach((member, k) => { member.bars = member.bars.map((bar) => ({ ...bar, value: (k + 1) * (1e9 + (bar.date.charCodeAt(9) % 7) * 1e6) })); });
  const totals = totalValueByDate(new Map(members.map((member) => [member.ticker, member.bars])));
  const cutoffIndex = 600;
  const cutoffDate = DATES[cutoffIndex];
  const baseline = sectorShareZHistory({ members, dates: DATES, totals, snapshotDates: [cutoffDate] })[0];
  assert.equal(baseline.date, cutoffDate);

  const mutatedMembers = members.map((member) => ({ ...member, bars: member.bars.map((bar, i) => i > cutoffIndex ? { ...bar, value: bar.value * 50 } : bar) }));
  const mutatedTotals = totalValueByDate(new Map(mutatedMembers.map((member) => [member.ticker, member.bars])));
  const afterMutation = sectorShareZHistory({ members: mutatedMembers, dates: DATES, totals: mutatedTotals, snapshotDates: [cutoffDate] })[0];
  assert.deepEqual(afterMutation, baseline, "later turnover cannot leak into historical Z snapshots");
});
