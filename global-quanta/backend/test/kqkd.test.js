import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSummary, buildSummaryRow, buildTickerDetail, derive, filingDeadline, prepareQuarters, quarterMatrix, seasonality, KQ } from "../src/market/fundamentals/kqkdEngine.js";
import { groupAnnual, groupFull } from "../src/market/fundamentals/statementsVnd.js";
import { createKqkdService } from "../src/market/fundamentals/kqkdService.js";

const B = 1e9;
const fiscalOf = (y, q) => { const m = q * 3; return `${y}-${String(m).padStart(2, "0")}-${m === 3 || m === 12 ? 31 : 30}`; };
/** Doanh nghiệp giả lập: năm y0..y1, mùa vụ Q4 lớn; v(y,q) ghi đè. */
function corp(y0, y1, over = () => ({}), { lastQ = 4 } = {}) {
  const quarters = [];
  for (let y = y0; y <= y1; y++) for (let q = 1; q <= 4; q++) {
    if (y === y1 && q > lastQ) break;
    const g = 1 + 0.1 * (y - y0), season = [0.9, 1, 1, 1.3][q - 1];
    const rev = 1000 * B * g * season, gross = rev * 0.3, selling = rev * 0.05, ga = rev * 0.05, core = gross - selling - ga;
    const finInc = 20 * B, finExp = 10 * B, pbt = core + finInc - finExp, tax = pbt * 0.2, npat = pbt - tax;
    const assets = 5000 * B * g, equity = 2500 * B * g;
    const created = new Date(Date.parse(`${fiscalOf(y, q)}T00:00:00Z`) + 30 * 864e5).toISOString().slice(0, 10);
    quarters.push({ fiscal: fiscalOf(y, q), created, v: { revenue: rev, cogs: rev - gross, gross, selling, ga, finInc, finExp, associates: 0, otherProfit: 0, pbt, tax, npat, minority: 0, npatParent: npat, eps: 1000,
      cfo: npat * 1.1, dep: 30 * B, assets, liabilities: assets - equity, equity, curAssets: 2000 * B * g, curLiab: 1200 * B * g, recvCust: 400 * B * g, inventory: 300 * B * g,
      payables: 200 * B * g, ppe: 1500 * B * g, ltDebt: 500 * B, stDebt: 300 * B, retained: 800 * B * g, capital: 1000 * B, cash: 100 * B, ...over(y, q) } });
  }
  return { ticker: "AAA", tpl: "corp", quarters, annual: [] };
}

test("K0 gom dòng VNDirect: mẫu theo modelType, ngày công bố sớm nhất của báo cáo KQKD, bỏ dòng mẫu khác", () => {
  const rows = [
    { modelType: 102, itemCode: 421900, fiscalDate: "2026-09-30", numericValue: 20, createdDate: "2026-10-30 00:00:00" },
    { modelType: 102, itemCode: 23000, fiscalDate: "2026-09-30", numericValue: 9, createdDate: "2026-10-29 00:00:00" },
    { modelType: 101, itemCode: 412000, fiscalDate: "2026-09-30", numericValue: 100, createdDate: "2026-10-01 00:00:00" },
    { modelType: 2, itemCode: 21001, fiscalDate: "2026-09-30", numericValue: 5, createdDate: "2026-10-01 00:00:00" },
  ];
  const g = groupFull(rows);
  assert.equal(g.tpl, "bank");
  assert.deepEqual(g.quarters[0].v, { nii: 20, npatParent: 9, loans: 100 });
  assert.equal(g.quarters[0].created, "2026-10-29"); // ngày theo báo cáo KQKD, không theo cân đối kế toán
  const a = groupAnnual([{ modelType: 2, itemCode: 21001, fiscalDate: "2025-12-31", numericValue: 70 }, { modelType: 3, itemCode: 32000, fiscalDate: "2025-12-31", numericValue: 9 }], "corp");
  assert.deepEqual(a, [{ year: 2025, v: { revenue: 70, cfo: 9 } }]);
});

test("K1 ma trận: Q1–Q4, lũy kế 6T/9T/năm, so cùng kỳ LŨY KẾ, lệch BCTC năm, point-in-time", () => {
  const rec = corp(2023, 2026, () => ({}), { lastQ: 3 });
  rec.annual = [{ year: 2025, v: { npatParent: 0 } }];
  const by = prepareQuarters("corp", rec.quarters, "2026-11-06");
  const m = quarterMatrix(by, "npatParent", [{ year: 2025, v: { npatParent: 1 } }]);
  assert.equal(m[0].year, 2026);
  assert.equal(m[0].q[3], null);
  assert.equal(m[0].ytdTo, 3);
  const sum3 = m[0].q.slice(0, 3).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(m[0].ytd.m9 - sum3) < 1);
  assert.equal(m[0].ytd.fy, null);
  // 9T/2026 so 9T/2025 (lũy kế cùng kỳ, không phải quý lẻ)
  assert.ok(Math.abs(m[0].ytdGrowth.value - (m[0].ytd.m9 / m[1].ytd.m9 - 1)) < 1e-3);
  assert.equal(m[0].ytdPrev, m[1].ytd.m9);
  assert.equal(m[1].year, 2025);
  assert.ok(m[1].auditDiff !== null); // tổng 4 quý khác hẳn số năm giả lập (1 đồng)
  // Point-in-time: hôm nay trước ngày công bố Q3/2026 -> quý mới nhất là Q2.
  const early = quarterMatrix(prepareQuarters("corp", rec.quarters, "2026-10-15"), "npatParent");
  assert.equal(early[0].ytdTo, 2);
});

