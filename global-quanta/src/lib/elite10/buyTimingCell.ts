// B2 (25/10/2026) — cột "⏱ Điểm mua" của Bảng quyết định Elite 10: MỖI mã trong danh mục luôn có một thời điểm mua, kèm nguồn rõ ràng.
// Ưu tiên vùng mua mùa vụ ĐẠT KIỂM ĐỊNH của Timeline (cổ tức / KQKD — Project A) nằm trong kỳ nắm giữ 10 phiên; ngược lại dùng QUY TẮC
// của danh mục Elite (vào lệnh giá mở cửa phiên kế tiếp sau ngày dựng). Không đổi cách chọn mã / tỷ trọng; chỉ hiển thị. Hàm thuần (có test).
import type { TimelineRow } from '../cotuc/buy-timeline';
import { pickRadarBuyRows } from '../radarTimeline';

export const ELITE_HOLD_SESSIONS = 10;
export const SOON_SESSIONS = 5;

export type BuyCellKind = 'in' | 'soon' | 'wait' | 'near' | 'rule';
export interface BuyCell {
  kind: BuyCellKind;
  /** Dòng chính (ngắn) và dòng phụ. */ text: string; sub: string;
  /** Ngày nên mua (bắt đầu vùng / phiên kế tiếp). */ date: string | null;
  tooltip: string; dashed: boolean; row: TimelineRow | null;
}

const dm = (iso: string | null | undefined) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : '—');
const KIND = { DIVIDEND: 'cổ tức', EARNINGS: 'KQKD' } as const;
const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1).replace('.', ',')}%`;

function stats(r: TimelineRow): string {
  return `${KIND[r.kind]} · ${r.windowLabel} · mua ${dm(r.entryFromDate)}→${dm(r.entryToDate)}, thoát ${dm(r.exitDate)} · thắng ${Math.round(r.winRate * 100)}% / ${r.nEvents} lần`
    + ` · kỳ vọng ròng ${pct(r.netExpectancy)} (cận dưới ${pct(r.netExpectancyLcb)}) · FDR q ${r.fdrQValue.toFixed(3).replace('.', ',')}`;
}

/** Phiên giao dịch đầu tiên SAU ngày dựng danh mục (lịch có ngày nghỉ của Gateway); thiếu lịch -> null. */
export function nextSessionAfter(date: string, sessions: readonly string[]): string | null {
  return sessions.find((s) => s > date) ?? null;
}

/**
 * Ô "⏱ Điểm mua" cho từng mã trong danh mục.
 * @param rows Timeline (đã tính lại theo hôm nay ở Gateway) hoặc null nếu không có dữ liệu.
 */
export function buyTimingCells(tickers: readonly string[], rows: readonly TimelineRow[] | null, decisionDate: string, sessions: readonly string[]): Map<string, BuyCell> {
  const entry = nextSessionAfter(decisionDate, sessions);
  const best = rows ? pickRadarBuyRows(rows, tickers) : new Map();
  const ruleText = entry ? `Mở cửa ${dm(entry)}` : 'Mở cửa phiên tới';
  const out = new Map<string, BuyCell>();
  for (const t of tickers) {
    const info = best.get(t.toUpperCase());
    const r: TimelineRow | null = info?.row ?? null;
    const ruleTip = `Quy tắc danh mục Elite 10: vào lệnh giá mở cửa phiên kế tiếp sau ngày dựng (${dm(decisionDate)}), nắm giữ ${ELITE_HOLD_SESSIONS} phiên — không phải điểm mua tối ưu đã kiểm định.`;
    if (!rows) { out.set(t, { kind: 'rule', text: ruleText, sub: 'quy tắc Elite · Timeline tạm không có', date: entry, tooltip: ruleTip, dashed: false, row: null }); continue; }
    if (r && r.tier === 'VALIDATED' && r.status === 'IN_WINDOW') {
      out.set(t, { kind: 'in', text: 'Mua ngay', sub: `trong vùng ${KIND[r.kind]} tới ${dm(r.entryToDate)}`, date: entry, tooltip: `Đang trong vùng mua ĐẠT KIỂM ĐỊNH — ${stats(r)}`, dashed: false, row: r });
      continue;
    }
    if (r && r.tier === 'VALIDATED' && r.sessionsToEntry <= ELITE_HOLD_SESSIONS) {
      out.set(t, { kind: r.sessionsToEntry <= SOON_SESSIONS ? 'soon' : 'wait', text: `Chờ ${dm(r.entryFromDate)}`, sub: `còn ${r.sessionsToEntry} phiên · vùng ${KIND[r.kind]} ${dm(r.entryFromDate)}→${dm(r.entryToDate)}`,
        date: r.entryFromDate, tooltip: `Vùng mua ĐẠT KIỂM ĐỊNH bắt đầu trong kỳ nắm giữ — ${stats(r)}`, dashed: false, row: r });
      continue;
    }
    if (r && r.tier === 'NEAR' && (r.status === 'IN_WINDOW' || r.sessionsToEntry <= ELITE_HOLD_SESSIONS)) {
      out.set(t, { kind: 'near', text: ruleText, sub: `gần đạt: vùng ${KIND[r.kind]} ${dm(r.entryFromDate)}→${dm(r.entryToDate)}`, date: entry,
        tooltip: `${ruleTip}\nVùng mùa vụ GẦN ĐẠT (chưa qua kiểm định) — còn thiếu: ${r.missing.join('; ') || '—'} — ${stats(r)}`, dashed: true, row: r });
      continue;
    }
    const far = r && r.status === 'UPCOMING' ? `vùng ${KIND[r.kind]} xa: ${dm(r.entryFromDate)} (${r.sessionsToEntry} phiên)` : 'chưa có vùng mùa vụ';
    out.set(t, { kind: 'rule', text: ruleText, sub: `quy tắc Elite · ${far}`, date: entry, tooltip: r ? `${ruleTip}\n${stats(r)}` : ruleTip, dashed: false, row: r });
  }
  return out;
}
