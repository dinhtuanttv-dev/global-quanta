import assert from "node:assert/strict";
import test from "node:test";
import { applyBreadthFlags, buildCrosswalk, computeSectorLadder, LADDER_HORIZONS, nextLeg, structureKey, wilson } from "../src/market/sectors/ladder.js";

const dates = (n) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10));
/** Chuỗi từ lợi suất log từng phiên; có nhiễu xác định để σ > 0. */
const curve = (ds, f, start = 100) => { let v = Math.log(start); return ds.map((date, i) => { v += f(i); return { date, close: Math.exp(v) }; }); };
const wig = (i) => (i % 2 ? 0.004 : -0.004);

test("RS_h đúng công thức log, Z_h = RS_h / (σ√h)", () => {
  const ds = dates(300);
  const bench = curve(ds, () => 0.001);
  const sector = curve(ds, (i) => 0.001 + 0.002 + wig(i));
  const L = computeSectorLadder({ indexSeries: sector, members: [], benchBars: bench });
  assert.deepEqual(L.rungs.map((r) => r.h), [...LADDER_HORIZONS]);
  const t = 299;
  for (const r of L.rungs) {
    const exp = (Math.log(sector[t].close / sector[t - r.h].close) - Math.log(bench[t].close / bench[t - r.h].close)) * 100;
    assert.ok(Math.abs(r.rs - exp) < 0.006, `h${r.h}`);
    assert.ok(Math.abs(r.z - r.rs / (L.sigmaDailyPct * Math.sqrt(r.h))) < 0.05, `z${r.h}`);
  }
});

test("không nhìn trước: dữ liệu sau t không làm đổi kết quả tại t", () => {
  const ds = dates(300), bench = curve(ds, () => 0), sector = curve(ds, (i) => 0.001 + wig(i));
  const a = computeSectorLadder({ indexSeries: sector.slice(0, 250), members: [], benchBars: bench.slice(0, 250) });
  const b = computeSectorLadder({ indexSeries: sector, members: [], benchBars: bench.slice(0, 250) });
  assert.deepEqual(a, b);
});

test("B_h: đếm mã vượt VN-Index đúng kỳ, bỏ mã thiếu ngày đầu kỳ, kèm Wilson", () => {
  const ds = dates(200), bench = curve(ds, () => 0.001);
  const up = { ticker: "U", bars: curve(ds, () => 0.003) }, down = { ticker: "D", bars: curve(ds, () => -0.003) }, up2 = { ticker: "V", bars: curve(ds, () => 0.002) };
  const fresh = { ticker: "N", bars: curve(ds, () => 0.01).slice(-30) };
  const L = computeSectorLadder({ indexSeries: bench, members: [up, down, up2, fresh], benchBars: bench });
  const r20 = L.rungs.find((r) => r.h === 20), r65 = L.rungs.find((r) => r.h === 65);
  assert.equal(r20.n, 4); assert.equal(r20.beat, 75);
  assert.equal(r65.n, 3); assert.equal(r65.beat, 66.67);
  assert.ok(r65.lo < r65.beat && r65.beat < r65.hi);
});

test("ít hơn 3 mã thì không công bố độ tham gia; thiếu lịch sử thì nhãn Chưa đủ", () => {
  const ds = dates(100), bench = curve(ds, () => 0), sector = curve(ds, wig);
  const L = computeSectorLadder({ indexSeries: sector, members: [{ ticker: "A", bars: sector }], benchBars: bench });
  assert.equal(L.rungs[0].beat, null);
  assert.equal(L.rungs.find((r) => r.h === 130).rs, null);
  assert.equal(L.structure.key, "INSUFFICIENT");
});

test("Wilson khớp giá trị tham chiếu và nằm trong 0–100", () => {
  const w = wilson(8, 10);
  assert.ok(Math.abs(w.lo - 49.02) < 0.1 && Math.abs(w.hi - 94.33) < 0.1);
  assert.equal(wilson(0, 5).lo, 0);
  assert.deepEqual(wilson(0, 0), { lo: null, hi: null });
});

