// Risk Filter Service — Mục 8 (đã loại bỏ Kelly Criterion theo yêu cầu cập nhật).
// Dùng Confidence-Tiered Position Sizing: đơn giản, minh bạch, không khuếch
// đại sai số của một công thức nhạy cảm với xác suất chưa hiệu chuẩn.

const TIER_MAX_PCT = {
  Cao: Number(process.env.CONFIDENCE_TIER_HIGH_MAX_PCT || 3),
  "Trung bình": Number(process.env.CONFIDENCE_TIER_MED_MAX_PCT || 1.5),
  Thấp: 0, // không vào lệnh khi confidence thấp
};

export function applyRiskFilters({ confidenceTier, dataCompleteness }) {
  let suggestedPositionSizePct = TIER_MAX_PCT[confidenceTier] ?? 0;

  // Feature Store SPOF guard (Mục 14.5): nếu thiếu dữ liệu định lượng,
  // không cho phép full-confidence sizing.
  if (dataCompleteness === "DEGRADED_MODE") {
    suggestedPositionSizePct = Math.min(suggestedPositionSizePct, TIER_MAX_PCT["Trung bình"]);
  }

  return {
    suggested_position_size_pct: suggestedPositionSizePct,
    regime: detectRegime(),
  };
}

function detectRegime() {
  // TODO (production): thay bằng ADX/ATR percentile thật từ dữ liệu nến.
  const options = ["Trending", "Sideway", "Volatility Spike"];
  return options[Math.floor(Math.random() * options.length)];
}
