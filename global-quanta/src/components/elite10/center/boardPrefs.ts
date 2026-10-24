// C2 — trạng thái hiển thị của Bảng quyết định Elite 10 (mở / thu gọn, đầy đủ / gọn) theo TÀI KHOẢN trên máy (khoá gắn tài khoản — A2).
// Mặc định (đã duyệt 25/10/2026): Danh mục mở · Ứng viên thu gọn; màn hẹp (< 768 px) tự dùng chế độ GỌN nếu người dùng chưa chọn.
import { useCallback, useEffect, useState } from "react";
import { readScoped, writeScoped } from "../../../lib/ta-command-center/userScope";

export type BoardSection = "portfolio" | "candidates";
export interface SectionPrefs { open: boolean; compact: boolean | null }
export type BoardPrefs = Record<BoardSection, SectionPrefs>;

const KEY = "gq.elite.board.v1";
export const DEFAULT_BOARD_PREFS: BoardPrefs = { portfolio: { open: true, compact: null }, candidates: { open: false, compact: null } };

export function readBoardPrefs(): BoardPrefs {
  try {
    const raw = JSON.parse(readScoped(KEY) ?? "null") as Partial<BoardPrefs> | null;
    const sec = (k: BoardSection): SectionPrefs => {
      const r = raw?.[k];
      return { open: typeof r?.open === "boolean" ? r.open : DEFAULT_BOARD_PREFS[k].open, compact: typeof r?.compact === "boolean" ? r.compact : null };
    };
    return { portfolio: sec("portfolio"), candidates: sec("candidates") };
  } catch { return DEFAULT_BOARD_PREFS; }
}

const narrow = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 767px)").matches;

/** Trạng thái một phần của bảng + hàm đổi; `compact` hiệu dụng = lựa chọn của người dùng, chưa chọn thì theo bề rộng màn hình. */
export function useBoardSection(section: BoardSection) {
  const [prefs, setPrefs] = useState<BoardPrefs>(() => readBoardPrefs());
  const [isNarrow, setNarrow] = useState(narrow);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setNarrow(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  const update = useCallback((patch: Partial<SectionPrefs>) => {
    // Đọc lại bản đang lưu trước khi gộp: hai bảng giữ trạng thái riêng -> không ghi đè lựa chọn vừa đổi ở bảng kia.
    const cur = readBoardPrefs();
    const next = { ...cur, [section]: { ...cur[section], ...patch } };
    writeScoped(KEY, JSON.stringify(next));
    setPrefs(next);
  }, [section]);
  const s = prefs[section];
  return {
    open: s.open, compact: s.compact ?? isNarrow,
    toggleOpen: () => update({ open: !s.open }),
    toggleCompact: () => update({ compact: !(s.compact ?? isNarrow) }),
  };
}
