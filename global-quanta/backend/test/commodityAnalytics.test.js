import { test } from "node:test";
import assert from "node:assert/strict";
import { describe, logReturns, monthEnd, pearson, rebase, relation, sliceRange, toVnd } from "../src/market/commodities/commodityAnalytics.js";
import { createCommodityService } from "../src/market/commodities/commodityService.js";

const days = (n, start = Date.UTC(2021, 0, 4)) => Array.from({ length: n }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} != ${b}`);

test("pearson / logReturns / sliceRange / monthEnd cơ bản", () => {
  near(pearson([1, 2, 3], [2, 4, 6]), 1);
  near(pearson([1, 2, 3], [3, 2, 1]), -1);
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), null);
  near(logReturns([["a", 100], ["b", 110]])[0][1], Math.log(1.1) * 100);
  const pts = [["2020-01-01", 1], ["2024-06-01", 2], ["2026-01-01", 3], ["2026-10-01", 4]];
  assert.deepEqual(sliceRange(pts, "1y").map((p) => p[0]), ["2026-01-01", "2026-10-01"]);
  assert.deepEqual(monthEnd([["2026-09-01", 1], ["2026-09-30", 2], ["2026-10-02", 3]], "2026-10"), [["2026-09", 2]]);
});

test("toVnd: ngày dùng tỷ giá phiên gần nhất; tháng dùng TB tỷ giá trong tháng", () => {
  const fx = [["2026-09-01", 25000], ["2026-09-15", 26000], ["2026-10-01", 26500]];
  assert.deepEqual(toVnd([["2026-09-10", 2]], fx, "day"), [["2026-09-10", 50000]]);
  assert.deepEqual(toVnd([["2026-09", 2]], fx, "month"), [["2026-09", 51000]]);
  assert.deepEqual(toVnd([["2026-08-01", 2]], fx, "day"), []); // trước tỷ giá đầu tiên -> bỏ, không ngoại suy
});

test("describe: thay đổi theo khung, đỉnh/đáy 1 năm, phân vị, sụt giảm, biến động năm hoá", () => {
  const d = days(600);
  const pts = d.map((x, i) => [x, 100 + i * 0.1 + (i % 2 ? 1 : -1)]);
  const s = describe(pts, "day");
  near(s.changes.d1, (pts.at(-1)[1] / pts.at(-2)[1] - 1) * 100, 1e-3);
  assert.equal(s.high1y, Math.max(...pts.slice(-252).map((p) => p[1])));
  assert.ok(s.percentile5y > 90);
  assert.ok(s.drawdown5y <= 0);
  assert.ok(s.vol.now > 0 && s.vol.unitVi.includes("20 phiên"));
  assert.equal(s.volSeries.length, pts.length - 20);
  const m = describe(Array.from({ length: 30 }, (_, i) => [`20${24 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`, 100 + i]), "month");
  assert.ok("m1" in m.changes && "y1" in m.changes && !("d1" in m.changes));
});

test("relation: ngày — giá hàng hoá phiên TRƯỚC dẫn VN; phát hiện đúng độ trễ cài sẵn", () => {
  const d = days(400);
  let px = 100, vn = 100;
  const rnd = (() => { let a = 7; return () => { a = (a * 16807) % 2147483647; return a / 2147483647 - 0.5; }; })();
  const x = [], y = [];
  const shocks = d.map(() => rnd());
  d.forEach((dt, i) => {
    px *= 1 + shocks[i] * 0.04;
    vn *= 1 + (i >= 2 ? shocks[i - 2] * 0.03 : 0) + rnd() * 0.005; // VN theo giá hàng hoá trễ 2 ngày lịch
    x.push([dt, px]); y.push([dt, vn]);
  });
  const r = relation(x, y, "day");
  assert.equal(r.exploratory, true);
  // VN ngày t dùng x của ngày t-1 (lag 0 trong bảng = trễ 1 ngày lịch) -> đỉnh ở lag 1
  assert.equal(r.bestLag.lag, 1);
  assert.ok(r.bestLag.r > 0.8);
  assert.equal(r.leadLag.length, 11);
  assert.ok(r.band > 0 && r.n === 60);
  assert.equal(relation(x.slice(0, 5), y.slice(0, 5), "day"), null);
});

test("rebase: quy về 100 tại điểm đầu khung", () => {
  const out = rebase([{ key: "a", points: [["2026-01", 50], ["2026-02", 75], ["2026-03", 100]] }], "2026-02");
  assert.deepEqual(out[0].rebased, [["2026-02", 100], ["2026-03", 133.3333]]);
});

test("history: 404/400, BDI không có số, chuỗi ngày + VND + ICB + mã CP, ghi chú khi thiếu nguồn", async () => {
  const d = days(300, Date.UTC(2025, 11, 1));
  const ts = d.map((x) => Date.parse(`${x}T20:00:00Z`) / 1000);
  const fetchImpl = async (url) => {
    const isFx = url.includes("VND%3DX");
    const closes = d.map((_, i) => (isFx ? 26000 + i : 100 + Math.sin(i / 5) * 5));
    return { ok: true, json: async () => ({ chart: { result: [{ meta: {}, timestamp: ts, indicators: { quote: [{ close: closes }] } }] } }) };
  };
  const svc = createCommodityService({
    fetchImpl, now: () => Date.UTC(2026, 9, 16), log: { warn() {} },
    sectorIndices: async () => ({ "1750": { name: "Kim loại công nghiệp", index: d.map((x, i) => [x, 100 + i * 0.2, 12]) } }),
    taSeries: { get: async () => ({ priceBasis: "ADJUSTED_CUMULATIVE", warnings: [], bars: d.map((x, i) => ({ date: x, close: 20000 + i * 10 })) }) },
  });
  assert.equal((await svc.history("XXX")).status, 404);
  assert.equal((await svc.history("GOLD", "2w")).status, 400);
  assert.equal((await svc.history("BDI")).body.available, false);
  const r = await svc.history("IRON_ORE", "1y");
  assert.equal(r.status, 200);
  const b = r.body;
  assert.equal(b.freq, "day");
  assert.equal(b.vnd.points.length, b.world.length);
  near(b.vnd.points.at(-1)[1], b.world.at(-1)[1] * (26000 + 299));
  assert.deepEqual(b.vnSeries.map((s) => s.code), ["1750", "HPG"]);
  assert.match(b.vnSeries[1].labelVi, /heuristic/);
  assert.deepEqual(b.chart.map((c) => c.key), ["world", "vnd", "vn:1750", "vn:HPG"]);
  for (const c of b.chart) assert.equal(c.rebased[0][1], 100);
  assert.equal(b.relations.length, 2);
  assert.ok(b.stats.vol.now > 0);
  const gold = (await svc.history("GOLD", "1y")).body;
  assert.deepEqual(gold.vnSeries.map((s) => s.code), ["PNJ"]); // không có ICB khớp -> chỉ mã đại diện
});
