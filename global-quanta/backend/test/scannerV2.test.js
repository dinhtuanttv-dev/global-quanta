process.env.MARKET_ALERTS_ENABLED = "false";

// Siêu Quét v2 (Q2/Q3/Q5, anh duyệt 22/10/2026) — mỗi lỗi đã rà soát có một test riêng.
import test from "node:test";
import assert from "node:assert/strict";
import { faMetrics, companyKind } from "../src/market/scanner/faMetrics.js";
import { computeFaScoreV2, computeSmartScoreV2, computeQualityTagV2, peerKeyOf, rankPct, riskRewardFromLevels } from "../src/market/scanner/formulasV2.js";
import { adjustedScanBars, attachStructureRr, runScan, sortScannerItems } from "../src/market/scanner/scanEngine.js";
import { statementKind, fetchQuarterlyIncome } from "../src/market/scanner/vciFinancials.js";
import { normalizeVndEvent, fetchVndEvents } from "../src/market/adjusted/vndirectEvents.js";
import { createCorporateActions } from "../src/market/adjusted/corporateActions.js";
import { blockBootstrapMean, pitFundamentals, quarterAvailableOn, spearman } from "../src/market/scanner/scannerValidate.js";
import { addDays } from "../src/market/util.js";

// Quý mới nhất trước: (2026,2), (2026,1), (2025,4)…
const qs = (n, f, { start = [2026, 2] } = {}) => Array.from({ length: n }, (_, k) => {
  const idx = start[0] * 4 + (start[1] - 1) - k;
  return { year: Math.floor(idx / 4), quarter: (idx % 4) + 1, ...f(k) };
});
const fa = (inc, bal = inc) => ({ income: { available: true, quarters: inc }, balance: { available: true, quarters: bal } });

test("Q2 tăng trưởng: TTM so TTM cùng kỳ, không so quý cách 3 quý (lỗi SSI −20,5% so với +10,9% thật)", () => {
  // Doanh thu theo mùa: quý 2 cao. Quý mới nhất Q2/2026 = 110, Q2/2025 = 100 -> cùng kỳ +10%; quarters[3] (Q3/2025) = 140.
  const rev = [110, 90, 120, 140, 100, 80, 110, 130];
  const m = faMetrics(fa(qs(8, (k) => ({ revenue: rev[k], netProfit: 10, totalEquity: 100, totalLiabilities: 50 }))));
  const ttmNow = 110 + 90 + 120 + 140, ttmPrev = 100 + 80 + 110 + 130;
  assert.equal(m.growthBasis, "TTM_YOY");
  assert.ok(Math.abs(m.revenueGrowth - (ttmNow / ttmPrev - 1)) < 1e-12);
  assert.ok(m.revenueGrowth > 0, "bản cũ: 110/140 − 1 = −21%");
  // Chỉ 5 quý -> quý gần nhất so CÙNG QUÝ năm trước.
  const m5 = faMetrics(fa(qs(5, (k) => ({ revenue: rev[k], netProfit: 10, totalEquity: 100 }))));
  assert.equal(m5.growthBasis, "QUARTER_YOY");
  assert.ok(Math.abs(m5.revenueGrowth - 0.1) < 1e-12);
});

test("Q2 khớp quý theo (năm, quý): thiếu một quý không làm lệch kỳ so sánh", () => {
  const all = qs(8, (k) => ({ revenue: 100 + k, netProfit: 5, totalEquity: 100 }));
  const gap = all.filter((_, k) => k !== 2); // thiếu Q4/2025
  const m = faMetrics(fa(gap));
  assert.equal(m.growthBasis, "QUARTER_YOY", "không đủ 4 quý liên tiếp -> không tính TTM");
  assert.ok(Math.abs(m.revenueGrowth - (100 / 104 - 1)) < 1e-12, "Q2/2026 so Q2/2025, không so phần tử [4] của mảng đã thiếu");
  assert.equal(m.roe, null, "LNST TTM thiếu quý -> null");
});

