// F1 (06/11/2026) — điều hướng tab PHÂN TÍCH CƠ BẢN: 3 tab con (Kết quả kinh doanh · Cổ tức · Timeline điểm mua) và các mục bên trong.
// id mục cũ giữ nguyên để không đổi logic hiển thị; mục cuối đã xem của mỗi tab con được nhớ theo trình duyệt (tiện ích, có thể mất).

export type CotucGroup = "kqkd" | "cotuc" | "timeline";
export type SubView = "quality" | "earnings" | "seasonality" | "kqkd-calendar" | "screener" | "calendar-v3" | "timing-v3" | "ranking" | "legacy" | "timeline";

export const GROUP_OF: Record<SubView, CotucGroup> = {
  quality: "kqkd", earnings: "kqkd", seasonality: "kqkd", "kqkd-calendar": "kqkd",
  screener: "cotuc", "calendar-v3": "cotuc", "timing-v3": "cotuc", ranking: "cotuc", legacy: "cotuc",
  timeline: "timeline",
};
export const GROUPS: { id: CotucGroup; label: string; sub: string }[] = [
  { id: "kqkd", label: "📈 Kết quả kinh doanh", sub: "Chất lượng KQKD · KQKD theo quý · Mùa vụ · Lịch công bố" },
  { id: "cotuc", label: "💰 Cổ tức", sub: "Bộ lọc · Lịch sự kiện · Thời điểm tối ưu · Xếp hạng" },
  { id: "timeline", label: "⏱ Timeline điểm mua", sub: "Vùng mua có cơ sở thống kê theo ngày" },
];
export const VIEWS: { id: SubView; label: string }[] = [
  { id: "quality", label: "🏆 Chất lượng KQKD" }, { id: "earnings", label: "📈 KQKD theo quý" }, { id: "seasonality", label: "📊 Mùa vụ KQKD" }, { id: "kqkd-calendar", label: "📋 Lịch công bố KQKD" },
  { id: "screener", label: "📋 Bộ lọc cổ phiếu" }, { id: "calendar-v3", label: "🗓️ Lịch sự kiện" }, { id: "timing-v3", label: "🧭 Thời điểm tối ưu" },
  { id: "ranking", label: "🎯 Xếp hạng xác suất" }, { id: "legacy", label: "🗂 Lưu trữ (bản cũ)" },
];
export const VIEW_KEY = "gq.cotuc.view.v1";
export const DEFAULT_LAST: Record<CotucGroup, SubView> = { kqkd: "quality", cotuc: "screener", timeline: "timeline" };

/** Mục đã nhớ; không có / hỏng / không có storage -> mở Timeline điểm mua (mặc định). */
export function readView(storage: Pick<Storage, "getItem"> | null = typeof localStorage === "undefined" ? null : localStorage): { view: SubView; last: Record<CotucGroup, SubView> } {
  try {
    const v = JSON.parse(storage?.getItem(VIEW_KEY) ?? "null");
    if (v && typeof v.view === "string" && v.view in GROUP_OF) {
      const last = { ...DEFAULT_LAST };
      for (const g of Object.keys(DEFAULT_LAST) as CotucGroup[]) { const x = v.last?.[g]; if (typeof x === "string" && x in GROUP_OF && GROUP_OF[x as SubView] === g) last[g] = x as SubView; }
      return { view: v.view as SubView, last };
    }
  } catch { /* không có storage hoặc dữ liệu hỏng */ }
  return { view: "timeline", last: DEFAULT_LAST };
}
