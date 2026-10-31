import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStateSeries, effectiveCount, headlineOf, mcClellan, median, panelByDate, priorPercentile, robustZSeries, stateDoc, volBand, yangZhangSeries, zoneOf } from "../src/market/tradingMatrix/marketState.js";
import { evaluateM4, M4_RULES, runM4Lifecycle } from "../src/market/tradingMatrix/scenarioM4.js";
import { dailyBreadth } from "../src/market/tradingMatrix/features.js";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, `${a} vs ${b}`);
const dates = (n) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10));

test("robust z: dùng trung vị và MAD của cửa sổ trước t, khớp tính tay, chặn ±4", () => {
  const s = [1, 2, 3, 4, 5, 6];
  const z = robustZSeries(s, { window: 5, minObs: 5 });
  // cửa sổ 1..5: trung vị 3, MAD 1 -> (6 - 3) / 1,4826
  near(z[5], 3 / 1.4826);
  assert.equal(z[0], null);
  const big = robustZSeries([1, 2, 3, 4, 5, 500], { window: 5, minObs: 5 });
  assert.equal(big[5], 4);
  assert.equal(robustZSeries([2, 2, 2, 2, 2, 9], { window: 5, minObs: 5 })[5], null); // MAD = 0: không suy ra số
});

test("phân vị không gồm phiên đang xét", () => {
  assert.equal(priorPercentile([1, 2, 3, 4, 2], { minObs: 4 })[4], 50);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([]), null);
});

test("McClellan: EMA19 − EMA39, khớp tính tay", () => {
  const rows = [{ adv: 10, dec: 0 }, { adv: 0, dec: 10 }];
  const mo = mcClellan(rows);
  assert.equal(mo[0], 0);
  const a = 1000 + (2 / 20) * (-1000 - 1000), b = 1000 + (2 / 40) * (-1000 - 1000);
  near(mo[1], a - b);
  assert.equal(mcClellan([{ adv: 0, dec: 0 }])[0], null);
});

test("Yang–Zhang: khớp tính tay; không có biến động thì bằng 0; thiếu giá thì null", () => {
  const flat = Array.from({ length: 25 }, () => ({ open: 100, high: 100, low: 100, close: 100 }));
  assert.equal(yangZhangSeries(flat, 3)[3], 0);
  assert.equal(yangZhangSeries(flat, 3)[2], null);
  const b = [{ open: 100, high: 100, low: 100, close: 100 }, { open: 101, high: 103, low: 100, close: 102 }, { open: 103, high: 104, low: 101, close: 102 }, { open: 101, high: 102, low: 99, close: 100 }];
  const n = 3, k = 0.34 / (1.34 + (n + 1) / (n - 1));
  const sv = (x) => { const m = x.reduce((a, c) => a + c, 0) / x.length; return x.reduce((a, c) => a + (c - m) ** 2, 0) / (x.length - 1); };
  const o = [Math.log(101 / 100), Math.log(103 / 102), Math.log(101 / 102)], c = [Math.log(102 / 101), Math.log(102 / 103), Math.log(100 / 101)];
  const rs = [b[1], b[2], b[3]].map((x) => Math.log(x.high / x.close) * Math.log(x.high / x.open) + Math.log(x.low / x.close) * Math.log(x.low / x.open));
  const v = sv(o) + k * sv(c) + (1 - k) * (rs.reduce((a, r) => a + r, 0) / 3);
  near(yangZhangSeries(b, 3)[3], Math.sqrt(v * 252) * 100);
  assert.equal(yangZhangSeries([...b.slice(0, 3), { open: 0, high: 1, low: 1, close: 1 }], 3)[3], null);
});

test("số trụ hiệu dụng: n mã bằng nhau = n; một mã = 1; dấu không đổi kết quả", () => {
  near(effectiveCount([1, 1, 1, 1]), 4);
  near(effectiveCount([5, 0, 0]), 1);
  near(effectiveCount([2, -2]), 2);
  assert.equal(effectiveCount([]), null);
  assert.equal(effectiveCount([0, 0]), null);
});

