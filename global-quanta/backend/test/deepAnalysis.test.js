import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildForensicPayload, createForensicSource, equalWeightPortfolio } from "../src/market/research/deepAnalysis.js";

const fixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));

test("X5 forensics: HPG (BCTC năm thật VNDirect 2025/2024) -> đủ 2 kỳ, ánh xạ đúng chỉ tiêu", () => {
  const p = buildForensicPayload("HPG", fixture("vnd-hpg-annual.json"), "2026-10-16T00:00:00Z");
  assert.equal(p.applicable, true, p.reason);
  assert.deepEqual(p.fiscalDates, ["2025-12-31", "2024-12-31"]);
  assert.equal(p.current.period, "2025");
  assert.equal(p.current.sales, 156116094618482);
  assert.equal(p.current.totalAssets, 257899200817547);
  assert.equal(p.current.workingCapital, p.current.currentAssets - p.current.currentLiabilities);
  assert.ok(p.current.ebit > p.current.netIncome, "EBIT = LNTT + lãi vay > LNST");
  assert.ok(p.current.sharesOutstanding > 7e9 && p.current.sharesOutstanding < 8e9, "vốn góp / mệnh giá 10.000");
  assert.ok(p.current.ppeGross >= p.current.receivables);
});

test("X5 forensics: ngân hàng (VCB, mẫu BCTC khác) -> không áp dụng, không bịa số", () => {
  const p = buildForensicPayload("VCB", fixture("vnd-vcb-annual.json"), "2026-10-16T00:00:00Z");
  assert.equal(p.applicable, false);
  assert.equal(p.current, null);
  assert.match(p.reason, /ngân hàng/);
});

test("X5 forensics: mã sai -> 400; nguồn lỗi -> 503; có cache", async () => {
  let calls = 0;
  const ok = createForensicSource({ fetchImpl: async () => { calls++; return new Response(JSON.stringify({ data: fixture("vnd-hpg-annual.json") })); } });
  await assert.rejects(ok("??"), (e) => e.statusCode === 400);
  await ok("hpg");
  await ok("HPG");
  assert.equal(calls, 1);
  const bad = createForensicSource({ fetchImpl: async () => new Response("x", { status: 500 }) });
  await assert.rejects(bad("HPG"), (e) => e.statusCode === 503);
});

const bars = (closes, start = 1) => closes.map((c, i) => ({ date: `2026-01-${String(start + i).padStart(2, "0")}`, close: c }));

test("X5 danh mục: cân bằng tỷ trọng trên ngày chung, beta ≈ 2 khi danh mục biến động gấp đôi chỉ số", () => {
  const n = 25;
  const idx = [100];
  const a = [10];
  for (let i = 1; i < n; i++) {
    const r = (i % 3 === 0 ? -1 : 1) * 0.01 * (1 + (i % 5) / 10);
    idx.push(idx[i - 1] * (1 + r));
    a.push(a[i - 1] * (1 + 2 * r));
  }
  // B chỉ có từ ngày 3 -> ngày chung bắt đầu từ ngày 3
  const p = equalWeightPortfolio({ A: bars(a), B: bars(a.slice(2), 3) }, bars(idx));
  assert.equal(p.dates[0], "2026-01-04");
  assert.equal(p.dailyReturns.length, n - 3);
  assert.ok(Math.abs(p.dailyReturns[0] - (a[3] / a[2] - 1)) < 1e-6);
  assert.equal(p.beta, null, "dưới 60 cặp -> không ước lượng beta");
  const long = Array.from({ length: 80 }, (_, i) => i);
  const ix = [100], st = [50];
  for (const i of long.slice(1)) {
    const r = Math.sin(i * 1.3) * 0.01;
    ix.push(ix[i - 1] * (1 + r));
    st.push(st[i - 1] * (1 + 2 * r));
  }
  const mk = (cl) => cl.map((c, i) => ({ date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), close: c }));
  const q = equalWeightPortfolio({ X: mk(st) }, mk(ix));
  assert.ok(Math.abs(q.beta - 2) < 0.01, String(q.beta));
});
