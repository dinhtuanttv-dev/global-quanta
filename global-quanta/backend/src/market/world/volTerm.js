// Cấu trúc kỳ hạn biến động (VT1, 05/11/2026): VolSlope = VIX / VIX3M − 1, thay cho điểm Risk-On đặt tay (DXY/VIX/US10Y) đã
// KHÔNG ĐẠT kiểm định đặt trước. Contango (VIX ngắn hạn thấp hơn 3 tháng) = thị trường quyền chọn bình yên; backwardation = căng
// thẳng ngắn hạn. Chỉ MÔ TẢ: quan hệ với VN-Index mới là khám phá trong mẫu, chưa kiểm định đặt trước, không vào quyết định.
export const VOL_TERM = Object.freeze({ version: "vol-term/VT1", contango: -0.05, backwardation: 0.05 });

/** Số liệu khám phá (chạy 05/11/2026): VolSlope phiên Mỹ ngày d -> lợi suất VN-Index phiên VN kế tiếp, 11/2021–11/2026. */
export const VOL_TERM_EVIDENCE = Object.freeze({
  version: VOL_TERM.version, verdict: "EXPLORATORY", label: "MÔ TẢ",
  note: "Khám phá trong mẫu 11/2021–11/2026 (1.255 phiên): sau phiên Mỹ contango, VN-Index phiên sau TB +0,09% (t 2,7); sau phiên phẳng −0,25% (t −2,5); backwardation chỉ 16 phiên. Chưa kiểm định đặt trước, chỉ để mô tả, không đưa vào quyết định.",
  history: "10 năm 2016–2026: contango 79,8% số phiên, phẳng 17,2%, backwardation 3,0%.",
});

const STATE_VI = { CONTANGO: "Contango · bình yên", FLAT: "Phẳng · thận trọng", BACKWARDATION: "Backwardation · căng thẳng" };
const REGIME = { CONTANGO: "RISK_ON", FLAT: "NEUTRAL", BACKWARDATION: "RISK_OFF" };

/** Trạng thái cấu trúc kỳ hạn từ VIX và VIX3M; thiếu hoặc không hợp lệ -> null (không đoán). */
export function volTermStructure(vix, vix3m) {
  if (!(Number.isFinite(vix) && vix > 0 && Number.isFinite(vix3m) && vix3m > 0)) return null;
  // So trên giá trị đã làm tròn 4 chữ số (đúng con số hiển thị), tránh lệch biên do số thực: 19/20 − 1 = −0,05000…04.
  const slope = Math.round((vix / vix3m - 1) * 10000) / 10000;
  const state = slope < VOL_TERM.contango ? "CONTANGO" : slope > VOL_TERM.backwardation ? "BACKWARDATION" : "FLAT";
  return { vix, vix3m, slope, state, stateVi: STATE_VI[state], regime: REGIME[state] };
}
