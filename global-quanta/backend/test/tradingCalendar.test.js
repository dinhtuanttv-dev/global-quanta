process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tetDate, hungKingsDate } from "../src/market/tradingCalendar/vnLunar.js";
import { ruleHolidays, ruleHolidaySet } from "../src/market/tradingCalendar/vnHolidays.js";
import { classifyDay, createTradingCalendarService, observedFromSessions } from "../src/market/tradingCalendar/tradingCalendarService.js";

const OBSERVED = JSON.parse(readFileSync(new URL("./fixtures/vn-observed-holidays-2017-2026.json", import.meta.url), "utf8")).holidays;
// Ngày nghỉ KHÔNG đoán được bằng quy tắc: Chính phủ cho đổi ngày làm việc để nghỉ nối, và 23–24/01/2018 không có phiên.
const UNPREDICTABLE = ["2018-01-23", "2018-01-24", "2018-12-31", "2019-04-29", "2024-04-29", "2025-05-02", "2026-01-02", "2026-08-31"];

test("âm lịch: mùng 1 Tết và Giỗ Tổ đúng các năm đã biết (múi giờ +7)", () => {
  const tet = { 2017: "2017-01-28", 2018: "2018-02-16", 2020: "2020-01-25", 2023: "2023-01-22", 2024: "2024-02-10", 2025: "2025-01-29", 2026: "2026-02-17", 2027: "2027-02-06" };
  for (const [y, d] of Object.entries(tet)) assert.equal(tetDate(Number(y)), d, `Tết ${y}`);
  assert.equal(tetDate(2030), "2030-02-02"); // trăng mới 23:07 giờ VN ngày 02/02 (Trung Quốc +8 là 03/02)
  assert.equal(hungKingsDate(2026), "2026-04-26");
  assert.equal(hungKingsDate(2025), "2025-04-07");
});

test("quy tắc vs 10 năm phiên VN-Index thật: không đánh nhầm ngày nào, chỉ sót ngày nghỉ nối", () => {
  const observed = new Set(OBSERVED);
  const rule = [...ruleHolidaySet(2017, 2026).keys()].filter((d) => d <= "2026-10-02");
  const falsePositive = rule.filter((d) => !observed.has(d));
  const missed = OBSERVED.filter((d) => !rule.includes(d));
  assert.deepEqual(falsePositive, []);
  assert.deepEqual(missed, UNPREDICTABLE);
  assert.equal(rule.length, 106);
});

test("Tết: đúng 5 ngày thường quanh mùng 2 (Tết thứ Bảy 2024, Chủ nhật 2023, thứ Tư 2025)", () => {
  const tet = (y) => ruleHolidays(y).filter((h) => h.reason === "Tết Nguyên đán").map((h) => h.date);
  assert.deepEqual(tet(2024), ["2024-02-08", "2024-02-09", "2024-02-12", "2024-02-13", "2024-02-14"]);
  assert.deepEqual(tet(2023), ["2023-01-20", "2023-01-23", "2023-01-24", "2023-01-25", "2023-01-26"]);
  assert.deepEqual(tet(2025), ["2025-01-27", "2025-01-28", "2025-01-29", "2025-01-30", "2025-01-31"]);
});

test("nghỉ bù khi lễ rơi cuối tuần (2023: Giỗ Tổ T7 + 30/4 CN -> 01–03/05)", () => {
  const may = ruleHolidays(2023).filter((h) => h.date.startsWith("2023-05")).map((h) => h.date);
  assert.deepEqual(may, ["2023-05-01", "2023-05-02", "2023-05-03"]);
});

test("năm tương lai tự tính được (2027–2035), mỗi năm 9–12 ngày nghỉ", () => {
  for (let y = 2027; y <= 2035; y++) {
    const n = ruleHolidays(y).length;
    assert.ok(n >= 9 && n <= 12, `${y}: ${n}`);
  }
  assert.ok(ruleHolidays(2027).some((h) => h.date === "2027-02-05" && h.reason === "Tết Nguyên đán"));
});

test("3 lớp: quan sát > chính thức > quy tắc", () => {
  const rules = ruleHolidaySet(2026, 2027);
  const observed = observedFromSessions(["2026-08-28", "2026-09-03", "2026-09-04"]); // 31/08, 01/09, 02/09 không có phiên
  assert.deepEqual(classifyDay("2026-08-31", { observed, rules }), { holiday: true, source: "OBSERVED", reason: "Không có phiên (nghỉ nối / đổi ngày làm việc)" });
  assert.equal(classifyDay("2026-09-03", { observed, rules }).holiday, false);
  assert.equal(classifyDay("2027-02-05", { observed, rules }).source, "RULE");
  assert.equal(classifyDay("2027-12-31", { observed, rules, official: new Set(["2027-12-31"]) }).source, "OFFICIAL");
  assert.equal(classifyDay("2027-03-03", { observed, rules }).holiday, false);
});

test("service: nạp phiên thật, liệt kê ngày nghỉ theo khoảng, lỗi nguồn thì vẫn chạy bằng quy tắc", async () => {
  const sessions = [];
  for (let t = Date.parse("2026-01-01T00:00:00Z"); t <= Date.parse("2026-10-02T00:00:00Z"); t += 86_400_000) {
    const d = new Date(t).toISOString().slice(0, 10);
    const w = new Date(t).getUTCDay();
    if (w !== 0 && w !== 6 && !OBSERVED.includes(d)) sessions.push(d);
  }
  const svc = createTradingCalendarService({ loadSessionDates: async () => sessions });
  await svc.refresh();
  assert.equal(svc.status().observedThrough, "2026-10-02");
  assert.ok(svc.isHoliday("2026-08-31"));
  assert.deepEqual(svc.list("2027-01-01", "2027-01-31").map((h) => h.date), ["2027-01-01"]);
  const broken = createTradingCalendarService({ loadSessionDates: async () => { throw new Error("SSI lỗi"); } });
  await broken.refresh();
  assert.match(broken.status().lastError, /SSI/);
  assert.ok(broken.isHoliday("2027-02-05"));
});
