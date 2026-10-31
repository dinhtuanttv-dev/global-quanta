// Điều hướng tab chính (31/10/2026): tên hiển thị, đường dẫn và lịch sử phiên. Mã nội bộ (id) giữ nguyên để các liên kết trong app không đổi.
export const MAIN_TABS = [
  { id: "Sieu quet AI", label: "TỔNG QUAN", slug: "tong-quan" },
  { id: "Ket noi the gioi", label: "KẾT NỐI THẾ GIỚI", slug: "ket-noi-the-gioi" },
  { id: "Loc nganh", label: "PHÂN TÍCH NGÀNH", slug: "phan-tich-nganh" },
  { id: "TA VN-Index", label: "PHÂN TÍCH KỸ THUẬT", slug: "phan-tich-ky-thuat" },
  { id: "Chat xuc tac", label: "PHÂN TÍCH VĨ MÔ", slug: "phan-tich-vi-mo" },
  { id: "Co tuc", label: "PHÂN TÍCH CƠ BẢN", slug: "phan-tich-co-ban" },
  { id: "Elite 10", label: "QUYẾT ĐỊNH", slug: "quyet-dinh" },
] as const;

export type MainTabId = (typeof MAIN_TABS)[number]["id"];
export const DEFAULT_TAB: MainTabId = MAIN_TABS[0].id;
export const isMainTab = (v: unknown): v is MainTabId => MAIN_TABS.some((t) => t.id === v);
export const labelOf = (id: string): string => MAIN_TABS.find((t) => t.id === id)?.label ?? id;
export const slugOf = (id: MainTabId): string => MAIN_TABS.find((t) => t.id === id)!.slug;
export const tabOfSlug = (slug: string | null | undefined): MainTabId | null => MAIN_TABS.find((t) => t.slug === slug)?.id ?? null;

export interface NavState { stack: MainTabId[]; idx: number }

/** Mở tab mới: bỏ nhánh forward như trình duyệt. Mở lại đúng tab đang xem thì không thêm mục. */
export function pushTab(nav: NavState, tab: MainTabId): NavState {
  if (nav.stack[nav.idx] === tab) return nav;
  return { stack: [...nav.stack.slice(0, nav.idx + 1), tab], idx: nav.idx + 1 };
}

/**
 * Xác định vị trí khi người dùng back/forward. Mục lịch sử có gqIdx hợp lệ thì tin gqIdx.
 * Mục bị xoá state (bộ lọc Cổ tức dùng replaceState(null)) thì suy từ tab trong URL, hoặc từ mục liền kề.
 */
export function resolvePop(nav: NavState, stateIdx: unknown, urlTab: MainTabId | null): number {
  if (typeof stateIdx === "number" && Number.isInteger(stateIdx) && stateIdx >= 0 && stateIdx < nav.stack.length) return stateIdx;
  const near = [nav.idx - 1, nav.idx + 1].filter((i) => i >= 0 && i < nav.stack.length);
  const hit = urlTab ? near.find((i) => nav.stack[i] === urlTab) : undefined;
  if (hit !== undefined) return hit;
  return near[0] ?? nav.idx;
}

export const canGoBack = (nav: NavState): boolean => nav.idx > 0;
export const canGoForward = (nav: NavState): boolean => nav.idx < nav.stack.length - 1;

/** Khôi phục sau khi tải lại trang. Dữ liệu lưu sai dạng thì bỏ, không để lỗi. */
export function parseNav(raw: string | null): NavState | null {
  try {
    const v = JSON.parse(raw ?? "null");
    if (!v || !Array.isArray(v.stack) || !v.stack.length || !v.stack.every(isMainTab) || !Number.isInteger(v.idx) || v.idx < 0 || v.idx >= v.stack.length) return null;
    return { stack: v.stack, idx: v.idx };
  } catch { return null; }
}

/** Trạng thái đầu khi vào app. Thứ tự ưu tiên: đường dẫn, rồi vị trí đã lưu của đúng mục lịch sử này, rồi tab mặc định. */
export function initialNav(saved: NavState | null, stateIdx: unknown, urlTab: MainTabId | null): NavState {
  if (saved && typeof stateIdx === "number" && stateIdx >= 0 && stateIdx < saved.stack.length && (!urlTab || saved.stack[stateIdx] === urlTab)) return { stack: saved.stack, idx: stateIdx };
  return { stack: [urlTab ?? DEFAULT_TAB], idx: 0 };
}
