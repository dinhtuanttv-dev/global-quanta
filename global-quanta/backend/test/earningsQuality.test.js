import test from "node:test";
import assert from "node:assert/strict";
import { buildEarningsQuality, EQ, quarterLabel, robustGrowth, standardizedSurprise, tickerQuality } from "../src/market/fundamentals/earningsQuality.js";

const B = 1e9;
/** n quý liên tiếp kết thúc ở endFiscal; npat(i), revenue(i) theo chỉ số từ quý cũ nhất. */
function quarters(n, npat, revenue, { end = "2026-09-30", publishLag = 30 } = {}) {
  const out = [];
  const ey = Number(end.slice(0, 4)), eq = Math.ceil(Number(end.slice(5, 7)) / 3);
  for (let i = 0; i < n; i++) {
    const k = ey * 4 + (eq - 1) - (n - 1 - i);
    const y = Math.floor(k / 4), q = (k % 4) + 1, m = q * 3;
    const fiscal = `${y}-${String(m).padStart(2, "0")}-${m === 3 || m === 12 ? 31 : 30}`;
    const created = new Date(Date.parse(`${fiscal}T00:00:00Z`) + publishLag * 864e5).toISOString().slice(0, 10);
    out.push({ fiscal, created, npat: npat(i), revenue: revenue(i) });
  }
  return out;
}

test("EQ tăng trưởng có kiểm soát: lỗ→lãi, lãi→lỗ, nền thấp, giới hạn [−100%; +300%]", () => {
  assert.equal(robustGrowth(10 * B, -2 * B).status, "TURNAROUND");
  assert.equal(robustGrowth(-1 * B, 3 * B).status, "TO_LOSS");
  assert.equal(robustGrowth(-1 * B, -3 * B).status, "LOSS");
  const low = robustGrowth(500 * B, 1.2 * B, 300 * B); // kỳ gốc 1,2 tỷ (< 5 tỷ) -> +41.567% thô
  assert.equal(low.status, "LOW_BASE");
  assert.equal(low.value, EQ.growthMax);
  assert.ok(low.raw > 400);
  const n = robustGrowth(120 * B, 100 * B, 100 * B);
  assert.equal(n.status, "NORMAL"); assert.ok(Math.abs(n.value - 0.2) < 1e-12);
  assert.equal(robustGrowth(null, 1).status, "NA");
  assert.equal(quarterLabel("2026-09-30"), "Q3/2026");
});

test("EQ SUE: bất ngờ lớn so với lịch sử biến động -> SUE cao; thiếu lịch sử -> null", () => {
  const steady = quarters(14, (i) => (100 + i + (i % 4) * 5 + ((i * 7) % 5) + (i === 13 ? 60 : 0)) * B, (i) => 1000 * B);
  const r = tickerQuality(steady, "2026-12-31");
  assert.ok(r.sue > 2, `SUE ${r.sue}`);
  const short = quarters(6, (i) => (100 + i) * B, () => 1000 * B);
  assert.equal(tickerQuality(short, "2026-12-31").sue, null);
  const m = new Map(steady.map((q) => [`${q.fiscal.slice(0, 4)}-${Math.ceil(Number(q.fiscal.slice(5, 7)) / 3)}`, q.npat]));
  assert.equal(standardizedSurprise(m, steady.at(-1).fiscal), r.sue);
});

test("EQ point-in-time: quý chưa công bố tới `today` không được dùng", () => {
  const qs = quarters(12, (i) => (100 + i) * B, () => 1000 * B, { publishLag: 40 });
  const before = tickerQuality(qs, qs.at(-1).created.replace(/\d{2}$/, "01")); // trước ngày công bố quý cuối
  assert.equal(before.fiscal, qs.at(-2).fiscal);
  assert.equal(tickerQuality(qs, "2027-01-31").fiscal, qs.at(-1).fiscal);
});

