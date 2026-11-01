// Nhãn tiếng Việt của 4 góc phần tư RRG (dùng chung cho panel xoay vòng ngành và bảng phụ).
import type { Quadrant } from "../../../../lib/locnganh/types";
/** Một bộ màu góc phần tư cho biểu đồ và bảng. */
export const QUADRANT_COLORS: Record<Quadrant, string> = { LEADING: "#22c55e", IMPROVING: "#38bdf8", WEAKENING: "#f59e0b", LAGGING: "#f87171" };
export const QUADRANT_VI: Record<Quadrant, string> = { LEADING: "Dẫn dắt", IMPROVING: "Cải thiện", WEAKENING: "Suy yếu", LAGGING: "Tụt hậu" };
