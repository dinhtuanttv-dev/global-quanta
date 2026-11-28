// TA-T3 (28/11/2026) — tuỳ chọn hiển thị chart theo người xem: kiểu biểu đồ, thang giá, KL chồng lên giá (Q3).
// Là tiện ích theo trình duyệt (có thể mất khi xoá dữ liệu trang) — mặc định luôn là hành vi cũ: nến, thang thường, KL pane riêng.
import { useCallback, useState } from "react";
import type { ChartType, ScaleMode } from "../../../../lib/ta-command-center/TVChartManager";

export interface ChartPrefs { type: ChartType; scale: ScaleMode; inverted: boolean; volOverlay: boolean }
export const DEFAULT_CHART_PREFS: ChartPrefs = { type: "candle", scale: "normal", inverted: false, volOverlay: false };
const KEY = "gq.ta.chartPrefs.v1";
const TYPES: ChartType[] = ["candle", "hollow", "heikin", "bar", "line", "area", "baseline"];
const SCALES: ScaleMode[] = ["normal", "log", "percent", "indexed"];

/** Đọc + kiểm từng trường (dữ liệu hỏng / lạ -> mặc định). */
export function readChartPrefs(raw: string | null): ChartPrefs {
  try {
    const v = JSON.parse(raw ?? "null") as Partial<ChartPrefs> | null;
    if (!v || typeof v !== "object") return DEFAULT_CHART_PREFS;
    return {
      type: TYPES.includes(v.type as ChartType) ? (v.type as ChartType) : "candle",
      scale: SCALES.includes(v.scale as ScaleMode) ? (v.scale as ScaleMode) : "normal",
      inverted: v.inverted === true,
      volOverlay: v.volOverlay === true,
    };
  } catch { return DEFAULT_CHART_PREFS; }
}

export function useChartPrefs(): [ChartPrefs, (patch: Partial<ChartPrefs>) => void] {
  const [prefs, setPrefs] = useState<ChartPrefs>(() => { try { return readChartPrefs(localStorage.getItem(KEY)); } catch { return DEFAULT_CHART_PREFS; } });
  const update = useCallback((patch: Partial<ChartPrefs>) => setPrefs((p) => {
    const next = { ...p, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* bộ nhớ bị chặn: chỉ giữ trong phiên */ }
    return next;
  }), []);
  return [prefs, update];
}

export const CHART_TYPE_LABEL: Record<ChartType, string> = {
  candle: "Nến", hollow: "Nến rỗng", heikin: "Heikin Ashi", bar: "Thanh OHLC", line: "Đường", area: "Vùng", baseline: "Đường nền",
};