const makeSymbols = (n, days, fn) => new Map(Array.from({ length: n }, (_, s) => [`M${s}`, days.map((date, i) => fn(s, i, date))]));

test("độ rộng khớp đúng dailyBreadth trên cùng dữ liệu", () => {
  const d = dates(70);
  const by = makeSymbols(10, d, (s, i, date) => { const close = 100 + (s % 2 ? i : -i * 0.5) + Math.sin(i + s); return { date, close, closeAdj: close, refPrice: close - (s % 3) + 1, value: 1e9, volume: 1e4, foreignBuyVal: 2e7, foreignSellVal: 1e7 }; });
  const [last] = panelByDate(by, [d.at(-1)]);
  const b = dailyBreadth(by, d.at(-1));
  assert.equal(last.n, b.eligibleCount);
  near(Math.round((last.up20 / last.n) * 1000) / 10, b.aboveMa20Pct);
  near(Math.round((last.up50 / last.n) * 1000) / 10, b.aboveMa50Pct);
  assert.equal(last.adv, b.advancers);
  assert.equal(last.dec, b.decliners);
});

test("chuỗi trạng thái: không nhìn tương lai — đổi dữ liệu sau t không đổi kết quả tại t", () => {
  const d = dates(160);
  const mk = (bump) => makeSymbols(12, d, (s, i, date) => { const j = i > 150 ? bump : 0; const close = 100 + 10 * Math.sin(i / 9 + s) + j; return { date, close, closeAdj: close, refPrice: close * (1 - 0.002 * Math.sin(i + s)), value: 1e9 + i * 1e6, volume: 1e4, foreignBuyVal: 1e7 + (s + i) * 1e5, foreignSellVal: 1e7 }; });
  const ix = (bump) => d.map((date, i) => { const close = 1000 + 30 * Math.sin(i / 7) + (i > 150 ? bump : 0) + i * 0.1 + 3 * Math.cos(i * 1.7); return { date, open: close - 1 * Math.sin(i), high: close + 4, low: close - 4, close }; });
  const run = (bump) => buildStateSeries({ panel: panelByDate(mk(bump), d), indexBars: ix(bump) });
  const a = run(0), b = run(500);
  assert.deepEqual(a.slice(0, 150).map((s) => [s.x, s.y, s.b20]), b.slice(0, 150).map((s) => [s.x, s.y, s.b20]));
  assert.notDeepEqual(a.at(-1).b20 === b.at(-1).b20 && a.at(-1).sigma, b.at(-1).sigma);
  assert.ok(a.filter((s) => s.x != null).length > 50, "có trục X sau khi đủ cửa sổ");
});

test("dòng tiền theo thanh khoản: cùng số tiền thì thanh khoản lớn hơn ra tỷ lệ nhỏ hơn", () => {
  const d = dates(8);
  const by = (value) => makeSymbols(1, d, (_, i, date) => ({ date, close: 10, closeAdj: 10, refPrice: 10, value, volume: 1, foreignBuyVal: 2e9, foreignSellVal: 1e9 }));
  const ix = d.map((date) => ({ date, open: 1, high: 1, low: 1, close: 1 }));
  const small = buildStateSeries({ panel: panelByDate(by(1e10), d), indexBars: ix }).at(-1);
  const large = buildStateSeries({ panel: panelByDate(by(1e12), d), indexBars: ix }).at(-1);
  near(small.fnr5, 10);
  near(large.fnr5, 0.1);
});

