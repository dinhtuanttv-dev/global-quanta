import test from "node:test";
import assert from "node:assert/strict";
import { detectBox, hotReasons, pzMeasures, pzPublic, pzStep, PZ_RULES } from "../src/market/elite/pricePosition.js";

// Chuỗi giá tổng hợp: mỗi phần tử là giá đóng cửa; cao / thấp = ±1%, khối lượng mặc định 1.000.000.
const day = (i) => new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
const mk = (closes, vols = [], spread = []) => closes.map((c, i) => ({ date: day(i), open: c, high: c * (1 + (spread[i] ?? 0.01)), low: c * (1 - (spread[i] ?? 0.01)), close: c, volume: vols[i] ?? 1_000_000 }));
const flat = (n, v = 100) => Array.from({ length: n }, (_, i) => v * (1 + 0.004 * Math.sin(i)));
const rise = (from, n, step) => Array.from({ length: n }, (_, i) => from * (1 + step) ** (i + 1));

/** Chạy máy trạng thái phiên này qua phiên khác (mỗi phiên chỉ thấy thanh ≤ phiên đó). */
function run(bars, { start, base = () => null, held = false, tier1 = () => true, rs = null } = {}) {
  const out = []; let prev = null;
  for (let k = start; k < bars.length; k++) {
    const b = bars.slice(0, k + 1);
    prev = pzStep({ bars: b, base: base(k, b), prev, ctx: { date: b.at(-1).date, held, tier1: tier1(k), exchange: "HOSE", rs: rs ? rs.slice(0, k + 1) : null } });
    out.push(prev);
  }
  return out;
}

test("độ đo: X1, rủi ro, X2 dương khi giá vượt EMA21; hộp giá nhận nền chặt trên SMA50", () => {
  const bars = mk([...rise(80, 60, 0.004), ...flat(16, 102)]);
  const box = detectBox(bars);
  assert.ok(box, "15 phiên đi ngang ±1% trên SMA50 -> có hộp giá");
  assert.equal(box.source, "BOX");
  const m = pzMeasures(bars, box);
  assert.ok(Math.abs(m.x1 - (bars.at(-1).close / box.pivot - 1)) < 1e-12);
  assert.ok(m.risk > 0 && m.risk < 0.1);
  assert.deepEqual(hotReasons(m, box), []);
});

test("vùng mua: có nền, giá quanh pivot, rủi ro ≤ 10% -> BUY_ZONE, mã đang giữ ở ngăn CORE", () => {
  const bars = mk([...rise(80, 60, 0.004), ...flat(16, 102)]);
  const [r] = run(bars, { start: bars.length - 1, held: true, base: (k, b) => detectBox(b) });
  assert.equal(r.state, "BUY_ZONE"); assert.equal(r.lane, "CORE");
  const p = pzPublic(r);
  assert.equal(p.baseSource, "BOX"); assert.ok(p.zoneLow < p.pivot && p.pivot < p.zoneHigh);
});

test("tăng nóng: mã CHƯA giữ chuyển ngay sang Chờ nền; mã ĐANG giữ cần 2 phiên liên tiếp mới sang Chạy lãi (chống nhấp nháy)", () => {
  const bars = mk([...flat(70, 100), ...rise(100, 8, 0.045)]);
  const notHeld = run(bars, { start: bars.length - 2 });
  assert.equal(notHeld[0].state, "EXTENDED"); assert.equal(notHeld[0].lane, "WAIT");
  assert.ok(notHeld[0].hotReasons.includes("x2") && notHeld[0].hotReasons.length >= 2);
  const heldRun = run(bars, { start: bars.length - 2, held: true });
  assert.notEqual(heldRun[0].state, "EXTENDED", "phiên nóng đầu tiên: mã đang giữ vẫn ở bảng chính");
  assert.equal(heldRun[0].lane, "CORE"); assert.match(heldRun[0].missingVi[0], /Tín hiệu nóng phiên 1\/2/);
  assert.equal(heldRun[1].state, "EXTENDED"); assert.equal(heldRun[1].lane, "RUNNER");
});