test("Q2 ROE / biên lợi nhuận TTM; VCSH bình quân; thiếu dữ liệu -> null, không phải 0", () => {
  const m = faMetrics(fa(qs(8, (k) => ({ revenue: 100, netProfit: k < 4 ? 10 : 8, totalEquity: k === 0 ? 200 : k === 4 ? 100 : 150, totalLiabilities: 300 }))));
  assert.ok(Math.abs(m.roe - 40 / 150) < 1e-12);
  assert.ok(Math.abs(m.netMargin - 40 / 400) < 1e-12);
  assert.ok(Math.abs(m.leverage - 1.5) < 1e-12);
  const none = faMetrics(undefined);
  assert.deepEqual([none.roe, none.netMargin, none.revenueGrowth, none.leverage, none.fScore.score], [null, null, null, null, null]);
});

test("Q2 ngân hàng: F-Score không áp dụng (không còn bị 'loại'), loại theo mẫu BCTC hoặc theo ngành khi bản lưu cũ chưa có kind", () => {
  const bank = faMetrics(fa(qs(8, () => ({ kind: "bank", revenue: 26e12, netProfit: 14e12, totalEquity: 248e12, totalLiabilities: 2400e12, grossProfit: 0, currentAssets: 0, currentLiabilities: 0 }))));
  assert.deepEqual(bank.fScore, { score: null, max: 6, evaluated: 0, applicable: false, reason: "FINANCIAL" });
  assert.ok(bank.netMargin > 0.5 && bank.roe > 0.2);
  assert.equal(companyKind(fa(qs(4, () => ({ revenue: 0 }))), "Ngân hàng"), "bank");
  // Doanh nghiệp thiếu bảng cân đối -> đánh giá < 4/6 tiêu chí -> null (không phải 0 rồi bị loại).
  const thin = faMetrics({ income: { available: true, quarters: qs(8, () => ({ revenue: 10, netProfit: 1, grossProfit: 3 })) }, balance: { available: false, quarters: [] } });
  assert.equal(thin.fScore.score, null);
  assert.equal(thin.fScore.reason, "INSUFFICIENT");
  const full = faMetrics(fa(qs(8, (k) => ({ revenue: 10 + (k < 4 ? 2 : 0), netProfit: 1, grossProfit: 3, totalAssets: 50, totalEquity: 20, totalLiabilities: 30, longTermDebt: 5, currentAssets: 10, currentLiabilities: 8 }))));
  assert.equal(full.fScore.applicable, true);
  assert.equal(full.fScore.evaluated, 6);
  assert.ok(Number.isInteger(full.fScore.score));
});

test("Q2 VCI: doanh thu ngân hàng = Tổng thu nhập hoạt động (isb38), bảo hiểm = isi64; nhận diện loại BCTC", async () => {
  assert.equal(statementKind({ isb38: 26e12, isa1: 0 }), "bank");
  assert.equal(statementKind({ isi64: 1e13 }), "insurance");
  assert.equal(statementKind({ iss42: 4e11, isa1: 3e12 }), "securities");
  assert.equal(statementKind({ isa1: 5e12 }), "corporate");
  const body = { successful: true, data: { quarters: [
    { yearReport: 2026, lengthReport: 2, isa1: 0, isb38: 26371601000000, isa22: 14542276000000 },
    { yearReport: 2026, lengthReport: 1, isa1: null, isi64: 1e13, isa22: 1e12 },
  ] } };
  const r = await fetchQuarterlyIncome("VCB", async () => new Response(JSON.stringify(body)));
  assert.deepEqual(r.quarters.map((q) => [q.kind, q.revenue]), [["bank", 26371601000000], ["insurance", 1e13]]);
});