test("K2 thác nước doanh nghiệp: DT → lãi gộp → cốt lõi → LNTT → LNST mẹ, khớp đẳng thức", () => {
  const d = buildTickerDetail(corp(2018, 2026, () => ({}), { lastQ: 3 }), { today: "2026-11-06" });
  const st = Object.fromEntries(d.bridge.quarter.steps.map((s) => [s.key, s.value]));
  assert.ok(Math.abs(st.revenue + st.cogs - st.gross) < 1);
  assert.ok(Math.abs(st.gross + st.selling + st.ga - st.core) < 1);
  assert.ok(Math.abs(st.core + st.finNet + st.associates + st.otherProfit - st.pbt) < 1);
  assert.ok(!("residual" in st));
  assert.ok(Math.abs(st.pbt + st.tax + st.minority - st.npatParent) < 1);
  assert.equal(d.label, "MÔ TẢ");
});

test("K2 ngân hàng / chứng khoán: định nghĩa LN cốt lõi theo mẫu", () => {
  const bank = derive("bank", { toi: 100, nii: 70, fees: 10, fx: 15, ga: 30, provision: 20, pbt: 45 });
  assert.equal(bank.core, 70 + 10 - 30 - 20);
  assert.equal(bank.nonCore, 45 - 30);
  const sec = derive("sec", { revenue: 50, pbtRealized: 30, pbtUnrealized: -5, pbt: 25, npatParent: 20 });
  assert.equal(sec.core, 30);
  assert.equal(sec.nonCore, -5);
});

test("K3 chất lượng: dồn tích, CFO/LNST, DuPont, Piotroski đủ 9 phép thử, Altman, Beneish", () => {
  const d = buildTickerDetail(corp(2018, 2026, () => ({}), { lastQ: 3 }), { today: "2026-11-06" });
  const q = d.quality;
  assert.ok(q.accrual < 0); // CFO = 1,1 × LNST
  assert.ok(Math.abs(q.cfoToNpat - 1.1) < 1e-3);
  assert.ok(Math.abs(q.dupont.netMargin * q.dupont.turnover * q.dupont.leverage - q.dupont.roe) < 1e-3);
  assert.equal(q.piotroski.of, 9);
  assert.ok(Number.isInteger(q.piotroski.score));
  assert.ok(["SAFE", "GREY", "DISTRESS"].includes(q.altman.zone));
  assert.ok(Number.isFinite(q.beneish.m));
  assert.ok(q.wc.ccc !== null);
});

test("K4 mùa vụ: tỷ trọng quý, QoQ khử mùa vụ ≈ 0 khi đúng mùa vụ, ước tính cả năm có dải", () => {
  const rec = corp(2014, 2026, () => ({}), { lastQ: 3 });
  const by = prepareQuarters("corp", rec.quarters, "2026-11-06");
  const last = Math.max(...by.keys());
  const s = seasonality(by, "top", last);
  assert.equal(s.available, true);
  assert.ok(s.share[3] > s.share[0]);
  assert.ok(Math.abs(s.qoq.deviation) < 0.02);
  const n = seasonality(by, "npatParent", last).nowcast;
  assert.equal(n.through, 3);
  assert.ok(n.lo <= n.est && n.est <= n.hi);
  // Thiếu lịch sử -> không ước tính.
  const short = prepareQuarters("corp", corp(2023, 2026, () => ({}), { lastQ: 3 }).quarters, "2026-11-06");
  assert.equal(seasonality(short, "top", Math.max(...short.keys())).available, false);
  assert.equal(KQ.seasonMinYears, 5);
});

