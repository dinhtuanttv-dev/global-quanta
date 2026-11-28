// C11 (28/11/2026, docs/ta-tradingview C11) — GOM CẢNH BÁO VỀ MỘT NƠI: hàm thuần cho trung tâm cảnh báo của tab Kỹ thuật.
// Một danh sách theo tài khoản trên Gateway (cùng kho với cảnh báo Elliott DW10): giá chạm mức, giá cắt hình vẽ, giá cắt EMA / SMA, mốc Elliott.
// Máy chủ kiểm mỗi 60 giây trong phiên; lời báo trung tính — không phải khuyến nghị mua / bán.
import type { DrawnPrimitive } from "../DrawingManager";
import type { AlertCondition } from "../../quant-core/elliott/alertSuggestions";

export type AlertGroup = "price" | "drawing" | "indicator" | "elliott";
export const GROUP_LABEL: Record<AlertGroup, string> = { price: "Giá", drawing: "Hình vẽ", indicator: "Chỉ báo", elliott: "Elliott" };
export interface CenterAlertDraft { kind: "price" | "drawing" | "indicator"; label: string; condition: AlertCondition; timeframe: "D" | "W" }

export const alertGroup = (kind: string): AlertGroup => (kind === "price" || kind === "drawing" || kind === "indicator" ? kind : "elliott");
const f = (v: number) => Math.round(v).toLocaleString("vi-VN");
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Mô tả điều kiện bằng lời (trung tính). */
export function conditionText(c: AlertCondition): string {
  switch (c.type) {
    case "level": return `Giá ${c.side === "above" ? "≥" : "≤"} ${f(c.price)}`;
    case "zone": return `Giá vào vùng ${f(c.low)}–${f(c.high)}`;
    case "line": return `Giá ${c.side === "above" ? "vượt lên trên" : "thủng xuống dưới"} đường ${f(c.a.price)} (${c.a.date}) → ${f(c.b.price)} (${c.b.date})`;
    case "ma": return `Giá ${c.side === "above" ? "vượt lên trên" : "thủng xuống dưới"} ${c.ma === "ema" ? "EMA" : "SMA"} ${c.period}`;
  }
}

/** Cảnh báo giá chạm mức: mức trên giá hiện tại -> "≥", dưới -> "≤" (như TradingView "Thêm cảnh báo tại giá"). */
export function priceAlert(price: number, last: number | null): CenterAlertDraft {
  const side = last == null || price >= last ? "above" : "below";
  return { kind: "price", timeframe: "D", label: `Giá chạm ${f(price)}`, condition: { type: "level", price, side } };
}

export function maAlert(ma: "ema" | "sma", period: number, side: "above" | "below"): CenterAlertDraft {
  return { kind: "indicator", timeframe: "D", label: `Giá ${side === "above" ? "cắt lên" : "cắt xuống"} ${ma === "ema" ? "EMA" : "SMA"} ${period}`, condition: { type: "ma", ma, period, side } };
}

/**
 * Cảnh báo khi giá cắt một hình vẽ — null nếu hình không hỗ trợ:
 * đường ngang / tia ngang -> mức; hình chữ nhật (Zone) -> vùng; đường xu hướng / tia / đường mở rộng / mũi tên -> đường
 * (chỉ khung ngày / tuần: máy chủ nội suy theo số phiên). Chiều = phía mà giá hiện tại CHƯA ở (đang trên -> báo khi thủng xuống).
 */
export function drawingAlert(p: DrawnPrimitive, last: number | null, timeframe: string, dates: readonly string[]): CenterAlertDraft | null {
  const tf = timeframe === "W" ? "W" : timeframe === "D" ? "D" : null;
  const name = p.name ? `"${p.name}"` : null;
  if (p.toolType === "shape" && (p.kind === "hline" || p.kind === "hray")) {
    const price = p.points[0].price, side = last == null || price >= last ? "above" : "below";
    return { kind: "drawing", timeframe: "D", label: `Giá cắt ${name ?? "đường ngang"} ${f(price)}`, condition: { type: "level", price, side } };
  }
  if (p.toolType === "rectangle") {
    const low = Math.min(p.p1.price, p.p2.price), high = Math.max(p.p1.price, p.p2.price);
    return { kind: "drawing", timeframe: "D", label: `Giá vào ${name ?? "vùng"} ${f(low)}–${f(high)}`, condition: { type: "zone", low, high } };
  }
  const two = p.toolType === "trendline" ? [p.p1, p.p2]
    : p.toolType === "shape" && (p.kind === "ray" || p.kind === "extended" || p.kind === "arrow") ? p.points.slice(0, 2) : null;
  if (!two || two.length < 2 || !tf) return null;
  const [a, b] = two[0].date <= two[1].date ? [two[0], two[1]] : [two[1], two[0]];
  if (!DAY.test(a.date) || !DAY.test(b.date) || a.date === b.date) return null;
  // Giá trị đường tại nến cuối (theo chỉ số nến) để chọn chiều.
  const ia = dates.indexOf(a.date), ib = dates.indexOf(b.date), il = dates.length - 1;
  const atLast = ia >= 0 && ib > ia ? a.price + ((b.price - a.price) * (il - ia)) / (ib - ia) : b.price;
  const side = last == null || last <= atLast ? "above" : "below";
  return { kind: "drawing", timeframe: tf, label: `Giá ${side === "above" ? "vượt lên trên" : "thủng xuống dưới"} ${name ?? "đường xu hướng"}`, condition: { type: "line", a, b, side } };
}
