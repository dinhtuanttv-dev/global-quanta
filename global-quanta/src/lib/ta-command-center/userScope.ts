// A2 (C-06) — dữ liệu người dùng trên máy được GẮN THEO TÀI KHOẢN: `<khoá>@<id tài khoản>` (chưa đăng nhập: `@guest`).
// Hai người dùng chung trình duyệt không thấy / không ghi đè dữ liệu của nhau. Dữ liệu cũ (khoá không gắn tài khoản, trước A2)
// được CHUYỂN MỘT LẦN cho tài khoản đầu tiên đăng nhập rồi xoá khoá cũ — không chia cho khách, không nhân bản sang tài khoản khác.
import { currentUser } from "../../services/api";

export const userScope = (): string => currentUser()?.id ?? "guest";
export const scopedKey = (base: string, scope: string = userScope()) => `${base}@${scope}`;

/** Đọc khoá của tài khoản hiện tại (kèm chuyển dữ liệu cũ một lần). Lỗi bộ nhớ -> null. */
export function readScoped(base: string, scope: string = userScope()): string | null {
  try {
    const k = scopedKey(base, scope);
    const v = window.localStorage.getItem(k);
    if (v != null || scope === "guest") return v;
    const legacy = window.localStorage.getItem(base);
    if (legacy == null) return null;
    window.localStorage.setItem(k, legacy);
    window.localStorage.removeItem(base);
    return legacy;
  } catch { return null; }
}

export function writeScoped(base: string, value: string, scope: string = userScope()): void {
  try { window.localStorage.setItem(scopedKey(base, scope), value); } catch { /* đầy bộ nhớ / chế độ riêng tư */ }
}
