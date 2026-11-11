// P3 (FW-v1): kho BCTC quý hợp nhất VNDirect > VCI + ngày công bố thật thay "hết quý + 45 ngày".
import test from "node:test";
import assert from "node:assert/strict";
import { agree, availability, createFundamentalsWarehouse, fromVci, fromVnd, mergeFundamentals, reconcile } from "../src/market/fundamentals/warehouse.js";
import { vnQuarterly } from "../src/market/strategies/sepa/fundamentals.js";
import { quartersAvailable } from "../src/market/strategies/canSlimV2.js";

const qe = (y, q) => new Date(Date.UTC(y, q * 3, 0)).toISOString().slice(0, 10);
// 8 quý 2024Q4 … 2026Q3; quý 3/2026 công bố 20/10/2026 (VNDirect tạo 22/10, CafeF tin công bố 20/10).
const Q = [[2024, 4], [2025, 1], [2025, 2], [2025, 3], [2025, 4], [2026, 1], [2026, 2], [2026, 3]];
const vndRec = { tpl: "corp", quarters: Q.map(([y, q], i) => ({ fiscal: qe(y, q), created: y === 2026 && q === 3 ? "2026-10-22T08:00:00" : `${qe(y, q).slice(0, 8)}28`.replace(/-(\d{2})-28$/, (m, mo) => `-${String(Math.min(12, Number(mo) + 1)).padStart(2, "0")}-28`),
  v: { revenue: 1e12 * (10 + i), npatParent: 1e11 * (10 + i), gross: 3e11, inventory: 5e11, recvCust: 2e11 } })) };
const vciFa = { income: { quarters: Q.slice(0, 7).map(([y, q], i) => ({ year: y, quarter: q, revenue: 1e12 * (10 + i) * 1.002, netProfit: 1e11 * (10 + i), grossProfit: 3e11 })) },
  balance: { quarters: Q.slice(0, 7).map(([y, q]) => ({ year: y, quarter: q, inventory: 5e11, receivables: 2e11 })) } };

test("availability: ngày SAU ngày công bố sớm nhất đáng tin (CafeF FILING / VNDirect); ngoài (0, 120] ngày hoặc lớp PRESS -> bỏ; không có -> hết quý + 45", () => {
  assert.deepEqual(availability("2026-09-30", { cafef: { date: "2026-10-20", tier: "FILING" }, created: "2026-10-22T08:00:00" }), { availableAt: "2026-10-21", basis: "CAFEF", disclosed: "2026-10-20" });
  assert.deepEqual(availability("2026-09-30", { cafef: { date: "2026-10-18", tier: "PRESS" }, created: "2026-10-22" }), { availableAt: "2026-10-23", basis: "VND_CREATED", disclosed: "2026-10-22" });
  assert.equal(availability("2026-09-30", { created: "2027-03-01" }).basis, "EST45"); // > 120 ngày: ngày tạo lại khi điều chỉnh, không phải ngày công bố
  assert.equal(availability("2026-09-30", { created: "2026-09-30" }).basis, "EST45");
  assert.deepEqual(availability("2026-09-30", {}), { availableAt: "2026-11-14", basis: "EST45", disclosed: null });
});

test("agree / reconcile: khớp ≤ 1% hoặc lệch < 1 tỷ; phân loại chỉ một nguồn", () => {
  assert.equal(agree(100e9, 100.5e9), true); assert.equal(agree(100e9, 103e9), false); assert.equal(agree(1e8, 5e8), true); assert.equal(agree(null, 1), null);
  const r = reconcile(fromVnd(vndRec), fromVci(vciFa));
  assert.equal(r.overlap, 14); assert.equal(r.agreeRate, 1);
  assert.deepEqual(r.rows.filter((x) => x.status === "VND_ONLY").map((x) => x.fiscal), ["2026-09-30", "2026-09-30"]);
});

