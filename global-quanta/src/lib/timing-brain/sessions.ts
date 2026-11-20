// BỘ NÃO CHU KỲ & THỜI ĐIỂM — CT2 (20/11/2026, docs/elite-cycle-timing-brain 04 mục 3). Chuẩn hoá "số phiên tới vùng mua" để KHÔNG bao
// giờ hiện số âm. Hai nguồn cùng tên trường, khác nghĩa: Project A ghi số âm = số phiên ĐÃ TRÔI QUA từ lúc mở cửa sổ; Gateway kẹp 0.
// Không tính lại phiên: chỉ đọc dấu của số nguồn. Hàm thuần.
export interface SessionsLike { status: "UPCOMING" | "IN_WINDOW" | "PASSED"; sessionsToEntry: number; entryFromDate: string; exitDate: string }
export interface NormSessions { toEntry: number | null; elapsed: number | null }

export function normSessions(r: Pick<SessionsLike, "status" | "sessionsToEntry">): NormSessions {
  const n = Number.isFinite(r.sessionsToEntry) ? r.sessionsToEntry : null;
  if (r.status === "UPCOMING") return { toEntry: n == null ? null : Math.max(0, n), elapsed: null };
  return { toEntry: 0, elapsed: n != null && n < 0 ? -n : null };
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Phần BỔ SUNG cho chữ trạng thái cũ ("đang mở" / "đã qua" / "còn N phiên"): " từ 13/10", " · thoát 02/11", " · đã mở 14 phiên"… ; sắp tới -> "". */
export function sessionExtra(r: SessionsLike): string {
  const s = normSessions(r);
  if (r.status === "UPCOMING") return "";
  if (r.status === "IN_WINDOW") return s.elapsed != null ? ` · đã mở ${s.elapsed} phiên` : ` từ ${dm(r.entryFromDate)}`;
  return s.elapsed != null ? ` · vùng mở cách đây ${s.elapsed} phiên` : ` · thoát ${dm(r.exitDate)}`;
}

/** Chữ trạng thái phiên: "còn N phiên" · "đã mở N phiên" / "đang mở từ dd/mm" · "đã qua · …". */
export function sessionText(r: SessionsLike): string {
  const s = normSessions(r);
  if (r.status === "UPCOMING") return s.toEntry == null ? "sắp tới" : s.toEntry === 0 ? "mở phiên tới" : `còn ${s.toEntry} phiên`;
  if (r.status === "IN_WINDOW") return s.elapsed != null ? `đã mở ${s.elapsed} phiên` : `đang mở từ ${dm(r.entryFromDate)}`;
  return s.elapsed != null ? `đã qua · vùng mở cách đây ${s.elapsed} phiên` : `đã qua · thoát ${dm(r.exitDate)}`;
}
