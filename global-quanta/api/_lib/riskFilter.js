// Risk Filter Service — Mục 8 (đã loại bỏ Kelly Criterion theo yêu cầu cập nhật).
// Dùng Confidence-Tiered Position Sizing: đơn giản, minh bạch, không khuếch
// đại sai số của một công thức nhạy cảm với xác suất chưa hiệu chuẩn.
//
// ĐÃ SỬA: regime giờ tính THẬT từ ADX/ATR (regimeDetector.js) thay vì
// Math.random() — trước đây field này hiển thị số giả dưới danh nghĩa dữ
// liệu thật, dù chưa ảnh hưởng trực tiếp đến sizing, vẫn gây hiểu lầm nguy
// hiểm nếu người dùng tin vào đó để đánh giá bối cảnh thị trường.

import { detectRegime } from "./regimeDetector.js";

const TIER_MAX_PCT = {
  Cao: Number(process.env.CONFIDENCE_TIER_HIGH_MAX_PCT || 3),
  "Trung bình": Number(process.env.CONFIDENCE_TIER_MED_MAX_PCT || 1.5),
  Thấp: 0, // không vào lệnh khi confidence thấp
};

/**
 * @param {object} params
 * @param {string} params.confidenceTier
 * @param {string} params.dataCompleteness
 * @param {Array} params.historicalBars - nến lịch sử THẬT (không phải mock) để tính regime; truyền [] nếu chưa có sẽ trả "Undetermined"
 */
export function applyRiskFilters({ confidenceTier, dataCompleteness, historicalBars = [] }) {
  let suggestedPositionSizePct = TIER_MAX_PCT[confidenceTier] ?? 0;

  // Feature Store SPOF guard (Mục 14.5): nếu thiếu dữ liệu định lượng,
  // không cho phép full-confidence sizing.
  if (dataCompleteness === "DEGRADED_MODE") {
    suggestedPositionSizePct = Math.min(suggestedPositionSizePct, TIER_MAX_PCT["Trung bình"]);
  }

  const regime = detectRegime(historicalBars);

  // Biến động đột biến (Volatility Spike) -> giảm sizing thêm 1 bậc dù
  // confidence tier cao, vì rủi ro trượt giá/khớp lệnh tăng mạnh trong giai
  // đoạn này. Đây là điểm KHÔNG có ở bản cũ (regime giả không ảnh hưởng gì).
  if (regime === "Volatility Spike") {
    suggestedPositionSizePct = Math.min(suggestedPositionSizePct, TIER_MAX_PCT["Trung bình"]);
  }

  return {
    suggested_position_size_pct: suggestedPositionSizePct,
    regime,
  };
}
