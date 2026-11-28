// D7′ (19/11/2026): nhãn tốc độ giá cổ phiếu Việt Nam phản ánh một mặt hàng — từ khám phá trong mẫu 2013–2019 (chưa kiểm định ngoài mẫu).
import type { CommodityItem, TransmissionSpeed } from "../../../../lib/commodities/types";

export const SPEED_VI: Record<TransmissionSpeed, string> = {
  immediate: "Phản ánh ngay (≤ 1 phiên)",
  slow: "Phản ánh chậm (~1 tháng)",
  none: "Không đo được tác động",
  unmeasured: "Chưa đo được",
};
const TONE: Record<TransmissionSpeed, { bg: string; fg: string }> = {
  immediate: { bg: "rgba(148,163,184,0.12)", fg: "var(--text-secondary, #cbd5e1)" },
  slow: { bg: "rgba(79, 142, 247,0.14)", fg: "var(--q-accent, #4f8ef7)" },
  none: { bg: "rgba(148,163,184,0.08)", fg: "var(--text-tertiary, #94a3b8)" },
  unmeasured: { bg: "rgba(148,163,184,0.08)", fg: "var(--text-tertiary, #94a3b8)" },
};

export default function TransmissionBadge({ item, withNote = false }: { item: Pick<CommodityItem, "transmission">; withNote?: boolean }) {
  const t = item.transmission;
  if (!t) return null;
  const tone = TONE[t.speed];
  return (
    <span className="inline-flex flex-col gap-0.5" data-testid="commodity-transmission" data-speed={t.speed}>
      <span title={t.noteVi} className="text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap self-start" style={{ background: tone.bg, color: tone.fg }}>{SPEED_VI[t.speed]}</span>
      {withNote && <span className="text-[10px] leading-snug" style={{ color: "var(--text-tertiary, #94a3b8)" }}>{t.noteVi}</span>}
    </span>
  );
}
