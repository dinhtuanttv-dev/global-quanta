const T = {
  gold: "var(--gold, #f59e0b)",
  textTertiary: "var(--text-tertiary, #64748b)",
};

// Nguong "cu" - World Bank Pink Sheet thuong cong bo dau thang; 45 ngay du
// du phong cho truong hop cong bo tre, van khong qua muc lam mat y nghia
// canh bao (VD neu de 90 ngay thi 2 thang lien tiep khong bao dong).
const STALE_THRESHOLD_DAYS = 45;

export default function StalenessBadge({ updatedAt }: { updatedAt: string | null | undefined }) {
  if (typeof updatedAt !== "string") return null;
  const updated = new Date(updatedAt);
  if (Number.isNaN(updated.getTime())) return null;

  const daysSince = Math.floor((Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSince < STALE_THRESHOLD_DAYS) return null;

  return (
    <span
      title={`Dữ liệu kỳ ${updated.toLocaleDateString("vi-VN")} - đã ${daysSince} ngày, có thể chưa có bản cập nhật mới từ nguồn`}
      className="text-[8px] font-bold px-1.5 py-0.5 rounded"
      style={{ background: "rgba(245,158,11,0.12)", color: T.gold }}>
      Dữ liệu {daysSince} ngày trước
    </span>
  );
}