test("Q2 điểm FA trung lập ngành: ngân hàng so ngân hàng; thành phần thiếu bị bỏ và chia lại trọng số", () => {
  const n = 20;
  const peer = Array.from({ length: n }, (_, i) => (i < 10 ? "bank" : "Công nghiệp"));
  // Biên ngân hàng ~0.5 (cao hơn mọi doanh nghiệp) -> xếp chung sẽ luôn top; trung lập ngành thì ngân hàng yếu nhất về biên = 10%.
  const margin = peer.map((p, i) => (p === "bank" ? 0.4 + i * 0.01 : 0.05 + (i - 10) * 0.01));
  const uni = { roe: margin.map(() => null), margin, growth: margin.map(() => null), peer };
  const weakestBank = computeFaScoreV2({ roe: null, netMargin: 0.4, revenueGrowth: null, peer: "bank" }, uni);
  assert.deepEqual(weakestBank, { score: 10, basis: "PEER", components: 1 });
  // Nhóm < 8 mã -> so toàn universe.
  const small = computeFaScoreV2({ roe: null, netMargin: 0.4, revenueGrowth: null, peer: "insurance" }, uni);
  assert.equal(small.basis, "UNIVERSE");
  assert.equal(small.score, 55);
  assert.deepEqual(computeFaScoreV2({ roe: null, netMargin: null, revenueGrowth: null, peer: "bank" }, uni), { score: null, basis: null, components: 0 });
  assert.equal(rankPct(null, [1, 2]), null);
  assert.equal(rankPct(2, [1, null, 2, 3]), 66.7);
  assert.equal(peerKeyOf({ kind: "corporate", industry: "Bất động sản", sectorGroup: "Bất động sản" }), "realestate");
  assert.equal(peerKeyOf({ kind: null, industry: "Thép & Kim loại", sectorGroup: "Xây dựng & Vật liệu" }), "Xây dựng & Vật liệu");
});

test("Q2/Q5 Smart Score: thành phần thiếu bỏ khỏi trung bình (không gán 50); nhãn chất lượng không suy từ dữ liệu thiếu", () => {
  assert.equal(computeSmartScoreV2(80, 60, 50, 0), 65.5); // = bản gốc khi đủ 3 thành phần: 0.4·80 + 0.35·60 + 0.25·50
  assert.equal(computeSmartScoreV2(80, 60, null, 0), Math.round(((0.4 * 80 + 0.35 * 60) / 0.75) * 10) / 10);
  assert.equal(computeSmartScoreV2(null, 60, null, 1), Math.round(60 * 1.12 * 10) / 10);
  assert.equal(computeSmartScoreV2(null, null, null, 0), null);
  assert.equal(computeQualityTagV2(null, null), null);
  assert.equal(computeQualityTagV2(null, 0.2), "High Margin");
  assert.equal(computeQualityTagV2(0.3, null), "Low Debt");
});

test("Q5 R/R từ vùng hỗ trợ / kháng cự của engine cấu trúc; bản tóm tắt cũ > 7 ngày hoặc giá ngoài vùng -> null", () => {
  assert.equal(riskRewardFromLevels(100, 90, 130), 3);
  assert.equal(riskRewardFromLevels(100, 101, 130), null);
  assert.equal(riskRewardFromLevels(100, 90, 99), null);
  const items = [{ ticker: "A", price: 100, dataAsOf: "2026-10-21" }, { ticker: "B", price: 50, dataAsOf: "2026-10-21" }, { ticker: "C", price: 10, dataAsOf: "2026-10-21" }];
  const summary = { rows: [{ t: "A", asOf: "2026-10-20", sup: 95, res: 110 }, { t: "B", asOf: "2026-09-01", sup: 40, res: 60 }] };
  const out = attachStructureRr(items, summary);
  assert.equal(out[0].riskRewardRatio, 2);
  assert.deepEqual(out[0].riskRewardBasis, { source: "STRUCTURE_D", support: 95, resistance: 110, asOf: "2026-10-20" });
  assert.equal(out[1].riskRewardRatio, undefined, "tóm tắt quá cũ -> không gắn");
  assert.equal(out[2], items[2]);
});

