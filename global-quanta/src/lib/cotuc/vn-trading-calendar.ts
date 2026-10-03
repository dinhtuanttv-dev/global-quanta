/**
 * vn-trading-calendar.ts — Lịch nghỉ giao dịch chứng khoán Việt Nam TỰ TÍNH cho mọi năm (không cần nạp danh sách tay).
 *
 * BẢN SAO GIỐNG HỆT ở 2 repo (global-quanta src/lib/cotuc/vn-trading-calendar.ts và quant-macro-scanner
 * lib/cotuc/timing-v3/vn-trading-calendar.ts) — bản gốc JS: Market Gateway backend/src/market/tradingCalendar/.
 * Ba nơi dùng chung bộ kiểm chứng 10 năm phiên VN-Index thật (fixture vn-observed-holidays-2017-2026.json).
 *
 * 1. Âm lịch Việt Nam (múi giờ +7, thuật toán thiên văn Hồ Ngọc Đức) -> Tết Nguyên đán, Giỗ Tổ 10/3 âm lịch.
 * 2. Quy tắc (Bộ luật Lao động 2012/2019, kiểm chứng 2017–2026: khớp 106/106 ngày, không đánh nhầm ngày nào):
 *    - Tết: sàn nghỉ đúng 5 ngày thường GẦN NHẤT với mùng 2 Tết.
 *    - 01/01, Giỗ Tổ, 30/04, 01/05, 02/09: rơi T7/CN -> nghỉ bù ngày thường kế tiếp chưa nghỉ.
 *    - 02/09 từ 2021 thêm 1 ngày liền kề: T2/T5/CN -> 03/09; còn lại -> 01/09.
 * 3. Không đoán được: ngày Chính phủ cho đổi ngày làm việc để nghỉ nối -> lấy từ Market Gateway /api/market/trading-calendar
 *    (gateway QUAN SÁT phiên thật + MARKET_HOLIDAYS chính thức), ưu tiên trong khoảng gateway đã trả.
 */

export interface TradingCalendarLike {
  isTradingDay(dayNumber: number): boolean;
}

// ---------------------------------------------------------------------------
// Âm lịch
// ---------------------------------------------------------------------------
const TZ = 7;
const INT = Math.floor;

export function jdFromDate(dd: number, mm: number, yy: number): number {
  const a = INT((14 - mm) / 12);
  const y = yy + 4800 - a;
  const m = mm + 12 * a - 3;
  let jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - INT(y / 100) + INT(y / 400) - 32045;
  if (jd < 2299161) jd = dd + INT((153 * m + 2) / 5) + 365 * y + INT(y / 4) - 32083;
  return jd;
}