test("mergeFundamentals: VNDirect là nguồn chính từng chỉ tiêu; quý 3/2026 (chỉ VNDirect) dùng được từ 21/10 thay vì 14/11", () => {
  const dates = new Map([["2026-09-30", { date: "2026-10-20", tier: "FILING" }]]);
  const m = mergeFundamentals({ vndRec, vciFa, cafefDates: dates });
  assert.deepEqual(m.meta.sources, { revenue: "VND", netProfit: "VND", grossProfit: "VND", inventory: "VND", receivables: "VND" });
  const last = m.fa.income.quarters.at(-1);
  assert.equal(last.year, 2026); assert.equal(last.quarter, 3); assert.equal(last.availableAt, "2026-10-21"); assert.equal(last.availBasis, "CAFEF");
  assert.equal(last.netProfit, 1.7e12); assert.equal(m.fa.balance.quarters.at(-1).receivables, 2e11);
  // SEPA tại 05/11/2026: cách cũ (hết quý + 45) chưa thấy quý 3; FW-v1 thấy.
  assert.equal(vnQuarterly(vciFa, "2026-11-05").latestQuarter, "Q2/2026");
  const q = vnQuarterly(m.fa, "2026-11-05");
  assert.equal(q.latestQuarter, "Q3/2026"); assert.equal(q.availBasis, "CAFEF"); assert.equal(q.disclosed, "2026-10-20");
  assert.match(q.source, /FW-v1/);
  assert.equal(vnQuarterly(m.fa, "2026-10-20").latestQuarter, "Q2/2026"); // ngày công bố: chưa dùng (BCTC ra sau phiên)
  assert.equal(quartersAvailable(m.fa.income.quarters, "2026-10-21")[0].quarter, 3); // CAN SLIM cùng quy tắc
  assert.equal(quartersAvailable(vciFa.income.quarters, "2026-10-21")[0].quarter, 2);
});

test("mergeFundamentals: chỉ tiêu VNDirect thiếu (ngân hàng không có doanh thu / tồn kho) -> cả chuỗi lấy từ VCI; vá quý thiếu chỉ khi hai nguồn khớp", () => {
  const bank = { tpl: "bank", quarters: vndRec.quarters.map((q) => ({ ...q, v: { npatParent: q.v.npatParent } })) };
  const m = mergeFundamentals({ vndRec: bank, vciFa });
  assert.equal(m.meta.sources.revenue, "VCI"); assert.equal(m.meta.sources.netProfit, "VND");
  assert.equal(m.fa.income.quarters.at(-1).revenue, undefined); // quý 3/2026 VCI chưa có: không bịa
  // VNDirect thiếu quý 1/2025 LNST; VCI khớp ở các quý trùng -> vá đúng 1 quý
  const gap = { tpl: "corp", quarters: vndRec.quarters.map((q) => (q.fiscal === "2025-03-31" ? { ...q, v: { ...q.v, npatParent: undefined } } : q)) };
  const g = mergeFundamentals({ vndRec: gap, vciFa });
  assert.equal(g.fa.income.quarters.find((r) => r.year === 2025 && r.quarter === 1).netProfit, 1.1e12); assert.ok(g.meta.patched >= 1);
  // hai nguồn LỆCH -> không vá
  const vciBad = { ...vciFa, income: { quarters: vciFa.income.quarters.map((r) => ({ ...r, netProfit: r.netProfit * 1.2 })) } };
  const b = mergeFundamentals({ vndRec: gap, vciFa: vciBad });
  assert.equal(b.fa.income.quarters.find((r) => r.year === 2025 && r.quarter === 1).netProfit, undefined);
  assert.ok(b.meta.recon.diffs.length > 0);
});

test("createFundamentalsWarehouse.mergeMap: mã chỉ có VCI giữ VCI (ước tính + 45), lỗi nguồn chính không làm hỏng lượt quét", () => {
  const w = createFundamentalsWarehouse({ vndRecOf: (t) => { if (t === "ERR") throw new Error("x"); return t === "AAA" ? vndRec : null; }, cafefDatesOf: () => null, log: {} });
  const out = w.mergeMap(["AAA", "BBB", "ERR", "NONE"], new Map([["BBB", vciFa], ["ERR", vciFa]]));
  assert.deepEqual([...out.keys()], ["AAA", "BBB", "ERR"]);
  assert.equal(out.get("BBB").income.quarters.at(-1).availBasis, "EST45");
  assert.equal(out.get("AAA").income.quarters.at(-1).availBasis, "VND_CREATED");
  const st = w.status(); assert.equal(st.tickers, 3); assert.equal(st.withVnd, 1); assert.equal(st.vciOnly, 2);
});
