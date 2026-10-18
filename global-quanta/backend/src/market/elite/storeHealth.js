// Elite 10 — theo dõi lỗi kho dữ liệu (Supabase) khi đọc KV. Các dịch vụ Elite nuốt lỗi đọc để không làm hỏng job, nhưng route
// cần phân biệt "chưa tính" (404) với "kho dữ liệu đang không đọc được" (503) để giao diện báo đúng nguyên nhân.
let last = null;
const FRESH_MS = 15 * 60_000;

export function noteStoreError(e) {
  last = { at: Date.now(), message: String(e?.message ?? e).slice(0, 300) };
}

/** Lỗi kho dữ liệu gần đây (≤ 15 phút) hoặc null. */
export function recentStoreError(now = Date.now()) {
  return last && now - last.at <= FRESH_MS ? last : null;
}

export function storeErrorVi(err) {
  return /exceed_egress_quota|402/.test(err.message)
    ? "Kho dữ liệu của Gateway (Supabase) đang bị chặn do vượt hạn mức dung lượng truyền của gói miễn phí. Dữ liệu Elite 10 vẫn lưu nguyên và sẽ hiển thị lại khi kho được mở (nâng gói hoặc hết chu kỳ hạn mức)."
    : `Kho dữ liệu của Gateway tạm không đọc được (${err.message.slice(0, 120)}). Dữ liệu Elite 10 vẫn lưu nguyên.`;
}

/** Chỉ dùng trong test. */
export function __resetStoreHealth() { last = null; }
