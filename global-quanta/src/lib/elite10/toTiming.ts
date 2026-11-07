// Elite × TO (07/11/2026) — định thời điểm Elite 10 bằng "Săn cổ tức trước GDKHQ" (TO-v1, Gateway) thay cửa sổ cổ tức W1–W5 cũ.
// • Vùng cổ tức W1–W5 (neo GDKHQ ƯỚC TÍNH: lúc vào thường chưa có ngày GDKHQ, không có lợi thế ngoài mẫu) bị BỎ khỏi mọi bảng Elite;
//   thay bằng vùng TO neo NGÀY CÔNG BỐ: vào 2 phiên đầu sau công bố, bán phiên cuối còn quyền — bậc THĂM DÒ (chờ kiểm định tiến TO-r1).
// • Vùng mùa vụ KQKD giữ nguyên. Không đổi cách chọn mã / tỷ trọng Elite (đang đóng băng tới mốc đánh giá).
// • Cảnh báo GDKHQ: vị thế Elite sẽ qua GDKHQ trong kỳ nắm giữ 10 phiên -> nêu phiên cuối còn quyền + số lịch sử "giữ qua GDKHQ".
// Hàm thuần (có test).
import type { TimelineRow } from "../cotuc/buy-timeline";
import type { ToRadarRow, ToStats } from "../cotuc/to";
import type { LaneRow } from "./buyZoneLane";
import { ELITE_HOLD_SESSIONS, nextSessionAfter } from "./buyTimingCell";

export const TO_WINDOW_ID = "to";
export const isToRow = (r: { windowId: string }) => r.windowId === TO_WINDOW_ID;
const addDaysIso = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
/**
 * Phiên kế tiếp sau `d`. Lịch Gateway chỉ gồm các phiên SẮP TỚI: `d` trước phiên đầu của lịch (ngày đã qua) -> KHÔNG dùng lịch
 * (sẽ nhảy sai tới phiên tương lai) mà lấy ngày thường kế tiếp (thứ 2–6); ngoài lịch phía sau cũng vậy.
 */
function nextSession(d: string, sessions: readonly string[]): string {
  const s = sessions.length && d >= sessions[0] ? sessions.find((x) => x > d) : undefined; if (s) return s;
  let x = addDaysIso(d, 1); while ([0, 6].includes(new Date(`${x}T00:00:00Z`).getUTCDay())) x = addDaysIso(x, 1); return x;
}

/**
 * Đợt TO đang diễn ra -> dòng vùng (cùng hợp đồng Timeline, bậc THĂM DÒ). Chỉ đợt ĐỦ ĐIỀU KIỆN TO-r1 (lợi suất ≥ 5%, GTGD ≥ 1 tỷ,
 * không trần lúc vào); đợt khác không phải vùng vào (vẫn dùng cho cảnh báo GDKHQ).
 */
export function toLaneRows(rows: readonly ToRadarRow[], today: string, sessions: readonly string[]): LaneRow[] {
  const out: LaneRow[] = [];
  for (const r of rows) {
    if (!r.qualifies) continue;
    const from = r.entryDate ?? r.buyDate, to = nextSession(from, sessions), exit = r.lastCumDate ?? addDaysIso(r.ex, -1);
    const status = today < from ? "UPCOMING" : today <= to ? "IN_WINDOW" : "PASSED";
    const e = r.expected;
    out.push({
      id: `${r.t}:DIV:to:${r.ex}`, ticker: r.t, sector: r.sector, kind: "DIVIDEND", tier: "EXPLORATORY", status,
      eventLabel: "GDKHQ", eventDate: r.ex, eventDateBasis: "ANNOUNCED", windowId: TO_WINDOW_ID, windowLabel: "TO · Săn cổ tức (THĂM DÒ)",
      entryFrom: 0, entryTo: 1, exitOffset: 0, entryFromDate: from, entryToDate: to, exitDate: exit,
      sessionsToEntry: status === "UPCOMING" ? sessions.filter((d) => d > today && d <= from).length : 0,
      nEvents: e?.n ?? 0, winRate: e?.hit ?? 0, probability: null, netExpectancy: e?.mean ?? 0, netExpectancyLcb: e?.ci95?.[0] ?? e?.mean ?? 0, fdrQValue: 1, decisionLevel: null,
      missing: ["THĂM DÒ — chờ kiểm định tiến TO-r1", ...(r.t2Ok ? [] : ["không kịp T+2 nếu vào phiên sớm nhất"]), ...(r.weakSector ? ["ngành có kết quả lịch sử âm"] : [])],
    });
  }
  return out;
}

