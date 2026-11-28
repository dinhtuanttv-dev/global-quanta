// TA-T1 (28/11/2026, docs/ta-tradingview 02 §T1) — định dạng TIẾNG VIỆT cho chart (trục giá, trục thời gian, nhãn crosshair, KL).
// Trước đây trục dùng mặc định thư viện (tiếng Anh: "Mar", "24 Jul '26"; số "1653.90") lệch với chú giải và cả dự án ("1.653,9").
// Thời gian của chart là UTCTimestamp đã dịch sang giờ Việt Nam (chart/time.ts) -> đọc bằng getUTC* là ra giờ VN.
// Chỉ đổi CÁCH HIỂN THỊ — không đụng dữ liệu hay phép tính chỉ báo.
import { TickMarkType, type Time } from "lightweight-charts-v5";

const MONTH = ["Th1", "Th2", "Th3", "Th4", "Th5", "Th6", "Th7", "Th8", "Th9", "Th10", "Th11", "Th12"] as const;
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;
const nf = new Map<number, Intl.NumberFormat>();
const two = (n: number) => String(n).padStart(2, "0");

/** Số kiểu Việt với đúng `digits` chữ số thập phân: 1653.9 -> "1.653,90". */
export function viPrice(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "";
  let f = nf.get(digits);
  if (!f) { f = new Intl.NumberFormat("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits }); nf.set(digits, f); }
  return f.format(v);
}

/** Khối lượng / giá trị gọn: 460_960_000 -> "460,96 tr"; 1,2e9 -> "1,2 tỷ"; 4500 -> "4,5 N". Dấu âm là "−". */
export function viVolume(v: number): string {
  if (!Number.isFinite(v)) return "";
  const a = Math.abs(v), s = v < 0 ? "−" : "";
  const fmt = (x: number, d: number) => x.toLocaleString("vi-VN", { maximumFractionDigits: d });
  if (a >= 1e9) return `${s}${fmt(a / 1e9, 2)} tỷ`;
  if (a >= 1e6) return `${s}${fmt(a / 1e6, 2)} tr`;
  if (a >= 1e3) return `${s}${fmt(a / 1e3, 1)} N`;
  return `${s}${fmt(a, 0)}`;
}

function toDate(t: Time): Date {
  if (typeof t === "number") return new Date(t * 1000);
  if (typeof t === "string") return new Date(`${t}T00:00:00Z`);
  return new Date(Date.UTC(t.year, t.month - 1, t.day));
}

/** Nhãn mốc trên trục thời gian: năm "2026" · tháng "Th3" · ngày "24" · giờ "10:15". */
export function viTickMark(t: Time, type: TickMarkType): string {
  const d = toDate(t);
  switch (type) {
    case TickMarkType.Year: return String(d.getUTCFullYear());
    case TickMarkType.Month: return MONTH[d.getUTCMonth()];
    case TickMarkType.DayOfMonth: return String(d.getUTCDate());
    case TickMarkType.TimeWithSeconds: return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}:${two(d.getUTCSeconds())}`;
    default: return `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
  }
}

/** Nhãn thời gian dưới crosshair: "T6, 24 Th7 '26" (khung ngày) · thêm " 10:15" (khung trong ngày). */
export function viCrosshairTime(t: Time, intraday: boolean): string {
  const d = toDate(t);
  const base = `${WEEKDAY[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(2)}`;
  return intraday ? `${base} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}` : base;
}

/** Số chữ số thập phân của GIÁ theo mã (như TradingView chỉnh độ chính xác theo mã): cổ phiếu niêm yết tính bằng đồng
 *  (giá nguyên, ≥ 1.000) -> 0 chữ số ("96.697"); chỉ số và giá lẻ -> 2 chữ số ("1.653,90"). Xét 50 nến cuối. */
export function priceDigitsFor(bars: readonly { close: number }[]): 0 | 2 {
  const tail = bars.slice(-50);
  return tail.length > 0 && tail.every((b) => Number.isInteger(b.close) && Math.abs(b.close) >= 1000) ? 0 : 2;
}

/** priceFormat dùng chung: giá / chỉ báo (2 chữ số thập phân) và khối lượng (tỷ / tr / N). */
export const PRICE_FMT = { type: "custom" as const, formatter: (p: number) => viPrice(p, 2), minMove: 0.01 };
export const VOLUME_FMT = { type: "custom" as const, formatter: (p: number) => viVolume(p), minMove: 1 };
