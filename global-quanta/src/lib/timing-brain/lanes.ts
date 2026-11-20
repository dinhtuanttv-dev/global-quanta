// BỘ NÃO CHU KỲ & THỜI ĐIỂM — CT1 (20/11/2026, docs/elite-cycle-timing-brain 02–04). Làn của một vùng thời điểm, đọc từ trường đã có.
// Quyết định Q1 của chủ dự án (20/11/2026): phía Elite hiện CẢ HAI làn cổ tức — cửa sổ lịch sử W1–W5 (Timeline) và Săn cổ tức TO-v1 —
// tách làn, có nhãn. Làn W chỉ là MÔ TẢ: từ 07/11/2026 Elite không dùng nó để chọn mã (lib/elite10/toTiming.ts). Hàm thuần.
import type { LaneRow } from "../elite10/buyZoneLane";
import { isToRow } from "../elite10/toTiming";

export type Lane = "DIV_W" | "DIV_TO" | "EARN";

export const laneOf = (r: { kind: string; windowId: string }): Lane => (isToRow(r) ? "DIV_TO" : r.kind === "DIVIDEND" ? "DIV_W" : "EARN");

export const LANE_VI: Record<Lane, string> = {
  DIV_W: "Cổ tức · cửa sổ lịch sử W1–W5",
  DIV_TO: "Cổ tức · Săn cổ tức TO-v1",
  EARN: "Mùa vụ KQKD",
};
/** Nhãn bằng chứng cố định của làn (EARN: theo bậc của engine). */
export const LANE_BADGE: Record<Lane, string | null> = { DIV_W: "MÔ TẢ", DIV_TO: "THĂM DÒ", EARN: null };

export const W_LANE_NOTE =
  "Cửa sổ cổ tức W1–W5 neo GDKHQ ước tính theo chu kỳ (lúc vào thường chưa có ngày chính thức) và không có lợi thế ngoài mẫu — "
  + "từ 07/11/2026 Elite không dùng làn này để chọn mã; hiện ở đây chỉ để đối chiếu lịch với tab Cổ tức.";
export const TO_LANE_NOTE = "Săn cổ tức TO-v1 neo ngày đã công bố: vào 2 phiên đầu sau công bố, bán phiên cuối còn quyền — THĂM DÒ, chờ kiểm định tiến TO-r1.";

/**
 * Dòng của bảng thời điểm hai làn: mọi dòng Timeline gốc (gồm cổ tức W1–W5 mà Elite đã bỏ) + dòng TO. Giữ NGUYÊN đối tượng nguồn
 * (không sao chép, không sửa trường); bỏ trùng theo `id` (dòng gốc thắng).
 */
export function dualLaneRows(raw: readonly LaneRow[] | null | undefined, to: readonly LaneRow[] | null | undefined): LaneRow[] {
  const seen = new Set<string>(); const out: LaneRow[] = [];
  for (const r of [...(raw ?? []), ...(to ?? [])]) { if (seen.has(r.id)) continue; seen.add(r.id); out.push(r); }
  return out;
}

const dayNo = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
/** Ngưỡng coi hai làn cổ tức cùng một đợt: GDKHQ ước tính (W) và GDKHQ đã công bố (TO) cách nhau ≤ 14 ngày lịch. */
export const SAME_EVENT_DAYS = 14;

/** Cặp W ↔ TO cùng một đợt cổ tức của cùng mã: id W -> id TO (và ngược lại). Mỗi dòng ghép tối đa một dòng, gần ngày nhất trước. */
export function pairDividendLanes(rows: readonly LaneRow[]): Map<string, string> {
  const w = rows.filter((r) => laneOf(r) === "DIV_W"), to = rows.filter((r) => laneOf(r) === "DIV_TO");
  const cand: { a: LaneRow; b: LaneRow; gap: number }[] = [];
  for (const a of w) for (const b of to) {
    if (a.ticker.toUpperCase() !== b.ticker.toUpperCase()) continue;
    const gap = Math.abs(dayNo(a.eventDate) - dayNo(b.eventDate));
    if (gap <= SAME_EVENT_DAYS) cand.push({ a, b, gap });
  }
  cand.sort((x, y) => x.gap - y.gap || x.a.id.localeCompare(y.a.id));
  const out = new Map<string, string>();
  for (const { a, b } of cand) { if (out.has(a.id) || out.has(b.id)) continue; out.set(a.id, b.id); out.set(b.id, a.id); }
  return out;
}