test("Cờ: LN ngoài cốt lõi lớn, tăng trưởng nền thấp không xếp như thường, tóm tắt toàn thị trường", () => {
  const rec = corp(2018, 2026, (y, q) => (y === 2026 && q === 3 ? { finInc: 5000 * B, pbt: 5200 * B, npat: 4200 * B, npatParent: 4200 * B } : {}), { lastQ: 3 });
  const row = buildSummaryRow(rec, { today: "2026-11-06" });
  assert.ok(row.flags.includes("NON_CORE"));
  assert.equal(row.npatYoY.value, KQ.growthMax ?? 3); // bị giới hạn +300%
  assert.ok(row.npatYoY.raw > 3);
  assert.equal(row.heat.length, KQ.heatQuarters);
  const other = { ...corp(2018, 2026, () => ({}), { lastQ: 2 }), ticker: "BBB" };
  const sum = buildSummary([row, buildSummaryRow(other, { today: "2026-11-06" })], { today: "2026-11-06" });
  assert.equal(sum.latestQuarter, "Q3/2026");
  assert.equal(sum.counts.reportedLatest, 1);
  assert.deepEqual(sum.rows.map((r) => r.current), [true, false]);
  assert.equal(sum.heatQuarters.at(-1), "Q3/2026");
});

test("Hạn công bố: quý vừa kết thúc còn hạn hợp nhất + quý kế tiếp (giống số cũ của Project A)", () => {
  const d = filingDeadline("2026-11-06");
  assert.equal(d.current.quarterLabel, "Q3/2026");
  assert.equal(d.current.deadlineConsolidated, "2026-11-14");
  assert.equal(d.next.deadlineStandalone, "2027-01-20");
  assert.equal(d.next.deadlineConsolidated, "2027-02-14");
  assert.equal(filingDeadline("2026-12-20").current, null);
});

test("Dịch vụ: nạp vào thư mục, dựng bảng, chi tiết có đệm, mã ngoài universe không gọi nguồn", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kqkd-"));
  const calls = [];
  const store = { getKv: async () => ({ value: { fund: { AAA: [], BBB: [] }, mcap: { AAA: [["2026-11-05", 5e12]] } } }) };
  const fetchTicker = async (t) => { calls.push(t); return t === "BBB" ? null : { ...corp(2018, 2026, () => ({}), { lastQ: 3 }), ticker: t }; };
  const svc = createKqkdService({ store, dir, fetchTicker, fetchDisc: async () => [["2026-10-21", "AAA: Kết quả kinh doanh 9 tháng năm 2026"]], now: () => Date.parse("2026-11-06T05:00:00Z"), log: { log() {}, warn() {} } });
  assert.equal(await svc.summary(), null);
  const r = await svc.refresh();
  assert.equal(r.failedCount, 1);
  const s = await svc.summary();
  assert.equal(s.counts.tickers, 1);
  assert.deepEqual(s.failed, ["BBB"]);
  assert.equal(s.rows[0].mcap, 5e12);
  const d1 = await svc.detail("aaa");
  assert.equal(d1.ticker, "AAA");
  assert.equal(await svc.detail("AAA"), d1);
  calls.length = 0;
  assert.equal(await svc.detail("ZZZ"), null);
  assert.deepEqual(calls, []); // không gọi nguồn ngoài cho mã tuỳ ý
  assert.equal(svc.status().files, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("Route: gzip có đệm, 400 mã sai, 404 không có, 401 admin thiếu khoá, 202 khi đúng khoá", async () => {
  const { default: express } = await import("express");
  const { createKqkdRouter } = await import("../src/routes/kqkd.js");
  const zlib = await import("node:zlib");
  const doc = { version: "KQ-v1", rows: [{ t: "AAA" }] };
  let refreshed = 0;
  const svc = { summary: async () => doc, detail: async (t) => (t === "AAA" ? { ticker: "AAA" } : null), status: () => ({ running: false }), refresh: async () => { refreshed += 1; } };
  const app = express(); app.use("/k", createKqkdRouter({ getService: () => svc, adminToken: () => "tok-123" }));
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}/k`;
  try {
    const r1 = await fetch(`${base}/summary`, { headers: { "accept-encoding": "gzip" } });
    assert.equal(r1.status, 200);
    assert.deepEqual(await r1.json(), doc); // fetch tự giải nén
    const raw = await new Promise((res) => { import("node:http").then(({ get }) => get(`${base}/summary`, { headers: { "accept-encoding": "gzip" } }, (m) => { const b = []; m.on("data", (c) => b.push(c)); m.on("end", () => res({ enc: m.headers["content-encoding"], body: Buffer.concat(b) })); })); });
    assert.equal(raw.enc, "gzip");
    assert.deepEqual(JSON.parse(zlib.gunzipSync(raw.body).toString()), doc);
    assert.equal((await fetch(`${base}/ticker/a$b`)).status, 400);
    assert.equal((await fetch(`${base}/ticker/ZZZ`)).status, 404);
    assert.equal((await fetch(`${base}/ticker/aaa`)).status, 200);
    assert.equal((await fetch(`${base}/admin/refresh`, { method: "POST" })).status, 401);
    assert.equal((await fetch(`${base}/admin/refresh`, { method: "POST", headers: { authorization: "Bearer tok-123" } })).status, 202);
    assert.equal(refreshed, 1);
  } finally { srv.close(); }
});
