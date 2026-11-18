// PX0 (18/11/2026) — huy hiệu vòng đời đợt pha loãng ≥ 10%: SẮP GDKHQ / HẬU GDKHQ / CP MỚI GIAO DỊCH. Chỉ hiển thị — PX-r1 KHÔNG ĐẠT,
// không có cổng mua / bán; mục đích là biết lịch nguồn cung (phần cổ phiếu mới về và giao dịch được).
import type { DilutionPhase, PxR1 } from "../../../lib/elite10/decisionTypes";

const CAT: Record<DilutionPhase["cat"], string> = { STOCK: "CP", BONUS: "thưởng", RIGHTS: "quyền mua" };
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const BASIS: Record<DilutionPhase["listingBasis"], string> = {
  ANNOUNCED: "ngày niêm yết bổ sung đã công bố",
  ESTIMATED_OWN: "ước tính theo độ trễ niêm yết các đợt trước của chính mã",
  ESTIMATED_MARKET: "ước tính theo trung vị độ trễ niêm yết toàn thị trường",
};
const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toLocaleString("vi-VN", { maximumFractionDigits: 2 })}%`;

export function dilutionText(p: DilutionPhase): { short: string; long: string; tone: "pre" | "post" | "listed" } {
  const what = `${CAT[p.cat]} ${p.ratio.toLocaleString("vi-VN")}%`, est = p.listingBasis === "ANNOUNCED" ? "" : "≈";
  if (p.phase === "PRE_EX") return { tone: "pre", short: `SẮP GDKHQ · ${what} · ${p.sessionsTo} phiên`, long: `GDKHQ ${what} ngày ${dm(p.ex)} (còn ${p.sessionsTo} phiên). Cổ phiếu mới dự kiến giao dịch ${est}${dm(p.listing)} — ${BASIS[p.listingBasis]}.` };
  if (p.listed) return { tone: "listed", short: `CP MỚI ĐÃ GIAO DỊCH · ${dm(p.listing)}`, long: `Cổ phiếu mới của đợt ${what} (GDKHQ ${dm(p.ex)}) giao dịch từ ${dm(p.listing)}; cửa sổ theo dõi tới ${dm(p.until)}.` };
  return { tone: "post", short: `HẬU GDKHQ · ${what} · phiên ${p.day}/${est}${p.lag}`, long: `Đã GDKHQ ${what} ngày ${dm(p.ex)} (phiên thứ ${p.day}). Cổ phiếu mới về và giao dịch được ${est}${dm(p.listing)} — ${BASIS[p.listingBasis]}${p.nOwn ? ` (${p.nOwn} đợt trước)` : ""}.` };
}
const TONE = { pre: "border-amber-400/60 text-amber-200", post: "border-orange-400/60 text-orange-200", listed: "border-slate-400/50 text-slate-300" };

export default function DilutionBadge({ p, pxR1, testId }: { p: DilutionPhase | null | undefined; pxR1?: PxR1 | null; testId?: string }) {
  if (!p) return null;
  const t = dilutionText(p);
  const title = `${t.long}\n${pxR1 ? `${pxR1.textVi} (TB ${pct(pxR1.mean30)}, t ${pxR1.t.toLocaleString("vi-VN")})` : ""}\nChỉ hiển thị — không đổi danh mục.`;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded border px-1 text-[10px] font-bold leading-[14px] ${TONE[t.tone]}`} title={title} aria-label={title} data-testid={testId} data-phase={p.phase}>
      {t.short}
    </span>
  );
}
