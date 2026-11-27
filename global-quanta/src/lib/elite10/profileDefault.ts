// HS360-v3 H1 (27/11/2026, docs/ho-so-360-v3/02 §5, quyết định Q6): mã mặc định của Hồ sơ 360°.
// Trước đây mở tab 2 lần đầu luôn là VNINDEX -> hiện "không nằm trong vũ trụ". Thứ tự ưu tiên:
//   1. mã người xem đã chọn trong hồ sơ (cục bộ)
//   2. mã đang chọn toàn trang — nếu thuộc vũ trụ bảng tín hiệu E1 (chưa tải bảng thì vẫn nhận)
//   3. mã hạng 1 của danh mục Elite HL
//   4. mã toàn trang (dù ngoài vũ trụ) → VNINDEX
export function defaultProfileTicker({ local, global, universe, hlFirst }: {
  local: string | null; global: string | null; universe: ReadonlySet<string> | null; hlFirst: string | null;
}): string {
  if (local) return local;
  if (global && (!universe || universe.has(global))) return global;
  if (hlFirst) return hlFirst;
  return global ?? "VNINDEX";
}
