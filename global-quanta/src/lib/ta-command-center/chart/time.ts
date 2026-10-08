import type { UTCTimestamp } from "lightweight-charts-v5";

// Thời gian cho trục biểu đồ (dùng chung TVChartManager + OverlayPrimitive — PHẢI trùng nhau để lớp phủ ghim đúng nến).
//   "YYYY-MM-DD"                 -> 00:00 UTC của ngày đó (khung D/W/M)
//   ISO có múi (…+07:00 / …Z)    -> thời điểm thật + 7 giờ: thư viện vẽ trục theo UTC, cộng 7h để trục hiển thị giờ VN
//   ISO không múi (giờ VN tường) -> đọc như UTC (đã là giờ VN)
const VN_OFFSET_SEC = 7 * 3600;
const HAS_TZ = /(Z|[+-]\d{2}:\d{2})$/i;

export function chartTime(date: string): UTCTimestamp {
  if (date.length <= 10) return (Date.parse(`${date}T00:00:00Z`) / 1000) as UTCTimestamp;
  if (HAS_TZ.test(date)) return (Date.parse(date) / 1000 + VN_OFFSET_SEC) as UTCTimestamp;
  return (Date.parse(`${date}Z`) / 1000) as UTCTimestamp;
}
