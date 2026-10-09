// SEPA SP1 — quy tắc theo sách (giá trị in trong sách), không nhìn trước, bất biến đơn vị giá VND.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import {
  SEPA, compoundRoi, fmtPct, losingStreakSizeFactor, planTrade, prepareSepa, projectIntradayVolume, pyRound, requiredWinRate,
  rollMean, rsRatings, sepaTechnical, stopLossPct, trailingStopUpdate, weekFriday,
} from "../src/market/strategies/sepa/index.js";

const ORACLE = JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/sepa/oracle.json.gz", import.meta.url))).toString("utf8"));
const barsOf = (name, k = 1) => { const s = ORACLE.series[name]; return s.date.map((date, i) => ({ date, open: s.open[i] * k, high: s.high[i] * k, low: s.low[i] * k, close: s.close[i] * k, volume: s.volume[i] })); };
const near = (a, b, eps) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

test("Hình 13.1 [s.368]: ROI kép sau 10 giao dịch", () => {
  near(compoundRoi(0.4, 0.2, 0.1), 0.102, 5e-4);
  near(compoundRoi(0.5, 0.48, 0.24), 0.8004, 5e-4);
  near(compoundRoi(0.4, 0.48, 0.24), -0.0755, 5e-4);
  near(compoundRoi(0.3, 1, 0.5), -0.9375, 5e-3);
});

test("dừng lỗ [s.355–357, s.370]: ½ lãi TB, tối đa 10%, thị trường khó 6%; tỷ lệ thắng tối thiểu", () => {
  near(stopLossPct(0.15), 0.075, 1e-12);
  near(stopLossPct(0.3), 0.1, 1e-12);
  near(stopLossPct(0.15, 0.1, true), 0.06, 1e-12);
  near(requiredWinRate(2), 1 / 3, 1e-12);
  near(requiredWinRate(3), 0.25, 1e-12);
});

test("dời stop về hòa vốn khi lãi 3R [s.366] — ví dụ mua $50, stop $47,50", () => {
  assert.equal(trailingStopUpdate(50, 47.5, 57.5), 50);
  assert.equal(trailingStopUpdate(50, 47.5, 55), 47.5);
});

test("kế hoạch lệnh: stop > 10% bị gắn cờ, trần 25%/vị thế, lô 100 cp", () => {
  const p = planTrade(100, 80, 1_000_000);
  assert.ok(p.stopTooWide && p.stopPct <= 0.1);
  assert.ok(p.positionPct <= 0.25 + 1e-9 && p.shares % 100 === 0);
});

test("mặc định người dùng: rủi ro 5%/lệnh, lãi TB 15% -> stop 7,5%; trần 25% chặn -> rủi ro thực ≈ 1,9% vốn", () => {
  assert.equal(SEPA.risk.riskPerTrade, 0.05);
  const p = planTrade(25_000, null, 1e9);
  near(p.stopPct, 0.075, 1e-9);
  assert.equal(p.shares, 10_000); // 25% × 1 tỷ / 25.000đ
  near(p.riskPctEquity, 0.25 * 0.075, 1e-9);
  assert.ok(p.notes.some((x) => x.includes("Giới hạn vị thế 25% vốn")));
});

test("chuỗi thua giảm quy mô [s.361–362]; ngoại suy KL trong phiên HOSE 255 phút [s.270]", () => {
  assert.equal(losingStreakSizeFactor([1, -1, -1]), 0.4);
  assert.equal(losingStreakSizeFactor([]), 1);
  near(projectIntradayVolume(500_000, 120), 1_062_500, 1e-6);
});

test("số học kiểu Python: làm tròn nửa-về-chẵn, định dạng %, trung bình trượt Kahan, tuần W-FRI", () => {
  assert.equal(pyRound(12.5), 12);
  assert.equal(pyRound(13.5), 14);
  assert.equal(pyRound(2.675, 2), 2.67); // 2.675 nhị phân < 2.675
  assert.equal(pyRound(0.125, 2), 0.12);
  assert.equal(fmtPct(0.265), "26%");
  assert.equal(fmtPct(0.075, 1), "7.5%");
  const r = rollMean(Float64Array.from([1, 2, 3, 4, 5]), 3, 2);
  assert.deepEqual(Array.from(r).map((x) => (Number.isNaN(x) ? null : x)), [null, 1.5, 2, 3, 4]);
  assert.equal(weekFriday("2026-10-05"), "2026-10-09");
  assert.equal(weekFriday("2026-10-10"), "2026-10-16");
});

test("RS Rating: 1–99, mã mạnh nhất = 99", () => {
  const raw = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`S${i}`, i / 10]));
  const r = rsRatings(raw);
  assert.ok(Math.min(...Object.values(r)) >= 1 && Math.max(...Object.values(r)) <= 99);
  assert.equal(r.S49, 99);
});

const sig = (r) => JSON.stringify({ tt: r.trend.score, st: r.stage.stage, bc: r.stage.baseCount, p: r.patterns.map((p) => [p.name, p.detected, p.status, p.footprint, p.reasonsFailed]) });

test("không nhìn trước: phân tích tại t trên chuỗi đầy đủ = trên chuỗi cắt tới t", () => {
  for (const name of ["vcpbo2", "squat", "cup", "threec", "power", "multibase", "topping"]) {
    const bars = barsOf(name), S = prepareSepa(bars);
    for (const t of [bars.length - 1, bars.length - 4, bars.length - 25, 240]) {
      if (t < 60) continue;
      const full = sepaTechnical(S, t, { rs: 85 }), cut = sepaTechnical(prepareSepa(bars.slice(0, t + 1)), t, { rs: 85 });
      assert.equal(sig(full), sig(cut), `${name}@${t}`);
      assert.deepEqual(full.plan, cut.plan);
    }
  }
});

test("bất biến đơn vị giá: nhân giá ×1.000 (VND) cho cùng mô hình, trạng thái, dấu chân", () => {
  for (const name of ["vcp1", "vcpbo1", "flat", "cup", "threec", "power", "ipo"]) {
    const a = barsOf(name), b = barsOf(name, 1000), ld = ORACLE.series[name].listing_date;
    const ra = sepaTechnical(prepareSepa(a), a.length - 1, { rs: 85, listingDate: ld }), rb = sepaTechnical(prepareSepa(b), b.length - 1, { rs: 85, listingDate: ld });
    assert.equal(sig(ra), sig(rb), name);
    if (ra.plan) near(rb.plan.stopPct, ra.plan.stopPct, 1e-9);
  }
});

test("hiệu năng: một phiên trên chuỗi ~340 phiên < 5 ms (đủ cho kiểm định point-in-time SP3)", () => {
  const S = prepareSepa(barsOf("vcpbo3"));
  const t0 = performance.now();
  for (let t = 200; t < S.n; t++) sepaTechnical(S, t, { rs: 85 });
  const per = (performance.now() - t0) / (S.n - 200);
  assert.ok(per < 5, `${per.toFixed(2)} ms/phiên`);
});
