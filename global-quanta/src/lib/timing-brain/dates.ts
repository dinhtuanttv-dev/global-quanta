// BỘ NÃO CHU KỲ & THỜI ĐIỂM — CT2 (20/11/2026, docs/elite-cycle-timing-brain 04 mục 4). Đối soát NGÀY SỰ KIỆN giữa các nguồn đã có trên
// màn hình (không gọi thêm API). Quyết định Q3 của chủ dự án — thứ tự ưu tiên ngày chính:
//   1 ngày ĐÃ CÔNG BỐ / XÁC NHẬN (bất kỳ nguồn nào) > 2 lịch công bố LC-v1 (dự kiến, kèm dải + hạn luật) > 3 Timeline > 4 nghiên cứu sự kiện.
// Mọi nguồn được giữ trong `claims`; lệch ngày -> cảnh báo. Không sửa ngày của nguồn nào. Hàm thuần.
export type DateSource = "ANNOUNCED" | "LC" | "TIMELINE" | "EVENT_STUDY";
export interface DateClaim { source: DateSource; date: string; basis: string | null; from: string }
export interface ReconciledDate { primary: DateClaim | null; claims: DateClaim[]; spreadDays: number; agree: boolean; band: [string, string] | null }

export const DATE_SOURCE_VI: Record<DateSource, string> = { ANNOUNCED: "đã công bố", LC: "lịch công bố LC-v1", TIMELINE: "Timeline", EVENT_STUDY: "nghiên cứu sự kiện" };
const RANK: Record<DateSource, number> = { ANNOUNCED: 0, LC: 1, TIMELINE: 2, EVENT_STUDY: 3 };
const KNOWN = new Set(["CONFIRMED", "ANNOUNCED", "REPORTED"]);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Một lời khai ngày từ nguồn `source`; ngày có cơ sở "đã công bố / xác nhận" được nâng lên bậc ANNOUNCED. */
export function claim(source: Exclude<DateSource, "ANNOUNCED">, date: string | null | undefined, basis: string | null | undefined, from = DATE_SOURCE_VI[source]): DateClaim | null {
  if (!date || !ISO.test(date)) return null;
  return { source: basis && KNOWN.has(basis) ? "ANNOUNCED" : source, date, basis: basis ?? null, from };
}

const dayNo = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

export function reconcileDates(claims: readonly (DateClaim | null | undefined)[], band: [string, string] | null = null): ReconciledDate {
  const cs = claims.filter((c): c is DateClaim => c != null).sort((a, b) => RANK[a.source] - RANK[b.source]);
  const days = cs.map((c) => dayNo(c.date));
  const spreadDays = days.length ? Math.max(...days) - Math.min(...days) : 0;
  return { primary: cs[0] ?? null, claims: cs, spreadDays, agree: spreadDays === 0, band };
}

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
/** "⚠ Ngày lệch 2 ngày giữa các nguồn: Timeline 01/02 · nghiên cứu sự kiện 30/01" — hoặc null khi các nguồn khớp / chỉ có một nguồn. */
export function dateWarning(r: ReconciledDate): string | null {
  if (r.agree || r.claims.length < 2) return null;
  return `Ngày lệch ${r.spreadDays} ngày giữa các nguồn: ${r.claims.map((c) => `${c.from} ${dm(c.date)}`).join(" · ")}`;
}
