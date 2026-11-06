import test from "node:test";
import assert from "node:assert/strict";
import { buildCalendar, disclosureFor, hazard, lagModel, nextTradingDay, periodOfTitle, publishDates, seasonQuarters } from "../src/market/fundamentals/earningsCalendar.js";

const wk = (d) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
const add = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const qEnd = (y, q) => { const m = q * 3; return `${y}-${String(m).padStart(2, "0")}-${m === 3 || m === 12 ? 31 : 30}`; };
/** Mã giả: mỗi quý công bố sau `lag` ngày (ngày dữ liệu), từ 2020; quý mới nhất `upto`. */
function rec(ticker, lag, { upto = "2026-06-30", tpl = "corp" } = {}) {
  const quarters = [];
  for (let y = 2020; y <= 2026; y++) for (let q = 1; q <= 4; q++) { const f = qEnd(y, q); if (f > upto) break; quarters.push({ fiscal: f, created: add(f, typeof lag === "function" ? lag(y, q) : lag), v: { npatParent: 1 } }); }
  return { ticker, tpl, quarters };
}

test("LC kỳ trong tiêu đề: quý số / La Mã, bán niên, 9 tháng, năm", () => {
  assert.equal(periodOfTitle("Báo cáo tài chính quý 3/2026"), "2026-09-30");
  assert.equal(periodOfTitle("BCTC quý III năm 2024"), "2024-09-30");
  assert.equal(periodOfTitle("BCTC soát xét bán niên 2026"), "2026-06-30");
  assert.equal(periodOfTitle("Kết quả kinh doanh 9 tháng năm 2026"), "2026-09-30");
  assert.equal(periodOfTitle("Giải trình biến động lợi nhuận BCTC năm 2025"), "2025-12-31");
  assert.equal(periodOfTitle("Thông cáo báo chí"), null);
});

test("LC ngày công bố thật = sớm nhất của tin BCTC chính thức và ngày dữ liệu; tin đính chính quý khác không gán nhầm", () => {
  const r = { quarters: [{ fiscal: "2026-09-30", created: "2026-10-29" }, { fiscal: "2015-09-30", created: "2019-07-01" }] };
  const p = publishDates(r, [["2026-10-21", "Kết quả kinh doanh 9 tháng năm 2026"], ["2026-10-05", "Đính chính BCTC quý 2/2026"]]);
  assert.deepEqual(p.get("2026-09-30"), { date: "2026-10-21", source: "DISCLOSURE" });
  assert.equal(p.has("2015-09-30"), false); // ngày nhập liệu hàng loạt: không phải ngày công bố
  assert.equal(disclosureFor("2026-09-30", [["2026-10-05", "Đính chính BCTC quý 2/2026"]]), null);
});

test("LC mô hình độ trễ: co về nhóm khi ít lịch sử; hazard có điều kiện chưa công bố", () => {
  const peer = Array.from({ length: 50 }, (_, i) => 20 + (i % 20)); // 20..39
  const m0 = lagModel([], peer);
  const sorted = [...peer].sort((a, b) => a - b), pm = (sorted[24] + sorted[25]) / 2;
  assert.equal(m0.median, pm); // không có lịch sử: theo nhóm
  const m1 = lagModel([10], peer); // 1 điểm: co mạnh về nhóm
  assert.ok(Math.abs(m1.median - (10 + 2 * pm) / 3) < 1e-9); // (n·mã + κ·nhóm)/(n + κ), κ = 2
  const m6 = lagModel([10, 11, 10, 12, 10, 11], peer); // đủ lịch sử: theo mã
  assert.ok(m6.median < 16);
  assert.equal(m6.lo <= m6.median && m6.median <= m6.hi, true);
  const own = [25, 26, 25, 24, 26, 25];
  assert.ok(hazard(own, peer, 24, 3) > 0.6); // sắp tới trung vị của mã
  assert.ok(hazard(own, peer, 5, 3) < 0.15);
  assert.equal(nextTradingDay("2026-11-07", wk), "2026-11-09"); // thứ Bảy -> thứ Hai
});

test("LC lịch mùa: đã công bố / đã có tin chính thức / sắp tới / quá hạn; tiến độ so mùa trước; quý đang mùa", () => {
  assert.deepEqual(seasonQuarters("2026-11-06"), { current: "2026-09-30", next: "2026-12-31" });
  const recs = [rec("EARLY", 20, { upto: "2026-09-30" }), rec("NORM", 30), rec("LATE", 60), rec("DISC", 25)];
  const disc = { DISC: [["2026-10-20", "Báo cáo tài chính quý 3/2026"]] };
  const c = buildCalendar(recs, { fiscal: "2026-09-30", today: "2026-10-28", disclosuresOf: (t) => disc[t] ?? [], isHoliday: wk, resultOf: () => ({ fiscal: "2026-09-30", npatYoY: { value: 0.1, status: "NORMAL" } }) });
  const st = Object.fromEntries(c.rows.map((r) => [r.t, r.status]));
  assert.deepEqual(st, { EARLY: "REPORTED", NORM: "UPCOMING", LATE: "UPCOMING", DISC: "DISCLOSED" });
  const norm = c.rows.find((r) => r.t === "NORM");
  assert.equal(norm.expected, nextTradingDay(add("2026-09-30", norm.medianLag), wk)); // trung vị đã co về nhóm
  assert.ok(norm.medianLag >= 27 && norm.medianLag <= 30);
  assert.ok(norm.pNext > 0.5); // ngày 28 của mùa, trung vị 30
  assert.ok(c.rows.find((r) => r.t === "LATE").lateShare > 0.9);
  assert.equal(c.rows.find((r) => r.t === "EARLY").result.npatYoY.value, 0.1);
  assert.equal(c.stats.reported, 1);
  assert.equal(c.prevCurves[0].label, "Q3/2025");
  assert.equal(c.prevCurves[0].curve[30], 0.75); // năm trước: 3/4 mã công bố trong 30 ngày
  const late = buildCalendar(recs, { fiscal: "2026-09-30", today: "2026-11-20", isHoliday: wk });
  assert.equal(late.rows.find((r) => r.t === "NORM").status, "OVERDUE"); // quá hạn hợp nhất +45 ngày
});
