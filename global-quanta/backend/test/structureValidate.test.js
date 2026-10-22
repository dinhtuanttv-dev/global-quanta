// Cấu trúc đa khung — T2: chạy thử toàn bộ quy trình kiểm định trên dữ liệu tổng hợp (không phải kết quả thật).
import test from "node:test";
import assert from "node:assert/strict";
import { MTF_PREREG, runStructureValidation } from "../src/market/structure/validate.js";
import { rng } from "../src/market/structure/ml.js";

function days(n) {
  const out = [], d = new Date("2021-10-01T00:00:00Z");
  while (out.length < n) { if (d.getUTCDay() % 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); }
  return out;
}
function walk(dates, seed, isIndex = false) {
  const r = rng(seed); let p = isIndex ? 1000 : 20_000 + r() * 30_000, drift = 0;
  return dates.map((date, i) => {
    if (i % 40 === 0) drift = (r() - 0.5) * 0.006;
    const o = p; p = Math.max(5_500, p * (1 + drift + (r() - 0.5) * 0.035));
    const hi = Math.max(o, p) * (1 + r() * 0.01), lo = Math.min(o, p) * (1 - r() * 0.01);
    return { date, open: o, high: hi, low: lo, close: p, volume: 1e6 * (0.5 + r()), value: p * 1e6 };
  });
}
function hourly(dailyBars, from) {
  const out = [];
  for (const b of dailyBars) {
    if (b.date < from) continue;
    let p = b.open;
    [9, 10, 11, 13, 14].forEach((hh, k) => {
      const c = k === 4 ? b.close : p + (b.close - b.open) / 5;
      out.push({ date: `${b.date} ${String(hh).padStart(2, "0")}:00`, open: p, high: Math.max(p, c) * 1.003, low: Math.min(p, c) * 0.997, close: c, volume: 2e5 });
      p = c;
    });
  }
  return out;
}

test("kiểm định chạy trọn trên dữ liệu tổng hợp: đủ khoá báo cáo, phán quyết hợp lệ, không NaN ở số liệu chính", { timeout: 600_000 }, () => {
  const ds = days(1250);
  const daily = { VNINDEX: walk(ds, 1, true) };
  for (let k = 0; k < 14; k++) daily[`S${String(k).padStart(2, "0")}`] = walk(ds, 100 + k);
  const h1 = { S00: hourly(daily.S00, "2023-01-03"), S01: hourly(daily.S01, "2023-01-03"), S02: hourly(daily.S02, "2023-01-03") };
  const rep = runStructureValidation({ daily, h1 });
  assert.equal(rep.prereg.version, MTF_PREREG.version);
  assert.deepEqual(Object.keys(rep.verdicts.final), ["H1", "H2", "H3", "H4", "H5"]);
  for (const v of Object.values(rep.verdicts.final)) assert.ok(["PASS", "FAIL", "FAIL_FDR", "INSUFFICIENT"].includes(v));
  assert.ok(rep.H1.IS.n > 0, "có sự kiện H1 trong mẫu");
  assert.ok(Number.isFinite(rep.H3.IS.ic), "IC H3 trong mẫu");
  assert.ok(rep.H2.aligned.IS.n >= 0);
  assert.ok(["PASS", "FAIL", "INSUFFICIENT"].includes(rep.meta.verdict));
  for (const h of MTF_PREREG.cqr.horizons) assert.ok(["PASS", "BASELINE", "FAIL", "INSUFFICIENT"].includes(rep.cqr[h].verdict));
  assert.ok(rep.hmm.typical.UP?.median > 0);
  assert.ok(["PASS", "FAIL", "INSUFFICIENT"].includes(rep.hmm.verdict));
});
