// MV2 — bộ kiểm định SEAS-prereg-v1 chạy đúng TRƯỚC khi chạm dữ liệu thật: mùa vụ dựng sẵn -> PASS; nhiễu -> FAIL; không nhìn trước
// năm kiểm tra; hash cấu hình; Spearman / bootstrap.
import test from "node:test";
import assert from "node:assert/strict";
import { forecastsForYear, hashConfig, runSeasonalityValidation, spearman, bootstrapMeanCi } from "../src/market/seasonality/validate.js";
import { mulberry32 } from "../src/market/seasonality/strength.js";
import { SEAS } from "../src/market/seasonality/config.js";

const CFG = {
  prereg: "SEAS-prereg-v1", engine: { ...SEAS }, trainStartYear: 2021, minTrainYears: 3, maxTrainYears: 5, testYears: [2024, 2025, 2026], testEnd: "2026-09",
  minCrossSection: 30, quantiles: 5, bootstrap: { iters: 2000, seed: 7, level: 0.9 }, thresholds: { tMin: 2, yearsPositiveMin: 2 },
};

function universe({ effect, n = 60, seed = 1 }) {
  const rng = mulberry32(seed);
  const g = () => { const u = Math.max(1e-12, rng()), v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const mk = (fx) => {
    const bars = []; let px = 50;
    for (let d = new Date("2020-11-02T00:00:00Z"); d <= new Date("2026-10-28T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
      const w = d.getUTCDay(); if (w === 0 || w === 6) continue;
      px *= Math.exp(fx(d.getUTCMonth()) / 21 + 0.015 * g());
      bars.push({ date: d.toISOString().slice(0, 10), close: px });
    }
    return bars;
  };
  const seriesOf = new Map(), sectorOf = new Map();
  for (let i = 0; i < n; i++) {
    const t = `T${String(i).padStart(2, "0")}`, sec = `S${i % 6}`;
    // Mùa vụ theo NGÀNH (mã cùng ngành cùng tháng mạnh — như thực tế, VD ngân hàng / bán lẻ). Lưu ý: nếu hai nhóm cùng ngành lệch
    // pha 6 tháng, co rút về ngành làm placebo dịch 6 tháng thắng (C4 thận trọng hơn, không dễ dãi hơn) — xem MV2 nhật ký.
    const phase = (i % 6) * 2;
    seriesOf.set(t, mk((m) => effect(m, phase))); sectorOf.set(t, sec);
  }
  return { seriesOf, sectorOf, benchBars: mk(() => 0) };
}

test("Spearman (có hạng bằng nhau) + bootstrap theo cụm tất định", () => {
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.ok(Math.abs(spearman([1, 2, 2, 3], [3, 2, 2, 1]) + 1) < 1e-12);
  const a = bootstrapMeanCi([0.1, 0.2, 0.3, 0.4], { iters: 500, seed: 3, level: 0.9 });
  assert.deepEqual(a, bootstrapMeanCi([0.1, 0.2, 0.3, 0.4], { iters: 500, seed: 3, level: 0.9 }));
  assert.ok(a[0] < 0.25 && a[1] > 0.25);
});

test("hash cấu hình: đổi một ngưỡng -> hash khác (cấu hình chốt không sửa lén được)", () => {
  const h = hashConfig(CFG);
  assert.equal(hashConfig({ ...CFG, sha256: "x" }), h, "bỏ qua trường sha256");
  assert.notEqual(hashConfig({ ...CFG, thresholds: { ...CFG.thresholds, tMin: 1.9 } }), h);
});

test("point-in-time: dự báo năm Y không đổi khi dữ liệu năm Y thay đổi", () => {
  const u = universe({ effect: (m, p) => (m === p ? 0.04 : 0), n: 12 });
  const f1 = forecastsForYear({ ...u, Y: 2024, cfg: CFG });
  const bumped = new Map([...u.seriesOf].map(([t, b]) => [t, b.map((x) => (x.date >= "2024-01-01" ? { ...x, close: x.close * 3 } : x))]));
  const f2 = forecastsForYear({ ...u, seriesOf: bumped, Y: 2024, cfg: CFG });
  assert.deepEqual(f1, f2);
  assert.equal(forecastsForYear({ ...u, Y: 2023, cfg: CFG }), null, "2023 chỉ có 2 năm huấn luyện < 3");
});

test("mùa vụ ổn định dựng sẵn -> PASS cả 4 tiêu chí; thị trường không có mùa vụ -> FAIL", () => {
  const good = runSeasonalityValidation({ ...universe({ effect: (m, p) => (m === p ? 0.06 : -0.005) }), cfg: CFG });
  assert.equal(good.verdict, "PASS", JSON.stringify(Object.fromEntries(Object.entries(good.criteria).map(([k, v]) => [k, v.pass]))));
  assert.equal(good.criteria.C1_ic.months, 33, "33 tháng kiểm tra (01/2024 → 09/2026)");
  assert.equal(good.criteria.C4_placebo.rank, 1);
  const none = runSeasonalityValidation({ ...universe({ effect: () => 0, seed: 9 }), cfg: CFG });
  assert.equal(none.verdict, "FAIL");
  assert.equal(none.label, "THĂM DÒ");
});
