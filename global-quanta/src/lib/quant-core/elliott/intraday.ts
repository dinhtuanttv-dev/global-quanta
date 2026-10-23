// DW9 (23/10/2026) — Elliott trên khung TRONG NGÀY (1H, 15m) từ nến phút SSI (/api/market/ta-intraday, ~30 phiên).
// Ngưỡng zigzag co theo căn thời gian so với khung ngày 3%: 1H ≈ 3% / √5 ≈ 1,4% (≈ 5 nến giờ / phiên), 15m ≈ 3% / √18 ≈ 0,7%.
// Chỉ 2 bậc (nhỏ, trung): lịch sử 30 phiên không đủ cho bậc lớn. Không chạy cho 1m / 5m (nhiễu khớp lệnh lẻ).
import type { OhlcvBar } from "../../ta-command-center/types";
import { elliottState, type ElliottState } from "./index";

export const INTRADAY_ELLIOTT = {
  "1H": { zigzagPct: 0.014, minBars: 100 },
  "15m": { zigzagPct: 0.007, minBars: 200 },
} as const;
export type IntradayElliottTf = keyof typeof INTRADAY_ELLIOTT;
export const INTRADAY_DEGREES = [{ name: "minor", k: 0.5 }, { name: "intermediate", k: 1 }];
export const INTRADAY_NOTE = "Khung trong ngày: lịch sử ~30 phiên từ nến phút SSI — chỉ bậc nhỏ / trung, ngưỡng zigzag co theo căn thời gian.";

export const isIntradayElliottTf = (tf: string): tf is IntradayElliottTf => tf === "1H" || tf === "15m";

/** Trạng thái Elliott của khung 1H / 15m (null nếu khung khác hoặc chưa đủ nến). */
export function intradayElliottState(bars: OhlcvBar[], tf: string): (ElliottState & { intraday: true; tf: IntradayElliottTf }) | null {
  if (!isIntradayElliottTf(tf)) return null;
  const cfg = INTRADAY_ELLIOTT[tf];
  if (bars.length < cfg.minBars) return null;
  const st = elliottState(bars, { zigzagPct: cfg.zigzagPct, degrees: INTRADAY_DEGREES });
  return st ? { ...st, label: `${st.label} · khung ${tf}`, intraday: true, tf } : null;
}
