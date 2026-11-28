// TA-T2 (28/11/2026, docs/ta-tradingview — quyết định Q1 / Q2 của chủ dự án):
//   Q1: nến, khối lượng, histogram MACD và SuperTrend dùng MÀU TĂNG / GIẢM CỦA DỰ ÁN (--q-up / --q-down, như bảng giá Tổng quan)
//       thay màu neon #00F5A0 / #FF0055 — trước đây cùng một chart có hai màu xanh lá khác nhau.
//   Q2: màu ĐƯỜNG CHỈ BÁO theo mặc định TradingView (chỉ báo dựng sẵn của TradingView) để nhà đầu tư quen mắt nhận ra ngay.
// Chỉ là màu hiển thị — các hằng màu cũ trong detectors/* giữ nguyên (không đụng tệp tính toán).

/** --q-up / --q-down (src/styles/quanta-ui.css). */
export const CANDLE_UP = "#34d399";
export const CANDLE_DOWN = "#fb7185";
const a = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

export const TV_STYLE = {
  /** Bộ EMA 21 / 50 / 100 · MA 200: bảng màu đường của TradingView (mỗi đường một màu để phân biệt). */
  ma: { ema21: "#2962FF", ema50: "#FF9800", ema100: "#9C27B0", ma200: "#F23645" } as Record<string, string>,
  /** Ichimoku Cloud dựng sẵn của TradingView: Conversion / Base / Lagging / Lead 1 / Lead 2 + mây xanh / đỏ 10%. */
  ichimoku: { tenkan: "#2962FF", kijun: "#B71C1C", chikou: "#43A047", spanA: "#A5D6A7", spanB: "#EF9A9A", cloudUp: "rgba(67,160,71,0.10)", cloudDown: "rgba(244,67,54,0.10)" },
  /** Bollinger Bands dựng sẵn: Basis xanh dương, Upper đỏ, Lower xanh lá, nền xanh 5%. */
  bb: { mid: "#2962FF", upper: "#F23645", lower: "#089981", fill: "rgba(33,150,243,0.05)" },
  /** RSI: đường tím, vạch 70 / 30 xám nét đứt + 50 chấm, tô dải giữa hai ngưỡng. */
  rsi: { line: "#7E57C2", level: "#787B86", band: "rgba(126,87,194,0.10)" },
  macd: { macd: "#2962FF", signal: "#FF6D00" },
  /** TA-T4: Stochastic / Stoch RSI (%K xanh dương, %D cam, dải 20–80 xanh nhạt), ATR đỏ sẫm, OBV xanh dương, MFI tím (dải 20–80), Parabolic SAR xanh dương. */
  stoch: { k: "#2962FF", d: "#FF6D00", band: "rgba(33,150,243,0.10)" },
  atr: "#B71C1C", obv: "#2962FF", mfi: { line: "#7E57C2", band: "rgba(126,87,194,0.10)" }, psar: "#2962FF",
  /** DMI / ADX: +DI xanh dương, −DI cam, ADX hồng đậm; vạch ngưỡng xám. */
  dmi: { adx: "#F50057", plus: "#2962FF", minus: "#FF6D00", level: "#787B86" },
  /** SuperTrend theo Q1 (màu tăng / giảm dự án) + tô nền nhạt giữa giá và đường như TradingView. */
  st: { up: CANDLE_UP, down: CANDLE_DOWN, fillUp: a(CANDLE_UP, 0.08), fillDown: a(CANDLE_DOWN, 0.08) },
} as const;

/** Cột khối lượng theo chiều nến (Q1), 50% như TradingView. */
export const volumeColor = (up: boolean) => a(up ? CANDLE_UP : CANDLE_DOWN, 0.5);

/** Histogram MACD 4 sắc độ như TradingView (dương tăng / dương giảm / âm giảm / âm tăng) bằng màu dự án (Q1). */
export function macdHistColor(v: number, prev: number | null): string {
  if (v >= 0) return prev != null && v < prev ? a(CANDLE_UP, 0.45) : a(CANDLE_UP, 0.9);
  return prev != null && v > prev ? a(CANDLE_DOWN, 0.45) : a(CANDLE_DOWN, 0.9);
}
