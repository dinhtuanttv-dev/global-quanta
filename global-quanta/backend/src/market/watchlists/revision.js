// A2 (C-07) — đồng bộ dữ liệu người dùng có PHIÊN BẢN do máy chủ cấp: `updatedAt` (giờ máy chủ, tăng nghiêm ngặt) là số phiên bản.
// Máy khách gửi kèm `baseUpdatedAt` = phiên bản nó đã thấy; máy chủ đang giữ bản khác -> 409 kèm bản hiện tại để máy khách gộp
// (không ghi đè dữ liệu vừa lưu ở thiết bị khác). Máy khách cũ không gửi `baseUpdatedAt` -> ghi như trước (tương thích ngược).

export function conflictError(current) {
  const error = new Error("Dữ liệu vừa được thay đổi ở thiết bị khác.");
  error.statusCode = 409;
  error.current = current;
  return error;
}

/** Ném 409 nếu máy khách gửi phiên bản gốc khác phiên bản đang lưu. */
export function assertBaseRevision(body, current) {
  if (!body || typeof body !== "object" || !("baseUpdatedAt" in body)) return;
  const base = body.baseUpdatedAt ?? null;
  if ((current?.updatedAt ?? null) !== base) throw conflictError(current);
}

/** Thời điểm lưu mới, luôn lớn hơn phiên bản trước (hai lần lưu cùng mili-giây vẫn khác phiên bản). */
export function nextRevision(now, previous) {
  const t = now.getTime();
  const prev = previous ? Date.parse(previous) : NaN;
  return new Date(Number.isFinite(prev) && t <= prev ? prev + 1 : t).toISOString();
}
