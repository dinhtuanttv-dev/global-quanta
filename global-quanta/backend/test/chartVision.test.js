// AI Chart Vision v2 — phân tích đa khung D/W/M (quy tắc minh bạch, không AI), vùng giá, hợp lưu, chỉ mục bộ lọc.
import test from "node:test";
import assert from "node:assert/strict";
import { adx, analyzeTimeframe, chartVision, isPartialMonth, monthlyBars, rsi, screenerIndex, sma } from "../src/market/chartVision/chartVision.js";

const day = (i) => new Date(Date.UTC(2023, 0, 2) + i * 86_400_000).toISOString().slice(0, 10);
function series(legs, { noise = 0.004, vol = () => 1_000_000 } = {}) {
  const n = legs[legs.length - 1][0] + 1, out = [];
  for (let i = 0; i < n; i++) {
    let j = 1; while (legs[j][0] < i) j++;
    const [i0, p0] = legs[j - 1], [i1, p1] = legs[j];
    const c = (p0 + ((p1 - p0) * (i - i0)) / (i1 - i0 || 1)) * (1 + noise * Math.sin(i * 1.7)) * 1000;
    const o = i ? out[i - 1].close : c;
    out.push({ date: day(i), open: o, high: Math.max(o, c) * 1.006, low: Math.min(o, c) * 0.994, close: c, volume: vol(i, c, o) });
  }
  return out;
}
// tăng có nhịp hồi (đỉnh/đáy cao dần), KL phiên tăng lớn hơn
const UP = [[0, 50], [80, 62], [110, 57], [190, 72], [220, 66], [300, 84], [330, 77], [420, 98], [450, 91], [540, 115], [570, 108], [700, 140]].map(([i, p]) => [Math.round(i * 1.6), p]); // ~37 tháng lịch
const DOWN = UP.map(([i, p]) => [i, 190 - p]);
const upVol = (i, c, o) => (c >= o ? 1_400_000 : 800_000);
const dnVol = (i, c, o) => (c <= o ? 1_400_000 : 800_000);

test("chỉ báo chuẩn: SMA, RSI Wilder trong [0,100], ADX có giá trị sau 2n thanh", () => {
  assert.deepEqual(sma([1, 2, 3, 4], 2).slice(1), [1.5, 2.5, 3.5]);
  const C = series(UP).map((b) => b.close);
  const r = rsi(C).filter(Number.isFinite);
  assert.ok(r.length && r.every((x) => x >= 0 && x <= 100));
  const b = series(UP);
  const a = adx(b.map((x) => x.high), b.map((x) => x.low), C);
  assert.ok(!Number.isFinite(a.adx[26]) && Number.isFinite(a.adx[27]));
});

test("xu hướng tăng: mọi khung dương, cấu trúc đỉnh–đáy cao dần, đồng thuận tăng", () => {
  const r = chartVision("UPX", series(UP, { vol: upVol }));
  const [D, W, M] = r.frames;
  assert.deepEqual(r.frames.map((f) => f.tf), ["D", "W", "M"]);
  assert.ok(D.score > 15 && W.score > 15 && M.score > 0, r.frames.map((f) => f.score).join(","));
  assert.equal(W.structure.kind, "UP");
  assert.ok(r.synthesis.score > 15);
  assert.ok(["ALIGNED_UP", "PARTIAL"].includes(r.synthesis.alignment.key));
  assert.equal(r.method.label, "EXPERIMENTAL");
  assert.ok(r.synthesis.checklist.length >= 5);
});

test("đối xứng: xu hướng giảm cho điểm âm ở mọi khung", () => {
  const r = chartVision("DNX", series(DOWN, { vol: dnVol }));
  for (const f of r.frames) assert.ok(f.score < 0, `${f.tf} ${f.score}`);
  assert.ok(r.synthesis.score < -15);
  assert.ok(r.synthesis.conclusion.startsWith("Ưu tiên phòng thủ"));
});