test("vòng đời: Tăng nóng -> Hạ nhiệt (lùi ≥ 5% từ đỉnh) -> Dựng nền mới (đủ 4 điều kiện) -> Vùng mua của nền mới", () => {
  // nền 100 -> chạy lên ~140 -> lùi về ~128 -> đi ngang chặt, khối lượng cạn 25 phiên.
  const up = rise(100, 8, 0.045), top = up.at(-1);
  const pull = rise(top, 4, -0.025), floor = pull.at(-1);
  const closes = [...flat(70, 100), ...up, ...pull, ...Array.from({ length: 25 }, (_, i) => floor * (1 + 0.003 * Math.sin(i)))];
  const vols = closes.map((_, i) => (i >= 82 ? 400_000 : 1_000_000));
  const bars = mk(closes, vols, closes.map((_, i) => (i >= 84 ? 0.003 : 0.01))); // nền chặt: biên độ nến co còn ±0,3%
  const rs = bars.map((b, i) => [b.date, i < 60 ? 1 : 1.2]); // sức mạnh so VN-Index giữ đáy
  const seq = run(bars, { start: 76, rs });
  const states = seq.map((r) => r.state);
  const first = (s) => states.indexOf(s);
  assert.ok(first("EXTENDED") >= 0, "phải vào Tăng nóng");
  assert.ok(first("COOLING") > first("EXTENDED"), "Hạ nhiệt sau Tăng nóng");
  assert.ok(first("REBASING") > first("COOLING"), `Dựng nền sau Hạ nhiệt: ${states.join(",")}`);
  // Nền mới cần ≥ 15 phiên từ đỉnh và giá trong vùng mua của pivot mới (hộp giá dựng hoàn toàn sau đỉnh).
  const bz = first("BUY_ZONE");
  assert.ok(bz > first("REBASING"), `Về vùng mua sau Dựng nền: ${states.join(",")}`);
  assert.match(seq[bz].reasonVi, /Nền mới \d+ phiên/);
  assert.equal(seq[bz].hStar, null, "về vùng mua -> xoá đỉnh H*");
  const reb = seq[first("REBASING")];
  assert.ok(reb.rebase.every((x) => x.ok), "đủ bốn điều kiện dựng nền");
});

test("hỏng nền: điều chỉnh sâu hơn 25% từ đỉnh -> FAILED; mã chưa giữ rời bảng (lane null)", () => {
  const up = rise(100, 8, 0.045), top = up.at(-1);
  const bars = mk([...flat(70, 100), ...up, ...rise(top, 12, -0.03)]);
  const seq = run(bars, { start: 76 });
  const f = seq.find((r) => r.state === "FAILED");
  assert.ok(f, seq.map((r) => r.state).join(","));
  assert.match(f.reasonVi, /Điều chỉnh sâu|SMA50/);
  assert.equal(f.lane, null);
  const heldSeq = run(bars, { start: 76, held: true });
  assert.equal(heldSeq.find((r) => r.state === "FAILED").lane, "RUNNER", "mã đang giữ hỏng nền vẫn là vị thế (xét bán theo G2r)");
});

test("hết hạn: mã chưa giữ ở bảng theo dõi quá 60 phiên mà không về vùng mua -> FAILED (Hết hạn)", () => {
  const up = rise(100, 8, 0.045), top = up.at(-1);
  // lùi 6% rồi trôi ngang lỏng (biên độ không co) 70 phiên -> kẹt ở Hạ nhiệt
  const tail = Array.from({ length: 70 }, (_, i) => top * 0.93 * (1 + 0.03 * Math.sin(i * 1.7)));
  const bars = mk([...flat(70, 100), ...up, ...tail]);
  const seq = run(bars, { start: 76 });
  const f = seq.find((r) => r.state === "FAILED");
  assert.ok(f, seq.map((r) => r.state).slice(-10).join(","));
  assert.match(f.reasonVi, /Hết hạn|SMA50|sâu/);
});

test("không nhìn trước: trạng thái tại phiên t không đổi khi chuỗi có thêm dữ liệu sau t", () => {
  const up = rise(100, 8, 0.045), top = up.at(-1);
  const closes = [...flat(70, 100), ...up, ...rise(top, 4, -0.025), ...flat(30, top * 0.9)];
  const bars = mk(closes);
  const full = run(bars, { start: 72 });
  const cut = run(bars.slice(0, 90), { start: 72 });
  assert.deepEqual(cut.map((r) => [r.state, r.measures?.x2]), full.slice(0, cut.length).map((r) => [r.state, r.measures?.x2]));
});

