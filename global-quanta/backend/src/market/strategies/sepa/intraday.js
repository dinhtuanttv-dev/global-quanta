// SEPA SP6 — cảnh báo PHÁ VỠ TRONG PHIÊN [s.265, s.270]: giá vượt pivot với khối lượng tăng đáng kể (≥ 1,4× TB50), mua trong vùng
// pivot → +5%, không đuổi giá. Khối lượng cả phiên được NGOẠI SUY từ khối lượng tới thời điểm hiện tại (s.270 — sách dùng 390 phút
// của Mỹ; HOSE: 9:00–11:30 + 13:00–14:45 ≈ 255 phút, kể cả ATO/ATC).
// Chỉ tính trên dữ liệu đã có; mỗi lần gọi trả trạng thái tại thời điểm đó (không nhìn trước).

import { SEPA } from "./config.js";
import { projectIntradayVolume } from "./indicators.js";

export const HOSE_SESSION_MINUTES = 255;
/** Dưới số phút này, ngoại suy khối lượng kém tin cậy (ATO chiếm tỷ trọng lớn). */
export const INTRADAY_MIN_RELIABLE = 15;

/** Số phút giao dịch HOSE đã trôi qua tại giờ VN `minutes` (phút từ 0:00): 0 … 255. */
export function hoseMinutesElapsed(minutes) {
  const am = Math.max(0, Math.min(minutes, 11 * 60 + 30) - 9 * 60); // 0–150
  const pm = Math.max(0, Math.min(minutes, 14 * 60 + 45) - 13 * 60); // 0–105
  return Math.min(150, am) + Math.min(105, pm);
}

export const INTRADAY_STATE_VI = Object.freeze({
  BREAKOUT: "Phá vỡ đạt KL dự phóng",
  BREAKOUT_LOW_VOL: "Vượt pivot, KL dự phóng yếu",
  EXTENDED: "Đã quá vùng mua (> pivot + 5%)",
  NEAR: "Gần pivot (≤ 3%)",
  BELOW: "Dưới pivot",
});

/**
 * Trạng thái phá vỡ trong phiên của một mã.
 * @param {{ pivot: number, vol50: number, price: number, totalVolume: number, minutesElapsed: number }} p
 */
export function intradayBreakout({ pivot, vol50, price, totalVolume, minutesElapsed }, cfg = SEPA.vcp) {
  if (!(pivot > 0) || !(price > 0)) return null;
  const minutes = Math.max(0, Math.min(HOSE_SESSION_MINUTES, minutesElapsed));
  const projected = minutes > 0 && Number.isFinite(totalVolume) ? projectIntradayVolume(totalVolume, minutes, HOSE_SESSION_MINUTES) : null;
  const projRatio = projected != null && vol50 > 0 ? projected / vol50 : null;
  const distPct = (price / pivot - 1) * 100;
  let state;
  if (price > pivot * (1 + cfg.maxChasePct)) state = "EXTENDED";
  else if (price > pivot) state = projRatio != null && projRatio >= cfg.breakoutVolRatio ? "BREAKOUT" : "BREAKOUT_LOW_VOL";
  else if (price >= pivot * 0.97) state = "NEAR";
  else state = "BELOW";
  return {
    state, label: INTRADAY_STATE_VI[state], distPct, projectedVolume: projected, projRatio,
    volRatioReq: cfg.breakoutVolRatio, buyZoneTop: pivot * (1 + cfg.maxChasePct),
    reliable: minutes >= INTRADAY_MIN_RELIABLE, minutesElapsed: minutes,
  };
}
