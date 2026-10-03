// Tích hợp "⏱ Timeline điểm mua" (tab Cổ tức) vào ELITE COMMAND RADAR — hàm thuần.
// QUY TẮC: chỉ mã ĐANG CÓ trên Radar (★ danh mục Radar đang hiển thị) mới nhận dữ liệu Timeline; mã có trong Timeline nhưng
// không có trên Radar bị bỏ qua hoàn toàn (không vẽ, không gợi ý thêm, không thông báo).
import type { TimelineRow } from './cotuc/buy-timeline';

/** Vòng trên chấm Radar: trong vùng mua · sắp tới (≤ SOON_SESSIONS phiên) · gần đạt (chưa qua kiểm định) · còn xa. */
export type RadarBuyRing = 'in' | 'soon' | 'near' | 'later';

export const SOON_SESSIONS = 5;
export const CHIP_SESSIONS = 10;
export const NOTIFY_SOON_SESSIONS = 3;

export interface RadarBuyInfo { row: TimelineRow; ring: RadarBuyRing }

const STATUS_RANK = { IN_WINDOW: 0, UPCOMING: 1, PASSED: 2 } as const;

export function ringOf(r: TimelineRow): RadarBuyRing {
  if (r.tier === 'NEAR') return 'near';
  if (r.status === 'IN_WINDOW') return 'in';
  return r.sessionsToEntry <= SOON_SESSIONS ? 'soon' : 'later';
}

/**
 * Vùng mua "đáng nói nhất" của từng mã TRÊN RADAR: bỏ dòng đã qua vùng mua; ưu tiên đang trong vùng → đạt kiểm định →
 * bắt đầu sớm nhất → cận dưới cao hơn.
 */
export function pickRadarBuyRows(rows: readonly TimelineRow[], radarTickers: readonly string[]): Map<string, RadarBuyInfo> {
  const onRadar = new Set(radarTickers.map((t) => t.toUpperCase()));
  const best = new Map<string, TimelineRow>();
  for (const r of rows) {
    const t = r.ticker.toUpperCase();
    if (!onRadar.has(t) || r.status === 'PASSED') continue;
    const cur = best.get(t);
    if (!cur || compareRows(r, cur) < 0) best.set(t, r);
  }
  return new Map([...best.entries()].map(([t, row]) => [t, { row, ring: ringOf(row) }]));
}

function compareRows(a: TimelineRow, b: TimelineRow): number {
  return STATUS_RANK[a.status] - STATUS_RANK[b.status]
    || (a.tier === b.tier ? 0 : a.tier === 'VALIDATED' ? -1 : 1)
    || a.entryFromDate.localeCompare(b.entryFromDate)
    || b.netExpectancyLcb - a.netExpectancyLcb;
}

/** Dải "ĐIỂM MUA 10 PHIÊN TỚI": mã trên Radar đang trong vùng hoặc bắt đầu trong ≤ maxSessions phiên. */
export function upcomingBuyChips(map: Map<string, RadarBuyInfo>, maxSessions = CHIP_SESSIONS): RadarBuyInfo[] {
  return [...map.values()]
    .filter((x) => x.row.status === 'IN_WINDOW' || x.row.sessionsToEntry <= maxSessions)
    // Theo thời gian như Timeline: đang trong vùng trước, rồi phiên bắt đầu gần nhất; cùng ngày thì bậc đạt kiểm định trước.
    .sort((a, b) => STATUS_RANK[a.row.status] - STATUS_RANK[b.row.status]
      || a.row.sessionsToEntry - b.row.sessionsToEntry
      || (a.row.tier === b.row.tier ? 0 : a.row.tier === 'VALIDATED' ? -1 : 1)
      || a.row.ticker.localeCompare(b.row.ticker));
}

export type BuyEventKind = 'enter_buy_window' | 'buy_window_soon';
export interface BuyEvent { kind: BuyEventKind; ticker: string; text: string; tone: 'up'; notifyKey: string }

const KIND_TEXT = { DIVIDEND: 'cổ tức', EARNINGS: 'KQKD' } as const;
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/**
 * Sự kiện Radar từ Timeline — CHỈ bậc "đạt kiểm định" (gần đạt không bắn sự kiện/thông báo để tránh nhiễu):
 *  - vào vùng mua; - còn ≤ NOTIFY_SOON_SESSIONS phiên tới vùng mua.
 * `notifyKey` gắn với ngày bắt đầu vùng mua -> mỗi vùng mua thông báo đúng một lần, không lặp mỗi ngày.
 */
export function buyWindowEvents(map: Map<string, RadarBuyInfo>): BuyEvent[] {
  const out: BuyEvent[] = [];
  for (const { row: r } of map.values()) {
    if (r.tier !== 'VALIDATED') continue;
    const what = `${KIND_TEXT[r.kind]} ${r.windowId.toUpperCase()} (${dm(r.entryFromDate)}→${dm(r.entryToDate)})`;
    if (r.status === 'IN_WINDOW') {
      out.push({ kind: 'enter_buy_window', ticker: r.ticker, tone: 'up', text: `${r.ticker} vào vùng mua ${what}`, notifyKey: `buy-in|${r.ticker}|${r.kind}|${r.entryFromDate}` });
    } else if (r.sessionsToEntry <= NOTIFY_SOON_SESSIONS) {
      out.push({ kind: 'buy_window_soon', ticker: r.ticker, tone: 'up', text: `${r.ticker} còn ${r.sessionsToEntry} phiên tới vùng mua ${what}`, notifyKey: `buy-soon|${r.ticker}|${r.kind}|${r.entryFromDate}` });
    }
  }
  return out.sort((a, b) => (a.kind === b.kind ? a.ticker.localeCompare(b.ticker) : a.kind === 'enter_buy_window' ? -1 : 1));
}
