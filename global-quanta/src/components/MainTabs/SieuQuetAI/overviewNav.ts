// OV-1 (27/11/2026) — hai tab con của TỔNG QUAN: "Bảng giao dịch" (Siêu Quét AI + Bảng giá) và "Thị trường"
// (Trung tâm thị trường → Trạng thái thị trường → VN-Index). Tab con ghi trên URL (?tab=tong-quan&view=…) và nhớ theo trình duyệt.
import type { SectorLadderRow } from "../../../lib/locnganh/types";

export type OverviewView = "bang" | "thi-truong";
export const OVERVIEW_VIEWS: readonly { id: OverviewView; label: string; key: string }[] = [
  { id: "bang", label: "Bảng giao dịch", key: "1" },
  { id: "thi-truong", label: "Thị trường", key: "2" },
];
export const OVERVIEW_VIEW_KEY = "gq.overview.view";
export const OVERVIEW_VIEW_PARAM = "view";
export const isOverviewView = (v: unknown): v is OverviewView => v === "bang" || v === "thi-truong";

/** Thứ tự ưu tiên: tham số URL (link chia sẻ, Quay lại/Đi tới) → lựa chọn đã nhớ → mặc định "Bảng giao dịch". */
export function readOverviewView(search = typeof window === "undefined" ? "" : window.location.search): OverviewView {
  const fromUrl = new URLSearchParams(search).get(OVERVIEW_VIEW_PARAM);
  if (isOverviewView(fromUrl)) return fromUrl;
  try { const saved = window.localStorage.getItem(OVERVIEW_VIEW_KEY); if (isOverviewView(saved)) return saved; } catch { /* không có storage */ }
  return "bang";
}

/** Ghi tab con: thay URL hiện tại (không thêm mục lịch sử — Quay lại/Đi tới vẫn đi theo trang chính) và nhớ lựa chọn. */
export function writeOverviewView(view: OverviewView) {
  try { window.localStorage.setItem(OVERVIEW_VIEW_KEY, view); } catch { /* không có storage */ }
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get(OVERVIEW_VIEW_PARAM) === view) return;
    url.searchParams.set(OVERVIEW_VIEW_PARAM, view);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  } catch { /* môi trường không có history */ }
}

export type SectorScope = { code: string; name: string; tickers: Set<string> };
/** Bộ lọc ngành dùng chung giữa hai tab con (giữ đúng ngữ nghĩa cũ của SieuQuetAiTab). */
export interface OverviewFilters {
  industries: Set<string>;
  setIndustries: (next: Set<string>) => void;
  sectorScope: SectorScope | null;
  setSectorScope: (s: SectorScope | null) => void;
  pickSector: (s: SectorLadderRow | null) => void;
}

/** Phím tắt 1 / 2 chỉ khi không gõ trong ô nhập và không giữ phím bổ trợ. */
export function overviewShortcut(e: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "target">): OverviewView | null {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  const t = e.target as HTMLElement | null;
  if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName ?? ""))) return null;
  return OVERVIEW_VIEWS.find((v) => v.key === e.key)?.id ?? null;
}
