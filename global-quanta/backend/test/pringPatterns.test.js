// Pattern Scanner v2 (Pring) — P1: dữ liệu giả lập có đáp án biết trước cho từng mô hình, vòng đời, không nhìn trước, đơn vị VND.
import test from "node:test";
import assert from "node:assert/strict";
import { barPatternsAt, PRING, preparePattern, scanPatterns } from "../src/market/strategies/pring/index.js";
import { lifecycle } from "../src/market/strategies/pring/lifecycle.js";

const day = (i) => new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
/** Chuỗi nến từ các điểm mốc [phiên, giá] (nội suy tuyến tính) + nhiễu sin nhỏ; vol(i) tuỳ chọn. */
function series(legs, { vol = () => 1_000_000, k = 1, noise = 0.004 } = {}) {
  const n = legs[legs.length - 1][0] + 1, out = [];
  for (let i = 0; i < n; i++) {
    let j = 1; while (legs[j][0] < i) j++;
    const [i0, p0] = legs[j - 1], [i1, p1] = legs[j];
    const c = (p0 + ((p1 - p0) * (i - i0)) / (i1 - i0 || 1)) * (1 + noise * Math.sin(i * 1.7)) * k;
    const o = i ? out[i - 1].close : c;
    out.push({ date: day(i), open: o, high: Math.max(o, c) * 1.006, low: Math.min(o, c) * 0.994, close: c, volume: vol(i) });
  }
  return out;
}
const scanLast = (bars) => { const S = preparePattern(bars); return scanPatterns(S, S.n - 1); };
const find = (r, type) => r.find((x) => x.type === type);

// Đáy đôi: giảm dài 120 -> 80, hồi 92, về 80,5 (cách 30 thanh), phá vỡ 92 với KL lớn, lên 100.
const DB = [[0, 100], [40, 120], [100, 80], [115, 92], [130, 80.5], [140, 91], [143, 95], [150, 99]];
const dbBars = (extra = []) => series([...DB, ...extra], { vol: (i) => (i === 141 || i === 142 ? 3_000_000 : i > 120 && i < 140 ? 700_000 : 1_000_000) });

test("đáy đôi (ch8): nhận diện, phá vỡ đỉnh hồi dứt khoát giữ ≥ 2 thanh, mục tiêu log, KL 1-2-3", () => {
  const r = scanLast(dbBars());
  const p = find(r, "DOUBLE_BOTTOM");
  assert.ok(p, `không thấy đáy đôi: ${r.map((x) => x.type)}`);
  assert.equal(p.dir, "bull");
  assert.ok(["CONFIRMED", "PULLBACK", "TARGET1", "TARGET2", "TARGET3"].includes(p.state), p.state);
  assert.ok(p.breakout && p.breakout.date > day(130));
  const lvl = p.levelAtBreakout, h = Math.log(Math.max(...p.points.filter((x) => x.name.startsWith("Đáy")).map((x) => -x.price)) * -1);
  assert.ok(Math.abs(p.targets[0] / lvl - Math.exp(Math.log(lvl / Math.min(...p.points.filter((x) => x.name.startsWith("Đáy")).map((x) => x.price))))) < 1e-9, `mục tiêu 1× trên thang log ${h}`);
  assert.ok(p.checks.find((c) => c.key === "boVol").ok, "KL phá vỡ ≥ 1,5× TB25");
  assert.ok(p.plan.stop < p.plan.entry && p.plan.target > p.plan.entry);
});

test("thất bại (ch6): sau phá vỡ, quay lại ≥ 50% thân mô hình -> FAILED kèm lý do", () => {
  const r = scanLast(dbBars([[156, 84], [160, 83]]));
  const p = find(r, "DOUBLE_BOTTOM");
  assert.ok(p && p.state === "FAILED", p?.state);
  assert.match(p.failure.reason, /50%/);
});

