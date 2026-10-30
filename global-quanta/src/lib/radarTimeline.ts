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

// ---------------------------------------------------------------------------
// Tiêu chí 6 của Radar "Cổ tức · điểm mua" (phiên bản tiêu chí 2)
// ---------------------------------------------------------------------------
export const RADAR_CRITERIA_VERSION = 2;
export const CRITERION_SESSIONS = 10;

export interface DecisionLite { ticker: string; level: 'FAVORABLE' | 'WATCH' | 'AVOID'; combinedProbability: number }

/**
 * Đạt khi: có vùng mua ĐẠT KIỂM ĐỊNH đang mở hoặc bắt đầu trong ≤ CRITERION_SESSIONS phiên, HOẶC DecisionBar "Thuận lợi".
 * "Gần đạt" không tính — chỉ ghi lý do. Chỉ xét mã trên Radar (`radarTickers`).
 */
export function buyCriterion(
  rows: readonly TimelineRow[], decisions: readonly DecisionLite[], radarTickers: readonly string[],
): { pass: Map<string, string>; fail: Map<string, string> } {
  const onRadar = new Set(radarTickers.map((t) => t.toUpperCase()));
  const pass = new Map<string, string>();
  const fail = new Map<string, string>();
  const byTicker = new Map<string, TimelineRow[]>();
  for (const r of rows) {
    const t = r.ticker.toUpperCase();
    if (!onRadar.has(t) || r.status === 'PASSED') continue;
    byTicker.set(t, [...(byTicker.get(t) ?? []), r]);
  }
  const fav = new Map(decisions.filter((d) => d.level === 'FAVORABLE' && onRadar.has(d.ticker.toUpperCase())).map((d) => [d.ticker.toUpperCase(), d]));
  for (const t of onRadar) {
    const list = (byTicker.get(t) ?? []).slice().sort((a, b) => compareRows(a, b));
    const ok = list.find((r) => r.tier === 'VALIDATED' && (r.status === 'IN_WINDOW' || r.sessionsToEntry <= CRITERION_SESSIONS));
    if (ok) {
      pass.set(t, `Vùng mua ${KIND_TEXT[ok.kind]} ${ok.windowId.toUpperCase()} ${dm(ok.entryFromDate)}→${dm(ok.entryToDate)}${ok.status === 'IN_WINDOW' ? ' (đang mở)' : ` (còn ${ok.sessionsToEntry} phiên)`} · đạt kiểm định, thắng ${Math.round(ok.winRate * 100)}%`);
      continue;
    }
    const d = fav.get(t);
    if (d) { pass.set(t, `DecisionBar "Thuận lợi" · xác suất tổng hợp ${Math.round(d.combinedProbability * 100)}%`); continue; }
    const far = list.find((r) => r.tier === 'VALIDATED');
    const near = list.find((r) => r.tier === 'NEAR');
    if (far) fail.set(t, `Vùng mua ${KIND_TEXT[far.kind]} đạt kiểm định nhưng còn ${far.sessionsToEntry} phiên (> ${CRITERION_SESSIONS})`);
    else if (near) fail.set(t, `Gần đạt (${KIND_TEXT[near.kind]} ${near.windowId.toUpperCase()} ${dm(near.entryFromDate)}→${dm(near.entryToDate)}) — còn thiếu: ${near.missing.join('; ')}`);
  }
  return { pass, fail };
}