test("EQ xếp hạng: mã nền thấp +41.509% KHÔNG đứng đầu; chỉ xếp mã đã công bố quý mới nhất; điểm 0–100", () => {
  const fund = {
    LOWB: quarters(14, (i) => (i === 13 ? 500 * B : i === 9 ? 1.2 * B : (i % 2 ? 1.5 : 2) * B), (i) => 50 * B),
    GOOD: quarters(14, (i) => (100 + 3 * i + (i === 13 ? 40 : 0)) * B, (i) => (1000 + 20 * i + (i === 13 ? 150 : 0)) * B),
    FLAT: quarters(14, (i) => (100 + (i % 3)) * B, (i) => 1000 * B),
    BAD: quarters(14, (i) => (i === 13 ? 40 : 120 + i) * B, (i) => (i === 13 ? 800 : 1000) * B),
    TURN: quarters(14, (i) => (i === 13 ? 30 : i === 9 ? -20 : 10) * B, (i) => 500 * B),
    OLD: quarters(13, (i) => (100 + i) * B, () => 1000 * B, { end: "2026-06-30" }),
  };
  const r = buildEarningsQuality(fund, { today: "2026-12-31" });
  assert.equal(r.latestQuarter, "Q3/2026");
  const by = Object.fromEntries(r.rows.map((x) => [x.ticker, x]));
  assert.equal(by.LOWB.npatStatus, "LOW_BASE");
  assert.ok(by.LOWB.npatYoYRaw > 400, "tăng trưởng thô vẫn được giữ để hiển thị minh bạch");
  assert.equal(by.TURN.npatStatus, "TURNAROUND");
  assert.equal(by.OLD.current, false); assert.equal(by.OLD.rank, null);
  assert.equal(by.GOOD.rank, 1, `xếp hạng: ${r.rows.map((x) => `${x.ticker}:${x.rank}:${x.score}`).join(" ")}`);
  assert.equal(by.LOWB.rank, null, "nền thấp: không xếp hạng (minh bạch qua ghi chú), không thể đứng đầu");
  assert.equal(by.LOWB.score, null);
  assert.ok(by.BAD.rank > by.GOOD.rank);
  for (const x of r.rows.filter((x) => x.score != null)) assert.ok(x.score >= 0 && x.score <= 100);
  assert.equal(r.counts.reportedLatest, 5);
  assert.equal(r.label, "MÔ TẢ");
  assert.match(by.LOWB.notes.join(" | "), /kỳ gốc thấp/);
  assert.match(by.TURN.notes.join(" | "), /lỗ sang lãi/);
  assert.equal(by.GOOD.spark.length, EQ.spark);
});

test("EQ service: đọc KV alpha:vnd, đệm theo lần làm mới; kho lỗi -> bản gần nhất kèm stale; chưa có dữ liệu -> null", async () => {
  const { createEarningsQualityService } = await import("../src/market/fundamentals/earningsQualityService.js");
  let kv = { value: { fetchedAt: "2026-11-05T10:00:00Z", source: "VNDIRECT_FINFO", fund: { AAA: quarters(14, (i) => (100 + i + ((i * 7) % 5)) * B, (i) => 1000 * B) } } };
  let fail = false, reads = 0;
  const store = { getKv: async () => { reads++; if (fail) throw new Error("kho lỗi"); return kv; } };
  const svc = createEarningsQualityService({ store, now: () => Date.parse("2026-12-31T03:00:00Z") });
  const a = await svc.quality();
  assert.equal(a.rows[0].ticker, "AAA");
  assert.equal(a.source, "VNDIRECT_FINFO");
  assert.equal(await svc.quality(), a, "cùng lần làm mới, cùng ngày -> dùng lại");
  fail = true;
  const s = await svc.quality();
  assert.equal(s.stale, true); assert.match(s.staleReason, /kho lỗi/);
  const empty = createEarningsQualityService({ store: { getKv: async () => null } });
  assert.equal(await empty.quality(), null);
  assert.ok(reads >= 3);
});