test("cùng phiên: giá chưa tới phiên của bảng hoặc nguồn lệch phiên -> Chưa xác định; mã đang giữ vẫn ở bảng chính", () => {
  const bars = mk(flat(80, 100));
  const a = pzStep({ bars, base: null, ctx: { date: day(90), held: true, tier1: true } });
  assert.equal(a.state, "UNKNOWN"); assert.equal(a.lane, "CORE"); assert.match(a.missingVi[0], /khác phiên/);
  const b = pzStep({ bars, base: null, ctx: { date: bars.at(-1).date, held: false, tier1: true, sameSession: false } });
  assert.equal(b.state, "UNKNOWN"); assert.equal(b.lane, null);
  const c = pzStep({ bars: bars.slice(0, 30), base: null, ctx: { date: bars[29].date, held: false, tier1: true } });
  assert.match(c.missingVi[0], /Chưa đủ 60 phiên/);
});

test("SEPA EXTENDED và vượt pivot > 5% là lý do nóng; mã không có nền chỉ xét X2–X4", () => {
  const bars = mk([...rise(80, 60, 0.004), ...flat(16, 102)]);
  const m = pzMeasures(bars, { pivot: 95, stop: 92 });
  assert.ok(hotReasons(m, { pivot: 95, stop: 92 }).includes("x1"));
  const m2 = pzMeasures(bars, { pivot: 101, stop: 97, status: "EXTENDED" });
  assert.deepEqual(hotReasons(m2, { pivot: 101, stop: 97, status: "EXTENDED" }), ["sepa_extended"]);
  assert.deepEqual(hotReasons(pzMeasures(bars, null), null), []);
});

test("X4: hai phiên sát trần HOSE (≥ 6,5%) trong 5 phiên", () => {
  const closes = [...flat(70, 100)]; closes.push(closes.at(-1) * 1.069, closes.at(-1) * 1.069 * 1.07);
  const m = pzMeasures(mk(closes), null, { exchange: "HOSE" });
  assert.equal(m.limitDays5, 2); assert.equal(m.x4, true);
  assert.equal(pzMeasures(mk(closes), null, { exchange: "UPCOM" }).limitDays5, 0, "UPCoM biên độ 15% -> chưa sát trần");
  assert.equal(PZ_RULES.limitPct.HNX, 0.1);
});

test("phiên Chưa xác định không xoá lịch sử: mã đang Tăng nóng gặp một phiên lệch dữ liệu rồi đi tiếp từ Tăng nóng", () => {
  const bars = mk([...flat(70, 100), ...rise(100, 9, 0.045)]);
  const b1 = bars.slice(0, 78);
  const hot = pzStep({ bars: b1, base: null, prev: null, ctx: { date: b1.at(-1).date, held: false, tier1: true } });
  assert.equal(hot.state, "EXTENDED");
  const gap = pzStep({ bars: b1, base: null, prev: hot, ctx: { date: bars[78].date, held: false, tier1: true } });
  assert.equal(gap.state, "UNKNOWN"); assert.equal(gap.resume.state, "EXTENDED");
  const next = pzStep({ bars, base: null, prev: gap, ctx: { date: bars.at(-1).date, held: false, tier1: true } });
  assert.equal(next.state, "EXTENDED"); assert.equal(next.from, "EXTENDED");
  assert.ok(next.hStar >= hot.hStar, "đỉnh H* đi tiếp, không bị đặt lại");
});

test("Tăng nóng -> về lại nền cũ: hết mọi độ đo nóng 2 phiên liên tiếp và giá về vùng mua của pivot cũ (chống nhấp nháy: 1 phiên chưa đủ)", () => {
  // nền 100–102 -> vọt 2 phiên (+7%, +6%: X1 > 5%) -> rơi về 101–102 và đi ngang.
  const base = [...rise(80, 60, 0.004), ...flat(16, 101)];
  const spike = [base.at(-1) * 1.07, base.at(-1) * 1.07 * 1.02];
  const back = [101.5, 101.8, 101.6, 101.7];
  const bars = mk([...base, ...spike, ...back]);
  const pivotBase = detectBox(bars.slice(0, base.length + 1));
  assert.ok(pivotBase, "nền trước khi vọt");
  const seq = run(bars, { start: base.length, base: (k) => (k === base.length ? pivotBase : null) });
  const states = seq.map((r) => r.state);
  assert.ok(states.includes("EXTENDED"), states.join(","));
  const iHot = states.indexOf("EXTENDED");
  assert.equal(states[iHot + 1] === "EXTENDED" || states[iHot + 1] === "COOLING" || states[iHot + 1] === "BUY_ZONE", true);
  const iBack = states.findIndex((s, i) => i > iHot && s === "BUY_ZONE");
  assert.ok(iBack > iHot, `phải về vùng mua của nền cũ: ${states.join(",")}`);
  assert.match(seq[iBack].reasonVi, /nền cũ/);
});
