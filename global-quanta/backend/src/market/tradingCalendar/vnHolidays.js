// Lịch nghỉ giao dịch chứng khoán Việt Nam TỰ TÍNH cho mọi năm — không cần nạp danh sách thủ công.
//
// Quy tắc rút ra từ Bộ luật Lao động (2012, 2019) và KIỂM CHỨNG trên 10 năm phiên VN-Index thật (2017–2026,
// test/tradingCalendar.test.js):
//  - Tết Nguyên đán: sàn nghỉ đúng 5 ngày thường = 5 ngày thường GẦN NHẤT với mùng 2 Tết (khớp 10/10 năm).
//  - 01/01, Giỗ Tổ (10/3 âm lịch), 30/04, 01/05: rơi vào T7/CN thì nghỉ bù ngày thường kế tiếp chưa nghỉ.
//  - 02/09: từ 2021 thêm 1 ngày liền kề (Điều 112 BLLĐ 2019): T2/T5 -> 03/09; T3/T4/T6/T7 -> 01/09; CN -> 03/09.
// KHÔNG đoán được: ngày Chính phủ cho đổi ngày làm việc để nghỉ nối (VD 02/01/2026, 31/08/2026) — lớp "quan sát"
// (tradingCalendarService.js) tự bắt từ dữ liệu phiên thật; lớp "chính thức" (MARKET_HOLIDAYS) ghi đè nếu cần.

import { hungKingsDate, jdFromDate, jdToDate, tetDate, ymd } from "./vnLunar.js";

const toJd = (iso) => jdFromDate(Number(iso.slice(8, 10)), Number(iso.slice(5, 7)), Number(iso.slice(0, 4)));
const fromJd = (jd) => ymd(jdToDate(jd));
/** 0 = Chủ nhật … 6 = Thứ Bảy. */
const weekday = (jd) => (jd + 1) % 7;
const isWeekend = (jd) => weekday(jd) === 0 || weekday(jd) === 6;

/** 5 ngày thường gần mùng 2 Tết nhất (hoà thì ngày sớm hơn). */
function tetClosure(year) {
  const center = toJd(tetDate(year)) + 1;
  const days = [];
  for (let d = center - 8; d <= center + 8; d++) if (!isWeekend(d)) days.push(d);
  days.sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b);
  return days.slice(0, 5);
}

function sept2Adjacent(year) {
  const d2 = toJd(`${year}-09-02`);
  const wd = weekday(d2);
  return wd === 1 || wd === 4 || wd === 0 ? d2 + 1 : d2 - 1;
}

/**
 * Ngày nghỉ giao dịch (ngày thường, ISO) của một năm theo quy tắc, kèm lý do.
 * @returns {{ date: string, reason: string }[]}
 */
export function ruleHolidays(year) {
  const out = new Map();
  const add = (jd, reason) => { if (!isWeekend(jd) && !out.has(jd)) out.set(jd, reason); };
  for (const d of tetClosure(year)) add(d, "Tết Nguyên đán");

  // Lễ một ngày: nếu rơi vào cuối tuần -> bù ngày thường kế tiếp chưa nghỉ (xử lý theo thứ tự thời gian).
  const singles = [
    [toJd(`${year}-01-01`), "Tết Dương lịch"],
    [toJd(hungKingsDate(year)), "Giỗ Tổ Hùng Vương"],
    [toJd(`${year}-04-30`), "Ngày Thống nhất"],
    [toJd(`${year}-05-01`), "Quốc tế Lao động"],
    [toJd(`${year}-09-02`), "Quốc khánh"],
  ];
  if (year >= 2021) singles.push([sept2Adjacent(year), "Quốc khánh (ngày liền kề)"]);
  singles.sort((a, b) => a[0] - b[0]);
  const taken = new Set(singles.map(([d]) => d));
  for (const [d, reason] of singles) {
    if (!isWeekend(d)) { add(d, reason); continue; }
    let c = d + 1;
    while (isWeekend(c) || out.has(c) || (taken.has(c) && !isWeekend(c) && c !== d)) c++;
    add(c, `${reason} (nghỉ bù)`);
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([jd, reason]) => ({ date: fromJd(jd), reason }));
}

/** Tập ngày nghỉ theo quy tắc cho khoảng năm [from, to]. */
export function ruleHolidaySet(fromYear, toYear) {
  const set = new Map();
  for (let y = fromYear; y <= toYear; y++) for (const h of ruleHolidays(y)) set.set(h.date, h.reason);
  return set;
}