test("vùng giá: đi ngang 100–120 -> kháng cự ~120 và hỗ trợ ~100, mỗi vùng ≥ 2 lần chạm", () => {
  const legs = [[0, 80], [60, 110]]; for (let k = 0; k < 8; k++) legs.push([90 + k * 40, 120], [110 + k * 40, 100]);
  legs.push([420, 110]);
  const f = analyzeTimeframe(series(legs, { noise: 0.001 }), "D");
  const R = f.levels.resistance[0], S = f.levels.support[0];
  assert.ok(R && Math.abs(R.price / 120_000 - 1) < 0.03 && R.touches >= 2, JSON.stringify(R));
  assert.ok(S && Math.abs(S.price / 100_000 - 1) < 0.03 && S.touches >= 2, JSON.stringify(S));
  assert.ok(f.synthesis === undefined);
});

test("nến tháng & tháng dở dang; không nhìn trước (kết quả tại phiên k chỉ phụ thuộc nến ≤ k)", () => {
  const bars = series(UP);
  const m = monthlyBars(bars);
  assert.equal(m[0].monthStart, bars[0].date);
  assert.equal(m.at(-1).close, bars.at(-1).close);
  assert.equal(isPartialMonth("2026-10-30"), false, "thứ Sáu cuối tháng 10/2026");
  assert.equal(isPartialMonth("2026-10-09"), true);
  const k = 500, a = chartVision("X", bars.slice(0, k + 1)), b = chartVision("X", bars.slice(0, k + 1).map((x) => ({ ...x })));
  assert.deepEqual(a.frames.map((f) => f.score), b.frames.map((f) => f.score));
  // đổi nến SAU k không đổi kết quả tại k
  const mutated = [...bars.slice(0, k + 1), ...bars.slice(k + 1).map((x) => ({ ...x, close: x.close * 0.5, low: x.low * 0.5 }))];
  assert.deepEqual(chartVision("X", mutated.slice(0, k + 1)).synthesis, a.synthesis);
});

test("bất biến đơn vị giá ×1.000: cùng điểm, cùng cấu trúc", () => {
  const a = series(UP, { vol: upVol }), b = a.map((x) => ({ ...x, open: x.open * 1000, high: x.high * 1000, low: x.low * 1000, close: x.close * 1000 }));
  const ra = chartVision("A", a), rb = chartVision("A", b);
  assert.deepEqual(ra.frames.map((f) => [f.score, f.structure?.kind]), rb.frames.map((f) => [f.score, f.structure?.kind]));
});

test("chỉ số (VNINDEX): không chạy mô hình giá Pring, vẫn đủ 3 khung; chuỗi quá ngắn -> khung báo thiếu", () => {
  const r = chartVision("VNINDEX", series(UP), { isIndex: true });
  assert.equal(r.patterns.length, 0);
  assert.equal(r.frames.length, 3);
  const short = chartVision("NEW", series([[0, 50], [80, 60]]));
  assert.equal(short.frames.find((f) => f.tf === "M").insufficient, true);
});

test("screenerIndex: gom mã theo bộ lọc, bỏ dòng LOẠI của SEPA, nhãn tiếng Việt", () => {
  const idx = screenerIndex({
    sepa: { engine: "sepa/SP6", evidence: { label: "EXPERIMENTAL" }, results: [{ ticker: "AAA", list: "SẴN SÀNG MUA", score: 80 }, { ticker: "BBB", list: "LOẠI" }] },
    camslim: { results: [{ ticker: "AAA", status: "BREAKOUT", grade: "A", metrics: { score: 77 } }] },
    patterns: { results: [{ ticker: "CCC", status: "CONFIRMED", type: "DOUBLE_BOTTOM", patterns: [{ label: "Đáy đôi", stateLabel: "Đã xác nhận" }] }] },
    convergence: null,
  });
  assert.deepEqual(idx.get("AAA").map((h) => h.label), ["SEPA", "CAN SLIM"]);
  assert.equal(idx.get("AAA")[0].status, "SẴN SÀNG MUA");
  assert.equal(idx.has("BBB"), false);
  assert.equal(idx.get("CCC")[0].status, "Đáy đôi · Đã xác nhận");
});