test("phá vỡ 1 thanh rồi quay lại (ch17: phải giữ ≥ 2 thanh) -> FAILED 'không giữ được'", () => {
  const S = preparePattern(dbBars());
  const g = { dir: 1, startIdx: 100, endIdx: 130, level: () => 92, opposite: () => 80.5, height: Math.log(92 / 80.5), invalidation: 80 };
  // làm giả: thanh 141 đóng vượt, thanh 142 đóng lại dưới đường
  S.C[141] = 95; S.C[142] = 90; S.C[143] = 89;
  const lc = lifecycle(S, 143, g);
  assert.equal(lc.state, "FAILED");
  assert.match(lc.failReason, /2 thanh/);
});

test("mô hình cũ KHÔNG được báo (lỗi của Pattern Scanner cũ): đáy đôi hoàn thành ~200 phiên trước", () => {
  const bars = dbBars([[200, 104], [260, 110], [350, 108]]);
  const S = preparePattern(bars);
  const now = scanPatterns(S, S.n - 1).filter((x) => x.type === "DOUBLE_BOTTOM");
  assert.equal(now.length, 0);
  const then = scanPatterns(S, 150).filter((x) => x.type === "DOUBLE_BOTTOM");
  assert.equal(then.length, 1, "tại thời điểm phá vỡ thì có");
});

test("vai-đầu-vai đỉnh (ch7): đầu cao nhất, viền cổ qua hai đáy, phá vỡ xuống, mục tiêu = đầu–viền cổ chiếu xuống", () => {
  const legs = [[0, 60], [60, 95], [75, 85], [95, 106], [110, 85.5], [125, 95], [140, 84.8], [143, 81], [150, 76]];
  const bars = series(legs, { vol: (i) => (i < 75 ? 1_600_000 : i < 110 ? 1_300_000 : i < 140 ? 700_000 : 2_000_000) });
  const r = scanLast(bars);
  const p = r.find((x) => x.family === "hs");
  assert.ok(p, `không thấy vai-đầu-vai: ${r.map((x) => x.type)}`);
  assert.equal(p.type, "HS_TOP");
  assert.equal(p.dir, "bear");
  assert.deepEqual(p.points.map((x) => x.name), ["Vai trái", "Viền cổ 1", "Đầu", "Viền cổ 2", "Vai phải"]);
  assert.ok(p.checks.find((c) => c.key === "rsVol").ok, "KL vai phải thấp hơn");
  assert.ok(p.targets[0] < p.levelAtBreakout);
  assert.ok(p.invalidation > 100, "vô hiệu khi vượt đầu");
});

test("vai-đầu-vai ngược (đáy) đối xứng", () => {
  const legs = [[0, 140], [60, 90], [75, 100], [95, 80], [110, 99.5], [125, 90], [140, 101.5], [143, 105], [150, 110]];
  const r = scanLast(series(legs, { vol: (i) => (i >= 141 && i <= 143 ? 3e6 : 1e6) }));
  const p = r.find((x) => x.family === "hs");
  assert.ok(p && p.dir === "bull" && p.type === "HS_BOTTOM", `${r.map((x) => x.type)}`);
});

test("tam giác tăng góc vuông (ch9): biên trên ngang chạm ≥ 2 lần, đáy cao dần, phá vỡ lên", () => {
  const legs = [[0, 60], [50, 88], [65, 100], [80, 86], [95, 100], [110, 91], [125, 100], [135, 95], [140, 99.5], [143, 104], [150, 108]];
  const r = scanLast(series(legs, { vol: (i) => (i >= 141 && i <= 143 ? 3e6 : 1e6 - i * 2000) }));
  const p = find(r, "ASC_TRIANGLE");
  assert.ok(p, `không thấy tam giác tăng: ${r.map((x) => x.type)}`);
  assert.equal(p.dir, "bull");
  assert.ok(p.breakout);
});