test("Q3 chuỗi giá điều chỉnh cộng dồn từ giá danh nghĩa + sự kiện quyền; nến cuối = giá danh nghĩa", () => {
  const rows = ["2026-09-17", "2026-09-18", "2026-09-21", "2026-09-22"].map((date, i) => ({ date, open: [100, 100, 91, 92][i] * 1000, high: [101, 101, 92, 93][i] * 1000, low: [99, 99, 90, 91][i] * 1000, close: [100, 100, 91, 92][i] * 1000, closeAdj: [100, 100, 91, 92][i] * 1000, volume: 1000, value: 1e8 }));
  const { bars, applied } = adjustedScanBars(rows, [{ exDate: "2026-09-21", type: "BONUS_ISSUE", cash: 0, ratio: 0.1, label: "Thưởng CP 10%" }]);
  assert.equal(applied, 1);
  assert.equal(bars.at(-1).close, 92_000);
  assert.ok(Math.abs(bars[1].closeAdj - 100_000 / 1.1) < 0.01, "phiên trước GDKHQ nhân 1/(1+10%)");
  assert.ok(Math.abs(bars[2].close / bars[1].close - 1) < 0.01, "không còn khoảng trống giá giả −9%");
  assert.equal(bars[0].value, 1e8, "giá trị giao dịch không đổi");
});

test("Q2/Q5 runScan: nguồn sự kiện lỗi -> điểm sự kiện null; thanh khoản theo giá trị; tài chính không bị xếp 'loại'", () => {
  const mk = (n, base, value) => Array.from({ length: n }, (_, i) => { const c = base * (1 + 0.002 * i); return { date: addDays("2026-01-01", i), open: c, high: c * 1.01, low: c * 0.99, close: c, closeAdj: c, volume: 1000, value }; });
  const universe = [], barsByTicker = new Map(), fundamentals = new Map();
  for (let i = 0; i < 12; i++) {
    const t = `T${i}`;
    universe.push({ ticker: t, sector: "X", industry: i < 2 ? "Ngân hàng" : "Khác", sectorGroup: i < 2 ? "Tài chính" : "Khác" });
    // Giá thấp nhưng giá trị giao dịch lớn cho T5: thanh khoản v2 theo giá trị.
    barsByTicker.set(t, mk(80, i === 5 ? 1000 : 50_000, i === 5 ? 9e11 : 1e9));
    fundamentals.set(t, fa(qs(8, () => ({ kind: i < 2 ? "bank" : "corporate", revenue: 100 + i, netProfit: 10, totalEquity: 100, totalLiabilities: 50, totalAssets: 150, grossProfit: 30, currentAssets: 40, currentLiabilities: 30, longTermDebt: 10 }))));
  }
  const indexBars = mk(120, 1200, 0);
  const r = runScan({ universe, barsByTicker, fundamentals, indexBars, events: [], foreignNetBuySet: new Set(), eventsAvailable: false, now: new Date("2026-04-01T09:00:00Z") });
  assert.ok(r.items.every((x) => x.eventImpactScore === null));
  assert.equal(r.context.eventsAvailable, false);
  const t0 = r.items.find((x) => x.ticker === "T0");
  assert.equal(t0.piotroskiFScore, null);
  assert.equal(t0.fScoreApplicable, false);
  assert.equal(t0.peerGroup, "bank");
  const t5 = r.items.find((x) => x.ticker === "T5");
  assert.equal(t5.liquidityValue20, 9e11);
  assert.equal(r.context.faUniverse.peer.length, r.items.length);
  const sorted = sortScannerItems([{ ticker: "BANK", smartScore: 10, piotroskiFScore: null, fScoreMax: 6 }, { ticker: "BAD", smartScore: 90, piotroskiFScore: 1, fScoreMax: 6 }]);
  assert.deepEqual(sorted.map((x) => x.ticker), ["BANK", "BAD"]);
});

