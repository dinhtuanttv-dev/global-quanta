/**
 * computeSessions — tinh trang thai mo/dong cua cac san giao dich
 * dua tren gio UTC hien tai, khong can goi API.
 * HOSE (VN): 09:00-15:00 ICT (UTC+7) T2-T6
 * HKEX (HK): 09:30-16:00 HKT (UTC+8) T2-T6
 * NYSE (US): 09:30-16:00 EST/EDT (UTC-5/-4) T2-T6
 */
export function computeSessions(): Record<string, "open" | "closed"> {
  const now = new Date();
  const utcDay = now.getUTCDay(); // 0=CN, 6=T7
  const utcHour = now.getUTCHours();
  const utcMin = now.getUTCMinutes();
  const utcMinutes = utcHour * 60 + utcMin;
  const isWeekday = utcDay >= 1 && utcDay <= 5;

  const inRange = (startUtcMin: number, endUtcMin: number) =>
    isWeekday && utcMinutes >= startUtcMin && utcMinutes < endUtcMin;

  // VN: 09:00-15:00 ICT = 02:00-08:00 UTC
  const vnOpen = inRange(2 * 60, 8 * 60);
  // HK: 09:30-16:00 HKT = 01:30-08:00 UTC
  const hkOpen = inRange(1 * 60 + 30, 8 * 60);
  // US: 09:30-16:00 EDT (UTC-4, gia dinh DST) = 13:30-20:00 UTC
  const usOpen = inRange(13 * 60 + 30, 20 * 60);

  return {
    VN: vnOpen ? "open" : "closed",
    HK: hkOpen ? "open" : "closed",
    US: usOpen ? "open" : "closed",
  };
}