test("vùng đệm và dòng kết luận; thiếu số thì bỏ cụm, không đoán", () => {
  assert.deepEqual(zoneOf(0.2, -0.2), { side: "mid", stress: "mid", id: "mid-mid" });
  assert.equal(zoneOf(1, -1).id, "up-low");
  assert.equal(zoneOf(-1, 1).id, "down-high");
  assert.equal(zoneOf(null, 1), null);
  assert.equal(volBand(10), "thấp");
  assert.equal(volBand(50), "bình thường");
  assert.equal(volBand(90), "cao");
  const h = headlineOf({ regimeLabel: "DOWNTREND", s: { yzPct: 10, b20: 34.65, fnr5: -1, neff: 42.4 } });
  assert.deepEqual(h.map((x) => x.text), ["Xu hướng giảm", "biến động thấp", "độ rộng 34,7%", "khối ngoại bán ròng", "42 trụ hiệu dụng"]);
  assert.deepEqual(headlineOf({ regimeLabel: "UNKNOWN", s: { b20: 50 } }).map((x) => x.key), ["breadth"]);
});

test("stateDoc: so hai phiên, chỉ tính chênh khi đủ số", () => {
  const doc = stateDoc({ regimeLabel: "SIDEWAY", series: [{ date: "a", b20: 40, x: -1, y: 1 }, { date: "b", b20: 50, x: 1, y: 1, fnr5: 1 }] });
  assert.equal(doc.deltas.b20, 10);
  assert.equal(doc.deltas.fnr5, null);
  assert.equal(doc.zoneChanged, true);
  assert.equal(stateDoc({ regimeLabel: "SIDEWAY", series: [] }), null);
});

const row = (date, o = {}) => ({ date, regime: "SIDEWAY", b20: 45, mo: 0, yzPct: 50, pgPct: 50, db5: 0, ddb: 0, idx1: 0, sigma: 15, ...o });

test("M4: SC3 không bật khi chỉ độ rộng rơi; SC4 bật", () => {
  const e = evaluateM4(row("a", { ddb: -21, yzPct: 26 }), "DOWNTREND");
  assert.equal(e.SC3.watch, false);
  assert.equal(e.SC4.watch, true);
  assert.equal(evaluateM4(row("a", { yzPct: 95 }), "SIDEWAY").SC3.watch, true);
  // σ năm 15,87% ~ 1% ngày: phiên 2,6% vượt 2,5σ
  assert.equal(evaluateM4(row("a", { idx1: -2.6, sigma: 15.87 }), "SIDEWAY").SC3.watch, true);
});

test("M4: cần giữ 2 phiên mới vào CONFIRMED; đợt tính ở phiên thứ hai; vô hiệu rồi nghỉ 5 phiên", () => {
  const up = { ddb: -20 }, calm = { ddb: 0 };
  const lc = runM4Lifecycle([row("d1", up), row("d2", calm), row("d3", up), row("d4", up), row("d5", calm), row("d6", calm), row("d7", up), row("d8", up)]);
  const st = lc.timeline.map((d) => d.SC4);
  assert.deepEqual(st.slice(0, 4), ["WATCH", "INACTIVE", "WATCH", "CONFIRMED"]);
  assert.equal(st[4], "INVALIDATED");
  assert.equal(st[5], "COOLDOWN");
  assert.equal(st[6], "COOLDOWN");
  assert.deepEqual(lc.episodes.filter((e) => e.scenario === "SC4").map((e) => e.start), ["d4"]);
  assert.equal(M4_RULES.confirmSessions, 2);
  assert.equal(lc.current.length, 4);
});

test("số trụ hiệu dụng là trung vị 5 phiên, giữ số từng phiên ở neff1", () => {
  const bars = Array.from({ length: 30 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i }));
  const panel = bars.map((b) => ({ date: b.date, n: 100, up20: 50, up50: 50, n200: 0, up200: 0, adv: 50, dec: 50, r5: [], value: 1, foreign: 0 }));
  const neff = bars.map((_, i) => (i === 29 ? 3 : 30));
  const s = buildStateSeries({ panel, indexBars: bars, neff });
  assert.equal(s[29].neff1, 3);
  assert.equal(s[29].neff, 30);
  assert.equal(s[1].neff, null);
});