export function jdToDate(jd: number): [number, number, number] {
  let b: number, c: number;
  if (jd > 2299160) {
    const a = jd + 32044;
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

function newMoon(k: number): number {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = Math.PI / 180;
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

function sunLongitude(jdn: number): number {
  const T = (jdn - 2451545.0) / 36525;
  const T2 = T * T;
  const dr = Math.PI / 180;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL = DL + (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
  let L = (L0 + DL) * dr;
  L = L - Math.PI * 2 * INT(L / (Math.PI * 2));
  return L;
}

const getNewMoonDay = (k: number) => INT(newMoon(k) + 0.5 + TZ / 24);
const getSunLongitudeSector = (dayNumber: number) => INT((sunLongitude(dayNumber - 0.5 - TZ / 24) / Math.PI) * 6);

function getLunarMonth11(yy: number): number {
  const off = jdFromDate(31, 12, yy) - 2415021;
  const k = INT(off / 29.530588853);
  let nm = getNewMoonDay(k);
  if (getSunLongitudeSector(nm) >= 9) nm = getNewMoonDay(k - 1);
  return nm;
}

function getLeapMonthOffset(a11: number): number {
  const k = INT((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last: number;
  let i = 1;
  let arc = getSunLongitudeSector(getNewMoonDay(k + i));
  do {
    last = arc;
    i++;
    arc = getSunLongitudeSector(getNewMoonDay(k + i));
  } while (arc !== last && i < 14);
  return i - 1;
}

export function lunarToSolar(lunarDay: number, lunarMonth: number, lunarYear: number, lunarLeap = false): [number, number, number] | null {
  let a11: number, b11: number;
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
  return jdToDate(getNewMoonDay(k + off) + lunarDay - 1);
}

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = ([d, m, y]: [number, number, number]) => `${y}-${pad(m)}-${pad(d)}`;
export const tetDate = (year: number) => ymd(lunarToSolar(1, 1, year)!);
export const hungKingsDate = (year: number) => ymd(lunarToSolar(10, 3, year)!);

// ---------------------------------------------------------------------------
// Quy tắc ngày nghỉ
// ---------------------------------------------------------------------------
const toJd = (iso: string) => jdFromDate(Number(iso.slice(8, 10)), Number(iso.slice(5, 7)), Number(iso.slice(0, 4)));
const fromJd = (jd: number) => ymd(jdToDate(jd));
const weekdayJd = (jd: number) => (jd + 1) % 7; // 0 = CN
const isWeekendJd = (jd: number) => weekdayJd(jd) === 0 || weekdayJd(jd) === 6;

function tetClosure(year: number): number[] {
  const center = toJd(tetDate(year)) + 1;
  const days: number[] = [];
  for (let d = center - 8; d <= center + 8; d++) if (!isWeekendJd(d)) days.push(d);
  days.sort((a, b) => Math.abs(a - center) - Math.abs(b - center) || a - b);
  return days.slice(0, 5);
}

function sept2Adjacent(year: number): number {
  const d2 = toJd(`${year}-09-02`);
  const wd = weekdayJd(d2);
  return wd === 1 || wd === 4 || wd === 0 ? d2 + 1 : d2 - 1;
}

export interface RuleHoliday { date: string; reason: string }

/** Ngày nghỉ giao dịch (ngày thường) của một năm theo quy tắc. */
export function ruleHolidays(year: number): RuleHoliday[] {
  const out = new Map<number, string>();
  const add = (jd: number, reason: string) => { if (!isWeekendJd(jd) && !out.has(jd)) out.set(jd, reason); };
  for (const d of tetClosure(year)) add(d, 'Tết Nguyên đán');
  const singles: [number, string][] = [
    [toJd(`${year}-01-01`), 'Tết Dương lịch'],
    [toJd(hungKingsDate(year)), 'Giỗ Tổ Hùng Vương'],
    [toJd(`${year}-04-30`), 'Ngày Thống nhất'],
    [toJd(`${year}-05-01`), 'Quốc tế Lao động'],
    [toJd(`${year}-09-02`), 'Quốc khánh'],
  ];
  if (year >= 2021) singles.push([sept2Adjacent(year), 'Quốc khánh (ngày liền kề)']);
  singles.sort((a, b) => a[0] - b[0]);
  const taken = new Set(singles.map(([d]) => d));
  for (const [d, reason] of singles) {
    if (!isWeekendJd(d)) { add(d, reason); continue; }
    let c = d + 1;
    while (isWeekendJd(c) || out.has(c) || (taken.has(c) && c !== d)) c++;
    add(c, `${reason} (nghỉ bù)`);
  }
  return [...out.entries()].sort((a, b) => a[0] - b[0]).map(([jd, reason]) => ({ date: fromJd(jd), reason }));
}

export function ruleHolidaySet(fromYear: number, toYear: number): Map<string, string> {
  const m = new Map<string, string>();
  for (let y = fromYear; y <= toYear; y++) for (const h of ruleHolidays(y)) m.set(h.date, h.reason);
  return m;
}

// ---------------------------------------------------------------------------
// Lịch dùng được ngay (đồng bộ) + lớp từ Market Gateway
// ---------------------------------------------------------------------------
/** Ngày (số ngày kể từ 1970-01-01 UTC) -> ISO. */
const dayNumberToIso = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);

/** Danh sách ngày nghỉ do Gateway trả cho khoảng [from, to] (đã gộp quan sát + chính thức + quy tắc). */
export interface GatewayHolidays { from: string; to: string; holidays: Set<string> }

/**
 * Lịch giao dịch: trong khoảng Gateway đã trả -> dùng ĐÚNG danh sách của Gateway; ngoài khoảng -> quy tắc tự tính.
 * Đồng bộ, không I/O. `gateway` có thể null (chỉ quy tắc).
 */
export function makeVnTradingCalendar(gateway: GatewayHolidays | null = null): TradingCalendarLike & { isHolidayIso(iso: string): boolean } {
  const cache = new Map<number, Map<string, string>>();
  const rulesOf = (year: number) => {
    let m = cache.get(year);
    if (!m) { m = ruleHolidaySet(year, year); cache.set(year, m); }
    return m;
  };
  const isHolidayIso = (iso: string) => {
    if (gateway && iso >= gateway.from && iso <= gateway.to) return gateway.holidays.has(iso);
    return rulesOf(Number(iso.slice(0, 4))).has(iso);
  };
  return {
    isHolidayIso,
    isTradingDay(dayNumber: number) {
      const w = new Date(dayNumber * 86_400_000).getUTCDay();
      if (w === 0 || w === 6) return false;
      return !isHolidayIso(dayNumberToIso(dayNumber));
    },
  };
}

/** Tải danh sách ngày nghỉ từ Market Gateway. Lỗi -> null (dùng quy tắc). */
export async function fetchGatewayHolidays(
  gatewayBase: string, from: string, to: string, { fetchImpl = fetch, timeoutMs = 10_000 }: { fetchImpl?: typeof fetch; timeoutMs?: number } = {},
): Promise<GatewayHolidays | null> {
  try {
    const res = await fetchImpl(`${gatewayBase.replace(/\/+$/, '')}/api/market/trading-calendar?from=${from}&to=${to}`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const body = await res.json() as { from?: string; to?: string; holidays?: { date: string }[] };
    if (!body.from || !body.to || !Array.isArray(body.holidays)) return null;
    return { from: body.from, to: body.to, holidays: new Set(body.holidays.map((h) => h.date)) };
  } catch {
    return null;
  }
}