test("vùng đệm: vào ±0,5, ra ±0,25, chênh nhỏ không làm nhảy", () => {
  assert.equal(nextLeg(0, 0.4), 0);
  assert.equal(nextLeg(0, 0.6), 1);
  assert.equal(nextLeg(1, 0.3), 1);
  assert.equal(nextLeg(1, 0.2), 0);
  assert.equal(nextLeg(1, -0.6), -1);
  assert.equal(nextLeg(-1, -0.3), -1);
  assert.equal(nextLeg(1, null), 1);
});

test("bốn nhãn cấu trúc và trường hợp chưa rõ", () => {
  assert.equal(structureKey(1, 1, 1), "UP_ALIGNED");
  assert.equal(structureKey(-1, -1, -1), "DOWN_ALIGNED");
  assert.equal(structureKey(1, -1, -1), "BOUNCE");
  assert.equal(structureKey(-1, 1, 1), "PULLBACK");
  assert.equal(structureKey(0, 0, 1), "MIXED");
  assert.equal(structureKey(1, 1, 0), "MIXED");
});

test("xu hướng thật cho nhãn đúng trên chuỗi tổng hợp", () => {
  const ds = dates(400), bench = curve(ds, () => 0);
  const up = computeSectorLadder({ indexSeries: curve(ds, (i) => 0.002 + wig(i)), members: [], benchBars: bench });
  assert.equal(up.structure.key, "UP_ALIGNED");
  const bounce = computeSectorLadder({ indexSeries: curve(ds, (i) => (i < 390 ? -0.002 : 0.012) + wig(i)), members: [], benchBars: bench });
  assert.equal(bounce.structure.key, "BOUNCE");
});

test("cờ độ tham gia: chỉ gắn khi giảm hơn hẳn các ngành cùng cấp, không gắn khi cả thị trường cùng giảm", () => {
  const row = (code, a, b, level = 2) => ({ code, level, flags: [], rungs: [{ h: 20, trail: [{ beat: a }, { beat: b }] }] });
  const allDown = [row("A", 70, 35), row("B", 70, 40), row("C", 70, 38)];
  applyBreadthFlags(allDown);
  assert.equal(allDown.flatMap((r) => r.flags).length, 0, "giảm đồng loạt");
  const one = [row("A", 70, 30), row("B", 60, 58), row("C", 50, 49), row("D", 60, 55)];
  applyBreadthFlags(one);
  assert.deepEqual(one.filter((r) => r.flags.length).map((r) => r.code), ["A"]);
  assert.match(one[0].flags[0].text, /giảm 40 điểm/);
  const levels = [row("A", 70, 30), row("D", 60, 58), row("E", 60, 59), row("B", 70, 32, 3), row("C", 70, 30, 3)];
  applyBreadthFlags(levels);
  assert.equal(levels[0].flags.length, 1, "so trong cùng cấp");
  assert.equal(levels[3].flags.length, 0);
  const thin = [row("A", 50, null), row("B", 60, 58)];
  assert.doesNotThrow(() => applyBreadthFlags(thin));
});

test("bảng đối chiếu: một ngành ICB gom nhiều ngành Siêu Quét, đếm đúng", () => {
  const icb = { symbols: { A: { l2: "1700" }, B: { l2: "1700" }, C: { l2: "1700" }, D: { l2: "8300" }, E: {} }, levels: { 2: [{ code: "1700", name: "Tài nguyên" }, { code: "8300", name: "Ngân hàng" }] } };
  const x = buildCrosswalk({ tickers: ["A", "B", "C", "D", "E", "F"], icb, scannerMap: { A: ["Vật liệu", "Thép & Kim loại"], B: ["Vật liệu", "Thép & Kim loại"], C: ["Vật liệu", "Cao su"], D: ["Tài chính", "Ngân hàng"] } });
  assert.equal(x.classified, 4); assert.equal(x.withScanner, 4);
  assert.deepEqual(x.sectors[0].scanner, [{ industry: "Thép & Kim loại", count: 2 }, { industry: "Cao su", count: 1 }]);
  assert.equal(x.sectors[1].name, "Ngân hàng");
});
