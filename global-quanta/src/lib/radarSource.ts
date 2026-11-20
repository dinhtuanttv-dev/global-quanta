// RD-4 (20/11/2026, tài liệu 20) — nguồn mã của ELITE COMMAND RADAR: ★ danh mục tự tạo (như trước) hoặc DANH MỤC ELITE HL chính thức
// (mã đang giữ trong /api/elite/decision). Lựa chọn nhớ theo TRÌNH DUYỆT, tách khỏi trạng thái ★ danh mục (đồng bộ đám mây) để không
// ghi một mã danh mục giả lên máy khác. Radar và Action Center đọc cùng nguồn (useSyncExternalStore).
import { useSyncExternalStore } from "react";

export type RadarSource = "watchlist" | "elite-hl";
export const RADAR_SOURCE_KEY = "gq.radar.source.v1";
export const ELITE_HL_LIST_ID = "__elite_hl__";
export const ELITE_HL_LIST_NAME = "Danh mục Elite HL";

const subs = new Set<() => void>();
const read = (): RadarSource => { try { return window.localStorage.getItem(RADAR_SOURCE_KEY) === "elite-hl" ? "elite-hl" : "watchlist"; } catch { return "watchlist"; } };
let current: RadarSource = typeof window === "undefined" ? "watchlist" : read();

export function setRadarSource(next: RadarSource) {
  current = next;
  try { window.localStorage.setItem(RADAR_SOURCE_KEY, next); } catch { /* chỉ nhớ trong phiên */ }
  subs.forEach((f) => f());
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

export function useRadarSource(): RadarSource {
  return useSyncExternalStore(subscribe, () => current, () => "watchlist");
}
