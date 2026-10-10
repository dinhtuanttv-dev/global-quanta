// Lọc ngành (L5) — dòng tiền ngành: thị phần GTGD & ma trận dịch chuyển, tích lũy âm thầm, độ rộng, trạng thái, cổ phiếu dẫn dắt.
import test from "node:test";
import assert from "node:assert/strict";
import { rotationMatrix, rsPercentiles, sectorFlow, sectorState, totalValueByDate } from "../src/market/sectors/flow.js";
import { buildSectorIndex } from "../src/market/sectors/rrg.js";

const DATES = (() => { const out = []; const d = new Date(Date.UTC(2023, 0, 2)); while (out.length < 400) { const w = d.getUTCDay(); if (w >= 1 && w <= 5) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } return out; })();
/** mã giả: giá theo fn, GTGD theo vfn, đóng cửa ở vị trí `clv` trong biên độ (1 = sát đỉnh phiên). */
const mk = (ticker, fn, vfn, clv = 0) => ({ ticker, bars: DATES.map((date, i) => { const c = fn(i); const h = c * 1.01, l = c * 0.99; return { date, open: c, high: h, low: l, close: l + ((clv + 1) / 2) * (h - l), volume: 1e5, value: vfn(i), foreignNet: clv * 1e8 }; }) });

test("thị phần GTGD: ngành được dòng tiền đổ vào có thị phần tăng, z dương; ma trận dịch chuyển từ ngành giảm sang ngành tăng", () => {
  const A = ["AAA", "AAB", "AAC"].map((t) => mk(t, (i) => 100, (i) => (i > 385 ? 4e9 : 1e9)));
  const B = ["BBA", "BBB", "BBC"].map((t) => mk(t, (i) => 100, (i) => (i > 385 ? 0.5e9 : 1e9)));
  const seriesOf = new Map([...A, ...B].map((m) => [m.ticker, m.bars]));
  const totals = totalValueByDate(seriesOf), rs = rsPercentiles(seriesOf);
  const fa = sectorFlow({ members: A, index: buildSectorIndex(A, DATES).series, dates: DATES, totals, rs });
  const fb = sectorFlow({ members: B, index: buildSectorIndex(B, DATES).series, dates: DATES, totals, rs });
  assert.ok(fa.share.share20 > fa.share.share60 && fa.share.z > 1, JSON.stringify(fa.share));
  assert.equal(fa.share.state, "INFLOW"); assert.equal(fb.share.state, "OUTFLOW");
  const rot = rotationMatrix([{ code: "A", name: "A", flow: fa }, { code: "B", name: "B", flow: fb }], 4);
  assert.equal(rot.transfers[0].from, "B"); assert.equal(rot.transfers[0].to, "A");
  assert.ok(rot.transfers[0].pp > 0);
});

test("tích lũy âm thầm: giá đi ngang, đóng cửa sát đỉnh phiên với GTGD tăng, biến động co -> cờ bật; ngược lại = phân phối", () => {
  const acc = ["ACA", "ACB", "ACC"].map((t, k) => mk(t, (i) => 100 * (1 + 0.03 * Math.sin(i / 7 + k)) * (i > 340 ? 1 : 1) * (i > 340 ? 1 - 0.0 : 1), (i) => (i > 340 ? 3e9 : 1e9), 0.6));
  // giảm dao động gần đây để co biến động
  for (const m of acc) m.bars.forEach((b, i) => { if (i > 330) { const c = 100; b.close = c * (1 + 0.003 * Math.sin(i)); b.high = b.close * 1.004; b.low = b.close * 0.995; b.close = b.low + 0.8 * (b.high - b.low); } });
  const other = ["OTA", "OTB", "OTC"].map((t) => mk(t, () => 50, () => 1e9));
  const seriesOf = new Map([...acc, ...other].map((m) => [m.ticker, m.bars]));
  const f = sectorFlow({ members: acc, index: buildSectorIndex(acc, DATES).series, dates: DATES, totals: totalValueByDate(seriesOf), rs: rsPercentiles(seriesOf) });
  assert.ok(f.money.cmf20 > 0.05, `CMF ${f.money.cmf20}`);
  assert.ok(f.money.accumulationScore >= 60, `acc ${f.money.accumulationScore}`);
  assert.ok(f.money.foreignNet20 > 0);
});

test("trạng thái: luật minh bạch có lý do; tích lũy đáy tách khỏi suy thoái", () => {
  const base = { share: { state: "RISING", changePct: 20, z: 1 }, money: { cmf20: 0.3, accumulationScore: 90, stealthAccumulation: false, stealthDistribution: false }, breadth: { aboveMa50: 30, aboveMa200: 20 } };
  assert.equal(sectorState({ ...base, stage: { stage: 4 } }, "LAGGING").key, "BOTTOMING");
  assert.equal(sectorState({ ...base, money: { ...base.money, cmf20: -0.2, accumulationScore: 20 }, stage: { stage: 4 } }, "LAGGING").key, "DECLINE");
  assert.equal(sectorState({ ...base, breadth: { aboveMa50: 70, aboveMa200: 70 }, stage: { stage: 2 } }, "LEADING").key, "GROWTH");
  assert.equal(sectorState({ ...base, money: { ...base.money, cmf20: -0.1, accumulationScore: 30 }, share: { state: "FALLING", changePct: -5 }, breadth: { aboveMa50: 50, aboveMa200: 50 }, stage: { stage: 3 } }, "WEAKENING").key, "DISTRIBUTION");
  for (const s of [sectorState({ ...base, stage: { stage: 4 } }, "LAGGING")]) assert.ok(s.why.length >= 3);
});

test("cổ phiếu dẫn dắt: RS cao, trên MA50/MA200, gần đỉnh, mạnh hơn ngành -> leader; mã yếu không", () => {
  const strong = mk("STR", (i) => 100 * (1 + 0.004 * i), () => 2e9, 0.3);
  const weak = mk("WEA", (i) => 200 * (1 - 0.001 * i), () => 2e9, -0.3);
  const mid = mk("MID", (i) => 100 * (1 + 0.001 * i), () => 2e9);
  const members = [strong, weak, mid], seriesOf = new Map(members.map((m) => [m.ticker, m.bars]));
  const f = sectorFlow({ members, index: buildSectorIndex(members, DATES).series, dates: DATES, totals: totalValueByDate(seriesOf), rs: rsPercentiles(seriesOf), tagsOf: (t) => (t === "STR" ? ["SEPA · SẴN SÀNG MUA"] : []) });
  assert.equal(f.leaders[0].ticker, "STR"); assert.equal(f.leaders[0].leader, true);
  assert.deepEqual(f.leaders[0].tags, ["SEPA · SẴN SÀNG MUA"]);
  assert.equal(f.leaders.find((l) => l.ticker === "WEA").leader, false);
});