test("cờ tăng (ch12): cột cờ dốc, thân cờ ngắn nghiêng xuống, phá vỡ theo hướng cột; mục tiêu = chiều dài cột", () => {
  const legs = [[0, 50], [100, 52], [108, 65], [118, 61], [119, 63.5], [121, 66], [126, 70]];
  const r = scanLast(series(legs, { noise: 0.002, vol: (i) => (i > 100 && i <= 108 ? 3e6 : i > 108 && i <= 118 ? 6e5 : 1e6) }));
  const p = r.find((x) => x.family === "flag");
  assert.ok(p, `không thấy cờ: ${r.map((x) => x.type)}`);
  assert.equal(p.dir, "bull");
  assert.equal(p.role, "continuation");
});

test("thanh nến (ch13–16): outside bar đảo chiều, đảo chiều chủ chốt, Pinocchio xuyên kháng cự", () => {
  const base = series([[0, 100], [10, 110]]);
  const mk = (o, h, l, c) => ({ date: day(base.length), open: o, high: h, low: l, close: c, volume: 2e6 });
  const ob = [...base, mk(110.5, 112, 107, 107.3)];
  assert.ok(barPatternsAt(preparePattern(ob), ob.length - 1).some((x) => x.kind === "OUTSIDE" && x.dir === "bear"));
  const kr = [...base, mk(112.5, 114.5, 108.5, 109)];
  assert.ok(barPatternsAt(preparePattern(kr), kr.length - 1).some((x) => x.kind === "KEY_REVERSAL" && x.dir === "bear"));
  const pin = [...base, mk(109.5, 114, 109.2, 109.6)];
  assert.ok(barPatternsAt(preparePattern(pin), pin.length - 1, 111).some((x) => x.kind === "PINOCCHIO" && x.dir === "bear"));
});

const sig = (r) => JSON.stringify(r.map((x) => [x.type, x.dir, x.state, x.startDate, x.endDate, x.breakout?.date ?? null, x.score]));

test("không nhìn trước: kết quả tại t trên chuỗi đầy đủ = trên chuỗi cắt tới t", () => {
  for (const bars of [dbBars([[200, 104], [260, 110]]), series([[0, 60], [60, 95], [75, 85], [95, 106], [110, 85.5], [125, 95], [140, 84.8], [150, 76], [200, 70]])]) {
    const S = preparePattern(bars);
    for (const t of [120, 135, 142, 145, 150, 170, bars.length - 1]) {
      if (t >= bars.length) continue;
      assert.equal(sig(scanPatterns(S, t)), sig(scanPatterns(preparePattern(bars.slice(0, t + 1)), t)), `t=${t}`);
    }
  }
});

test("bất biến đơn vị giá: ×1.000 (VND) cho cùng mô hình, trạng thái, ngày phá vỡ", () => {
  const a = dbBars(), b = a.map((x) => ({ ...x, open: x.open * 1000, high: x.high * 1000, low: x.low * 1000, close: x.close * 1000 }));
  assert.equal(sig(scanLast(a)), sig(scanLast(b)));
});

test("ngưỡng đặt trước theo sách: giữ 2 thanh, quay lại 50%, R:R 3:1, đỉnh đôi cách ≥ 20 thanh", () => {
  assert.equal(PRING.holdBars, 2);
  assert.equal(PRING.failRetrace, 0.5);
  assert.equal(PRING.minRewardRisk, 3);
  assert.equal(PRING.double.minSep, 20);
});

test("hiệu năng: một phiên trên chuỗi 750 thanh < 20 ms", () => {
  const legs = []; for (let k = 0; k <= 25; k++) legs.push([k * 30, 100 + 20 * Math.sin(k) + k]);
  const S = preparePattern(series(legs));
  const t0 = performance.now();
  for (let t = 600; t < S.n; t++) scanPatterns(S, t);
  const per = (performance.now() - t0) / (S.n - 600);
  assert.ok(per < 20, `${per.toFixed(1)} ms/phiên`);
});
