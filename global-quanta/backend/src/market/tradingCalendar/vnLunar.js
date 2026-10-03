// Âm lịch Việt Nam (múi giờ +7) — thuật toán thiên văn của Hồ Ngọc Đức (dựa trên Meeus, "Astronomical Algorithms").
// Thuần, không I/O, đúng cho mọi năm 1800–2199: tính trăng mới và kinh độ Mặt Trời để xác định tháng 11 âm (chứa Đông chí)
// và tháng nhuận. Dùng để TỰ TÍNH Tết Nguyên đán và Giỗ Tổ Hùng Vương mà không cần nạp lịch thủ công.

const TZ = 7;
const PI = Math.PI;
const INT = Math.floor;

/** Số ngày Julius (JDN) của một ngày dương lịch. */
export function jdFromDate(dd, mm, yy) {
  const a = INT((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
  if (jd < 2299161) jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  return jd;
}

/** JDN -> [ngày, tháng, năm] dương lịch. */
export function jdToDate(jd) {
  let a, b, c;
  if (jd > 2299160) {
    a = jd + 32044;
    b = INT((4 * a + 3) / 146097);
    c = a - INT((b * 146097) / 4);
  } else {
    b = 0;
    c = jd + 32082;
  }
  const d = INT((4 * c + 3) / 1461);
  const e = c - INT((1461 * d) / 4);
  const m = INT((5 * e + 2) / 153);
  return [e - INT((153 * m + 2) / 5) + 1, m + 3 - 12 * INT(m / 10), b * 100 + d - 4800 + INT(m / 10)];
}

/** Thời điểm (ngày Julius, số thực) của lần trăng mới thứ k kể từ 1/1/1900. */
function newMoon(k) {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = PI / 180;
  let Jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  Jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 = C1 - 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 = C1 + 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  const deltat = T < -11 ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3 : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return Jd1 + C1 - deltat;
}

/** Kinh độ Mặt Trời (radian, 0..2π) tại thời điểm Julius jdn. */
function sunLongitude(jdn) {
  const T = (jdn - 2451545.0) / 36525;
  const T2 = T * T;
  const dr = PI / 180;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
  let L = (L0 + DL) * dr;
  L = L - PI * 2 * INT(L / (PI * 2));
  return L;
}

const getNewMoonDay = (k) => INT(newMoon(k) + 0.5 + TZ / 24);
const getSunLongitudeSector = (dayNumber) => INT((sunLongitude(dayNumber - 0.5 - TZ / 24) / PI) * 6);

/** Ngày bắt đầu tháng 11 âm lịch (tháng chứa Đông chí) của năm dương `yy`. */
function getLunarMonth11(yy) {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = INT(off / 29.530588853);
  let nm = getNewMoonDay(k);
  if (getSunLongitudeSector(nm) >= 9) nm = getNewMoonDay(k - 1);
  return nm;
}

function getLeapMonthOffset(a11) {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last;
  let i = 1;
  let arc = getSunLongitudeSector(getNewMoonDay(k + i));
  do {
    last = arc;
    i++;
    arc = getSunLongitudeSector(getNewMoonDay(k + i));
  } while (arc !== last && i < 14);
  return i - 1;
}

/** Âm lịch -> dương lịch. Trả [ngày, tháng, năm] hoặc null nếu tháng nhuận không tồn tại. */
export function lunarToSolar(lunarDay, lunarMonth, lunarYear, lunarLeap = false) {
  let a11, b11;
  if (lunarMonth < 11) {
    a11 = getLunarMonth11(lunarYear - 1);
    b11 = getLunarMonth11(lunarYear);
  } else {
    a11 = getLunarMonth11(lunarYear);
    b11 = getLunarMonth11(lunarYear + 1);
  }
  const k = INT(0.5 + (a11 - 2415021.076998695) / 29.530588853);
  let off = lunarMonth - 11;
  if (off < 0) off += 12;
  if (b11 - a11 > 365) {
    const leapOff = getLeapMonthOffset(a11);
    let leapMonth = leapOff - 2;
    if (leapMonth < 0) leapMonth += 12;
    if (lunarLeap && lunarMonth !== leapMonth) return null;
    if (lunarLeap || off >= leapOff) off += 1;
  }
  const monthStart = getNewMoonDay(k + off);
  return jdToDate(monthStart + lunarDay - 1);
}

const pad = (n) => String(n).padStart(2, "0");
export const ymd = ([d, m, y]) => `${y}-${pad(m)}-${pad(d)}`;

/** Mùng 1 Tết âm lịch của năm dương `year` (ISO). */
export const tetDate = (year) => ymd(lunarToSolar(1, 1, year));
/** Giỗ Tổ Hùng Vương 10/3 âm lịch của năm `year` (ISO). */
export const hungKingsDate = (year) => ymd(lunarToSolar(10, 3, year));
