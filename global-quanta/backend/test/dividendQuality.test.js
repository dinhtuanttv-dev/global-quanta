import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { annualSeries, companyDividendStats, createDividendQualityBase, dividendQuality, lintner, priceRisk } from "../src/market/events/dividendQuality.js";

// Chuỗi tổng hợp đúng mô hình Lintner: D_t = D_{t-1} + 0,4·(0,6·E_t − D_{t-1}) -> c = 0,4, r = 0,6
function synth(years = 14) {
  const out = []; let D = 100;
  for (let i = 0; i < years; i++) { const E = 400 + 30 * i + (i % 3) * 40; D = D + 0.4 * (0.6 * E - D); out.push({ year: 2010 + i, E, D, cfo: E * 1.1, capex: -E * 0.2 }); }
  return out;
}
test("BL2 Lintner: khôi phục đúng tốc độ điều chỉnh và tỷ lệ chi trả mục tiêu; thiếu năm / ngoài khoảng -> không nhận", () => {
  const lt = lintner(synth());
  assert.equal(lt.ok, true); assert.equal(lt.speed, 0.4); assert.equal(lt.targetPayout, 0.6); assert.equal(lt.r2, 1);
  assert.equal(lintner(synth(6)).ok, false); assert.match(lintner(synth(6)).reason, /8 năm/);
  const wild = synth().map((r, i) => ({ ...r, D: i % 2 ? 0 : r.E * 3 }));
  assert.equal(lintner(wild).ok, false);
});
test("BL2 chuỗi năm & độ bền cấp công ty: cổ tức đã trả (dương), bỏ năm hiện hành, chi trả / FCF 5 năm, chuỗi năm, số lần cắt", () => {
  const annual = [2021, 2022, 2023, 2024, 2025, 2026].map((y, i) => ({ year: y, v: { npatParent: 1000 + i * 100, divPaid: -(500 - (y === 2023 ? 200 : 0)), cfo: 1200, capex: -300 } }));
  const se = annualSeries(annual, 2026);
  assert.equal(se.length, 5); assert.equal(se[0].D, 500); assert.equal(se[2].D, 300);
  const c = companyDividendStats(se);
  assert.equal(c.payout5, Math.round((2300 / 6000) * 1e4) / 1e4);
  assert.equal(c.fcfCover5, Math.round((4500 / 2300) * 1e4) / 1e4);
  assert.equal(c.streak, 5); assert.equal(c.cuts10, 1);
});
test("BL2 rủi ro giá: biến động năm hoá, sụt giảm lớn nhất, lợi nhuận 1 năm, beta", () => {
  const days = Array.from({ length: 260 }, (_, i) => `d${String(i).padStart(3, "0")}`);
  const vn = new Map(days.map((d, i) => [d, 1000 * (1 + 0.001 * Math.sin(i))]));
  const rows = days.map((d, i) => [d, 100 * (1 + 0.002 * Math.sin(i)) * (i > 200 ? 0.7 : 1)]);
  const r = priceRisk(rows, vn);
  assert.ok(r.mdd1y < -0.29 && r.mdd1y > -0.32); assert.equal(r.ret1y, -0.3); assert.ok(r.vol1y > 0);
  // beta: lợi nhuận log của mã = 2 × thị trường
  const lv = days.map((d, i) => Math.log(vn.get(d)));
  const r2 = priceRisk(days.map((d, i) => [d, Math.exp(2 * lv[i])]), vn);
  assert.ok(Math.abs(r2.beta - 2) < 1e-3);
  assert.equal(priceRisk(rows.slice(0, 100), vn), null);
});
test("BL2 hồ sơ: lợi suất năm tài chính vs 12 tháng (cờ trả dồn), bảng 7 tiêu chí, cờ bẫy lợi suất, Lintner năm tới", () => {
  const series = synth();
  const fy = { lastFy: 2025, lastFyCash: 8000, history: [[2023, 3000], [2024, 3000], [2025, 8000]] };
  const q = dividendQuality({ series, price: 33000, mcap: 1e12, ttmCash: 11000, fy, risk: { ret1y: -0.56, vol1y: 0.47, mdd1y: -0.62, beta: 0.6 }, kq: { cfoToNpat: 1.2, netDebtEbitda: -0.5, growthTtm: -0.35, nowcastEst: null }, financial: false });
  assert.equal(q.yield.fy, 0.2424); assert.equal(q.yield.ttm, 0.3333); assert.equal(q.yield.catchUp, true); assert.equal(q.yield.median3, Math.round((3000 / 33000) * 1e4) / 1e4);
  assert.deepEqual(q.trap, ["giá giảm 56% trong 1 năm", "LNST 12 tháng giảm > 30%"]);
  assert.equal(q.checks.length, 7); assert.ok(q.checksKnown >= 6);
  assert.ok(q.lintnerNextD > 0);
  const bank = dividendQuality({ series, price: 50000, mcap: 1e12, ttmCash: 1000, fy: null, risk: null, kq: {}, financial: true });
  assert.equal(bank.checks.find((c) => c.id === "fcf").pass, null); assert.equal(bank.trap, null);
});
test("BL2 dịch vụ tính sẵn: đọc BCTC năm + giá điều chỉnh, lưu dq-base.json.gz", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dq-")); fs.mkdirSync(path.join(dir, "px"));
  fs.writeFileSync(path.join(dir, "AAA.json.gz"), zlib.gzipSync(JSON.stringify({ ticker: "AAA", tpl: "corp", quarters: [], annual: [{ year: 2024, v: { npatParent: 100, divPaid: -40 } }, { year: 2025, v: { npatParent: 120, divPaid: -50 } }] })));
  const s = createDividendQualityBase({ dir, now: () => Date.parse("2026-11-07T01:00:00Z"), log: { log() {} } });
  assert.equal((await s.run()).tickers, 1);
  assert.deepEqual(s.doc().byTicker.AAA.series.map((r) => r.D), [40, 50]);
  assert.equal(s.doc().byTicker.AAA.risk, null);
  fs.rmSync(dir, { recursive: true, force: true });
});
