// Bayesian Confidence Layer — Mục 5, khắc phục Precision Illusion (14.1) và
// Cold-Start Problem (14.2).
//
// Giai đoạn đầu (chưa đủ ≥100 sample nội bộ): dùng prior_source = "market_baseline"
// Sau khi tích lũy đủ dữ liệu backtest: chuyển "internal_backtest" (cần nối
// vào bảng lịch sử tín hiệu thật — xem ghi chú TODO bên dưới).

const MIN_SAMPLES_FOR_INTERNAL_PRIOR = 100;
const internalSampleCount = 0; // TODO: đọc từ DB lịch sử tín hiệu (Signal Decay Log, Mục 7)

const MARKET_BASELINE_PRIOR = 0.55; // xác suất breakout thành công trung bình (baseline tham khảo)

export function computeBayesianConfidence({ macroAligned, ensembleAgreement }) {
  const priorSource =
    internalSampleCount >= MIN_SAMPLES_FOR_INTERNAL_PRIOR ? "internal_backtest" : "market_baseline";

  let confidence = priorSource === "market_baseline" ? MARKET_BASELINE_PRIOR : 0.6;

  // Top-down Veto Logic (Mục 3.1): nếu macro không đồng thuận, hạ trần confidence
  if (!macroAligned) confidence = Math.min(confidence, 0.4);

  // Ensemble Voting (Mục 5): độ đồng thuận giữa các model kéo confidence lên/xuống
  confidence = confidence * (0.5 + ensembleAgreement * 0.5);
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    confidence_score_bayesian: round2(confidence),
    confidence_tier: toTier(confidence),
    prior_source: priorSource,
  };
}

function toTier(score) {
  // Chưa calibrate đủ dữ liệu -> ưu tiên thang định tính thay vì số thập phân
  // "giả khoa học" (Mục 14.1).
  if (score >= 0.7) return "Cao";
  if (score >= 0.45) return "Trung bình";
  return "Thấp";
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
