/**
 * Nhãn mức bằng chứng dùng chung cho tab Kết nối thế giới (rà soát W1/W7, 2026-10-16).
 * - data: số liệu thị trường quan sát được (giá, chỉ số) — không phải tín hiệu dự báo.
 * - heuristic: luật/ánh xạ đặt tay; "failed" = đã kiểm định đặt trước và KHÔNG đạt.
 * - evidence: kết quả kiểm định ngoài mẫu của engine Truyền dẫn & bằng chứng.
 */
export type EvidenceKind = "data" | "heuristic" | "failed" | "evidence";

const STYLE: Record<EvidenceKind, { label: string; color: string; bg: string; title: string }> = {
  data: { label: "SỐ LIỆU THẬT", color: "var(--text-secondary, #94a3b8)", bg: "rgba(148,163,184,0.1)", title: "Số liệu thị trường quan sát được — không phải tín hiệu dự báo" },
  heuristic: { label: "HEURISTIC · CHƯA KIỂM ĐỊNH", color: "var(--gold, #f59e0b)", bg: "rgba(245,158,11,0.1)", title: "Luật / ánh xạ đặt tay, chưa qua kiểm định ngoài mẫu — chỉ tham khảo" },
  failed: { label: "HEURISTIC · KHÔNG ĐẠT KIỂM ĐỊNH", color: "var(--negative, #f87171)", bg: "rgba(248,113,113,0.1)", title: "Đã kiểm định đặt trước và KHÔNG đạt — chỉ tham khảo, không dùng trong quyết định" },
  evidence: { label: "BẰNG CHỨNG NGOÀI MẪU", color: "var(--positive, #34d399)", bg: "rgba(52,211,153,0.1)", title: "Chỉ liên kết bậc A/B qua kiểm định ngoài mẫu mới được coi là bằng chứng" },
};

export default function EvidenceTag({ kind, title }: { kind: EvidenceKind; title?: string }) {
  const s = STYLE[kind];
  return (
    <span title={title ?? s.title} className="text-[8px] font-bold px-1.5 py-0.5 rounded shrink-0"
      style={{ background: s.bg, color: s.color }}>
      {s.label}
    </span>
  );
}

/** Quy tắc khi các phần heuristic và phần bằng chứng nói khác nhau (W7). */
export function EvidencePriorityNote() {
  return (
    <p className="text-[9px] leading-relaxed rounded-lg px-3 py-2"
      style={{ color: "var(--text-tertiary, #64748b)", background: "rgba(148,163,184,0.05)", border: "1px solid rgba(148,163,184,0.1)" }}>
      <b style={{ color: "var(--text-secondary, #94a3b8)" }}>Quy tắc ưu tiên:</b> nhãn BẰNG CHỨNG chỉ gắn cho phần đã qua kiểm định đặt trước —
      xếp hạng ngành thuận/ngược gió <b>ngắn hạn</b> (WS-v1: IC ≈ 0,02, nhỏ) và riêng ngành Dầu khí; xếp hạng trung hạn và các phần HEURISTIC
      (Risk-On, ánh xạ hàng hoá → mã) là tham khảo. Khi khác với tab <i>Truyền dẫn &amp; bằng chứng</i>, chỉ liên kết <b>bậc A/B</b> mới được
      ưu tiên. Risk-On đã kiểm định đặt trước (10 năm) và <b>không đạt</b> nên không dùng trong quyết định Lọc ngành.
    </p>
  );
}
