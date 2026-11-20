// BỘ NÃO CHU KỲ & THỜI ĐIỂM — CT1 (20/11/2026, docs/elite-cycle-timing-brain 02 mục 3). Mô hình hiển thị chung cho mọi khối thời điểm
// của Elite: mỗi vùng một danh tính, làn, nhãn phiên, cặp W ↔ TO. Chỉ đọc nguồn đã có (Timeline Gateway + TO-v1), KHÔNG tính số tài
// chính mới, không đổi đối tượng nguồn. Kèm so khớp hai đường Timeline (Project A ↔ Gateway) cho báo cáo đối chiếu. Hàm thuần.
import type { LaneRow } from "../elite10/buyZoneLane";
import { dualLaneRows, laneOf, pairDividendLanes, type Lane } from "./lanes";
import { normSessions, sessionText, type NormSessions } from "./sessions";

export interface TimingEvent { key: string; ticker: string; lane: Lane; row: LaneRow; sessions: NormSessions; text: string; pairId: string | null }
export interface TimingBrainVM { rows: LaneRow[]; events: TimingEvent[]; byTicker: Map<string, TimingEvent[]>; byId: Map<string, TimingEvent>; lanes: Record<Lane, number> }

export const eventKey = (r: Pick<LaneRow, "ticker" | "kind" | "windowId" | "eventDate">) => `${r.ticker.toUpperCase()}|${laneOf(r)}|${r.windowId}|${r.eventDate}`;

export function buildTimingBrain(raw: readonly LaneRow[] | null | undefined, to: readonly LaneRow[] | null | undefined): TimingBrainVM {
  const rows = dualLaneRows(raw, to);
  const pairs = pairDividendLanes(rows);
  const lanes: Record<Lane, number> = { DIV_W: 0, DIV_TO: 0, EARN: 0 };
  const events: TimingEvent[] = []; const byTicker = new Map<string, TimingEvent[]>(); const byId = new Map<string, TimingEvent>();
  for (const r of rows) {
    const lane = laneOf(r); lanes[lane]++;
    const e: TimingEvent = { key: eventKey(r), ticker: r.ticker.toUpperCase(), lane, row: r, sessions: normSessions(r), text: sessionText(r), pairId: pairs.get(r.id) ?? null };
    events.push(e); byId.set(r.id, e);
    (byTicker.get(e.ticker) ?? byTicker.set(e.ticker, []).get(e.ticker)!).push(e);
  }
  return { rows, events, byTicker, byId, lanes };
}

export interface TimelineParity {
  aRows: number; bRows: number; onlyA: string[]; onlyB: string[];
  /** Khác trường (trừ `sessionsToEntry`) — kỳ vọng 0. */
  fieldDiffs: { id: string; field: string }[];
  /** `sessionsToEntry` khác: ngoại lệ đã biết (Project A âm = đã trôi qua, Gateway kẹp 0). */
  sessionDiffs: { id: string; a: number; b: number }[];
}
/** So khớp từng dòng theo `id` giữa hai đường Timeline (a = Project A, b = Gateway). */
export function timelineParity(a: readonly Record<string, unknown>[], b: readonly Record<string, unknown>[]): TimelineParity {
  const ma = new Map(a.map((r) => [String(r.id), r])), mb = new Map(b.map((r) => [String(r.id), r]));
  const out: TimelineParity = { aRows: a.length, bRows: b.length, onlyA: [], onlyB: [], fieldDiffs: [], sessionDiffs: [] };
  for (const id of ma.keys()) if (!mb.has(id)) out.onlyA.push(id);
  for (const id of mb.keys()) if (!ma.has(id)) out.onlyB.push(id);
  for (const [id, ra] of ma) {
    const rb = mb.get(id); if (!rb) continue;
    for (const f of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
      if (JSON.stringify(ra[f]) === JSON.stringify(rb[f])) continue;
      if (f === "sessionsToEntry") out.sessionDiffs.push({ id, a: Number(ra[f]), b: Number(rb[f]) }); else out.fieldDiffs.push({ id, field: f });
    }
  }
  return out;
}