test("Q3 sự kiện quyền VNDirect (dự phòng khi Project A thiếu mã)", async () => {
  assert.deepEqual(normalizeVndEvent({ type: "DIVIDEND", effectiveDate: "2026-05-28", dividend: 1000, ratio: 10 }), { exDate: "2026-05-28", type: "CASH", cash: 1000, ratio: 0, label: "Cổ tức 1.000đ" });
  assert.equal(normalizeVndEvent({ type: "KINDDIV", effectiveDate: "2026-09-21", ratio: 10 }).label, "Thưởng CP 10%");
  assert.equal(normalizeVndEvent({ type: "STOCKDIV", effectiveDate: "2025-03-12", ratio: 49.5 }).ratio, 0.495);
  assert.equal(normalizeVndEvent({ type: "RIGHT", effectiveDate: "2025-03-12", ratio: 20 }), null);
  const urls = [];
  const vnd = async (url) => {
    urls.push(url);
    return new Response(JSON.stringify({ totalElements: 3, data: [
      { code: "FPT", type: "KINDDIV", effectiveDate: "2026-09-21", ratio: 10 },
      { code: "FPT", type: "KINDDIV", effectiveDate: "2026-09-21", ratio: 10 }, // trùng -> bỏ
      { code: "HPG", type: "STOCKDIV", effectiveDate: "2026-05-25", ratio: 10 },
    ] }));
  };
  const m = await fetchVndEvents(["FPT", "HPG", "VCB"], { fetchImpl: vnd });
  assert.deepEqual([m.get("FPT").length, m.get("HPG").length, m.get("VCB").length], [1, 1, 0]);
  assert.equal(urls.length, 1, "gộp nhiều mã một lượt");

  let paCalls = 0, fbCalls = 0;
  const pa = async () => { paCalls++; return new Response(JSON.stringify({ results: [{ ticker: "VNM", available: true, lifecycleEvents: [] }] })); };
  const ca = createCorporateActions({ base: "http://pa", fetchImpl: pa, fallback: async (syms) => { fbCalls++; return fetchVndEvents(syms, { fetchImpl: vnd }); } });
  await ca.prefetch(["VNM", "FPT", "HPG"]);
  assert.equal(fbCalls, 1);
  assert.deepEqual(await ca.get("VNM"), { events: [], covered: true, generatedAt: null, source: "PROJECT_A" });
  const f = await ca.get("FPT");
  assert.equal(f.source, "VNDIRECT_FINFO");
  assert.equal(f.events[0].ratio, 0.1);
  assert.equal(fbCalls, 1, "đã nạp trước -> không gọi lại");
  // Project A lỗi hẳn -> vẫn có sự kiện từ VNDirect.
  const down = createCorporateActions({ base: "http://pa", fetchImpl: async () => new Response("x", { status: 500 }), fallback: (syms) => fetchVndEvents(syms, { fetchImpl: vnd }) });
  assert.equal((await down.get("HPG")).covered, true);
});

test("Q4 kiểm định: BCTC đúng thời điểm (quý + 45 ngày), Spearman, bootstrap khối", () => {
  assert.equal(quarterAvailableOn({ year: 2025, quarter: 4 }), "2026-02-14");
  const f = fa(qs(4, () => ({ revenue: 1 })));
  const pit = pitFundamentals(f, "2026-05-14");
  assert.deepEqual(pit.income.quarters.map((q) => `${q.quarter}/${q.year}`), ["4/2025", "3/2025"]);
  assert.equal(pitFundamentals(f, "2025-01-01").income.available, false);
  assert.equal(spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1);
  assert.equal(spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1);
  assert.equal(spearman([1, 1], [1, 2]), null);
  const b = blockBootstrapMean([0.1, 0.2, 0.1, 0.2, 0.1, 0.2], 2, { iters: 200, seed: 1 });
  assert.ok(b.lo <= b.mean && b.mean <= b.hi && b.lo > 0);
});
