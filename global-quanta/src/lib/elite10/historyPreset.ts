// N4 (29/10/2026) — chọn đợt lịch sử HIỂN THỊ trên chart mô phỏng (2D + 3D) để giảm rối màn hình.
// Chỉ ảnh hưởng hiển thị: trung vị, quạt dự phóng, xác suất, cửa sổ v3 vẫn tính trên ĐỦ các đợt.
import type { AnalogFan } from "./analogFan";
import { netOf, type EventStudy, type EventStudyWindow } from "./timingSim";

export type HistPreset = "analog3" | "recent3" | "wins" | "losses" | "all" | "none";
export const HIST_PRESETS: { id: HistPreset; label: string; title: string }[] = [
  { id: "analog3", label: "3 đợt giống nhất", title: "3 đợt có đường đi giống kỳ hiện tại nhất (trọng số analog của quạt dự phóng)" },
  { id: "recent3", label: "3 gần nhất", title: "3 đợt gần đây nhất" },
  { id: "wins", label: "Đợt thắng", title: "Đợt có lãi ròng dương ở cửa sổ đang xem" },
  { id: "losses", label: "Đợt thua", title: "Đợt có lãi ròng ≤ 0 ở cửa sổ đang xem" },
  { id: "all", label: "Tất cả", title: "Hiện mọi đợt lịch sử" },
  { id: "none", label: "Ẩn lịch sử", title: "Chỉ trung vị, kỳ tới và quạt dự phóng" },
];
export const DEFAULT_PRESET: HistPreset = "analog3";
export const HIST_PRESET_KEY = "elite10:timing-hist-preset";

/** Ngày sự kiện của các đợt được hiện theo bộ chọn nhanh. Thiếu dữ liệu cho bộ chọn -> lùi về bộ chọn hợp lý gần nhất. */
export function presetEvents(preset: HistPreset, es: EventStudy, fan: AnalogFan | null, win: EventStudyWindow | null): Set<string> {
  const dates = [...es.events].map((e) => e.eventDate).sort();
  const recent = () => new Set(dates.slice(-3));
  switch (preset) {
    case "all": return new Set(dates);
    case "none": return new Set();
    case "recent3": return recent();
    case "analog3": {
      if (!fan?.weights.length) return recent();
      return new Set([...fan.weights].sort((a, b) => b.weight - a.weight || b.eventDate.localeCompare(a.eventDate)).slice(0, 3).map((w) => w.eventDate));
    }
    case "wins":
    case "losses": {
      if (!win) return new Set(dates);
      const want = preset === "wins";
      return new Set(es.events.filter((e) => {
        const n = netOf(e.car, es.offsets, win.entryTo, win.exitOffset, es.costPerRoundTrip);
        return n != null && (n > 0) === want;
      }).map((e) => e.eventDate));
    }
  }
}

export function readPreset(): HistPreset {
  try {
    const v = window.localStorage.getItem(HIST_PRESET_KEY);
    return HIST_PRESETS.some((p) => p.id === v) ? (v as HistPreset) : DEFAULT_PRESET;
  } catch { return DEFAULT_PRESET; }
}
export function writePreset(p: HistPreset) {
  try { window.localStorage.setItem(HIST_PRESET_KEY, p); } catch { /* chế độ riêng tư / bị chặn — bỏ qua */ }
}