/** Bỏ vùng cổ tức W1–W5 cũ, thêm vùng TO; giữ vùng mùa vụ KQKD. */
export function withToRows<T extends { kind: string }>(rows: readonly T[], to: readonly LaneRow[]): T[] {
  return [...rows.filter((r) => r.kind !== "DIVIDEND"), ...(to as unknown as T[])];
}

/** Tooltip của vùng TO (không có q-value: chưa kiểm định — dùng số tham chiếu lịch sử của nhóm lợi suất). */
export function toZoneText(r: Pick<TimelineRow, "entryFromDate" | "entryToDate" | "exitDate" | "eventDate" | "nEvents" | "winRate" | "netExpectancy" | "netExpectancyLcb" | "missing">): string {
  const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const pc = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1).replace(".", ",")}%`;
  return `Săn cổ tức TO-r1 (THĂM DÒ): vào ${dm(r.entryFromDate)}→${dm(r.entryToDate)} (2 phiên đầu sau công bố), bán phiên cuối còn quyền ${dm(r.exitDate)}, GDKHQ ${dm(r.eventDate)}`
    + ` · nhóm lợi suất trong quá khứ: vượt VN-Index ${pc(r.netExpectancy)}/lệnh (cận dưới 95% ${pc(r.netExpectancyLcb)}), thắng ${Math.round(r.winRate * 100)}% / ${r.nEvents} lệnh`
    + `${r.missing.length ? ` · ${r.missing.join("; ")}` : ""}`;
}

export interface ExGuard { ticker: string; ex: string; lastCum: string; cash: number; yieldNow: number | null; bucket: ToRadarRow["bucket"]; post: ToStats | null; strong: boolean }
/**
 * Cảnh báo GDKHQ cho vị thế Elite (EX-r1, MÔ TẢ): GDKHQ cổ tức tiền đã công bố rơi vào kỳ nắm giữ (phiên vào theo quy tắc Elite … +10 phiên).
 * strong = nhóm lợi suất ≥ 5% (lịch sử giữ qua GDKHQ 5 phiên ≈ −2,9% vượt VN-Index, đã gồm cổ tức sau thuế).
 */
export function exGuards(tickers: readonly string[], to: readonly ToRadarRow[], decisionDate: string, sessions: readonly string[], postEx: Record<string, ToStats> | null | undefined, hold = ELITE_HOLD_SESSIONS): Map<string, ExGuard> {
  const entry = nextSessionAfter(decisionDate, sessions); const out = new Map<string, ExGuard>();
  if (!entry) return out;
  const i = sessions.indexOf(entry); const end = sessions[Math.min(sessions.length - 1, i + hold)] ?? entry;
  const want = new Set(tickers.map((t) => t.toUpperCase()));
  for (const r of [...to].sort((a, b) => a.ex.localeCompare(b.ex))) {
    if (!want.has(r.t) || out.has(r.t) || !(r.ex > entry && r.ex <= end)) continue;
    out.set(r.t, { ticker: r.t, ex: r.ex, lastCum: r.lastCumDate ?? addDaysIso(r.ex, -1), cash: r.cash, yieldNow: r.yieldNow ?? r.yieldPre, bucket: r.bucket, post: postEx?.[r.bucket] ?? null, strong: r.bucket === "≥5%" });
  }
  return out;
}
