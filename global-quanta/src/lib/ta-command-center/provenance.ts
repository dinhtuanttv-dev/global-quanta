// Hợp đồng nguồn gốc dữ liệu (TA_VNINDEX_UPGRADE_SPEC §0 · C3): mọi con số hiển thị mang đúng MỘT nhãn.
//   HARD     — dữ liệu sàn (giá, khối lượng, khối ngoại) chưa biến đổi.
//   DERIVED  — công thức tất định từ HARD (RSI, MACD, ADX, OB/FVG/BOS…).
//   INFERRED — suy luận theo luật/heuristic (Wyckoff, điểm hợp lưu, phân loại lệnh chủ động).
//   MODEL    — xác suất từ mô hình ĐÃ hiệu chỉnh và kiểm định (chưa có trong tab này).
// Không gắn HARD cho điểm heuristic.
export type Provenance = "HARD" | "DERIVED" | "INFERRED" | "MODEL";

export const PROVENANCE_META: Record<Provenance, { color: string; title: string }> = {
  HARD: { color: "#34d399", title: "Dữ liệu sàn, chưa biến đổi" },
  DERIVED: { color: "#22d3ee", title: "Tính bằng công thức tất định từ dữ liệu sàn" },
  INFERRED: { color: "#fbbf24", title: "Suy luận theo luật/heuristic — chưa kiểm định thống kê" },
  MODEL: { color: "#a78bfa", title: "Xác suất từ mô hình đã hiệu chỉnh và kiểm định" },
};
