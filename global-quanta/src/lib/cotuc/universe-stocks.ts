// Danh mục tab Cổ tức = danh mục Siêu Quét AI (~300 mã, Market Gateway /api/market/scanner/universe).
// Hàm thuần: ghép danh mục + sự kiện quyền THẬT (/api/cotuc/events, VNDirect) + giá khớp TRỰC TIẾP (SSI stream) thành
// DividendStock cho bảng. Chỉ điền giá trị có dữ liệu thật; trường chưa có (P/E, ROE…) để 0 và đánh dấu isUniverseOnly
// để Modal/bảng hiện "chưa có" thay vì một con số giả.
import type { DividendStock } from '../quant-cotuc';
import type { DividendLifecycleEvent } from '../../hooks/useDividendEvents';

export interface UniverseRow { ticker: string; name?: string | null; industry?: string | null; sector?: string | null; exchange?: string | null; avgValue20?: number | null }

const isoToVn = (iso: string | null | undefined) =>
  iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';

/** Cổ tức tiền mặt (đ/CP) có GDKHQ trong 365 ngày gần nhất tính tới `today` (ISO). null nếu không có đợt nào. */
export function trailingCashDividend(events: DividendLifecycleEvent[] | undefined, today: string): number | null {
  if (!events?.length) return null;
  const from = new Date(Date.parse(today) - 365 * 86_400_000).toISOString().slice(0, 10);
  const seen = new Set<string>();
  let sum = 0;
  for (const e of events) {
    if (e.eventType !== 'CASH' || !e.exrightDate || !(e.valuePerShare && e.valuePerShare > 0)) continue;
    const d = e.exrightDate.slice(0, 10);
    if (d <= from || d > today) continue;
    const k = `${d}:${e.valuePerShare}`;
    if (seen.has(k)) continue;
    seen.add(k);
    sum += e.valuePerShare;
  }
  return sum > 0 ? sum : null;
}

/**
 * Cổ tức ĐẶC BIỆT: tổng tiền mặt 12 tháng gần nhất ≥ 2× trung vị tổng hằng năm của (tối đa) 4 năm trước đó.
 * Cần ít nhất 2 năm lịch sử có chi tiền; không đủ -> false (không gắn cờ khi không có cơ sở so sánh).
 */
export function isSpecialDividend(events: DividendLifecycleEvent[] | undefined, today: string): boolean {
  const ttm = trailingCashDividend(events, today);
  if (!ttm || !events?.length) return false;
  const t = Date.parse(today);
  const yearly: number[] = [];
  for (let k = 1; k <= 4; k++) {
    const to = new Date(t - k * 365 * 86_400_000).toISOString().slice(0, 10);
    const v = trailingCashDividend(events, to);
    if (v) yearly.push(v);
  }
  if (yearly.length < 2) return false;
  const sorted = [...yearly].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return median > 0 && ttm >= 2 * median;
}

/** Tỷ suất cổ tức (%) = cổ tức tiền 12 tháng / giá hiện tại. null nếu thiếu một trong hai. */
export function trailingYieldPct(ttm: number | null, price: number | null | undefined): number | null {
  return ttm && price && price > 0 ? Math.round((ttm / price) * 1000) / 10 : null;
}

/** Đợt cổ tức tiền gần nhất (để hiện "x đ/CP"). */
function latestCash(events: DividendLifecycleEvent[] | undefined): DividendLifecycleEvent | null {
  return (events ?? []).filter((e) => e.eventType === 'CASH' && e.exrightDate && e.valuePerShare)
    .sort((a, b) => (b.exrightDate ?? '').localeCompare(a.exrightDate ?? ''))[0] ?? null;
}

export function buildUniverseStocks(p: {
  universe: UniverseRow[];
  exclude: Set<string>;
  lifecycleEventsMap: Record<string, DividendLifecycleEvent[]>;
  realDatesMap: Record<string, { exDate: string | null; agmDate: string | null; paymentDate: string | null }>;
  prices: Record<string, number | null | undefined>;
  today: string;
}): DividendStock[] {
  const out: DividendStock[] = [];
  for (const u of p.universe) {
    const t = u.ticker?.toUpperCase();
    if (!t || p.exclude.has(t)) continue;
    const ev = p.lifecycleEventsMap[t];
    const dates = p.realDatesMap[t];
    const price = p.prices[t] ?? 0;
    const ttm = trailingCashDividend(ev, p.today);
    const last = latestCash(ev);
    out.push({
      ticker: t, name: u.name || t, sector: u.industry || u.sector || 'Khác', price: price || 0,
      pe: 0, roe: 0, dividendYield: trailingYieldPct(ttm, price) ?? 0, payoutRatio: 0, debtEquity: 0, growth: 0,
      fscore: 0, pros: [], cons: [], rsi: 0,
      exDividendDate: isoToVn(dates?.exDate), paymentDate: isoToVn(dates?.paymentDate), dividendAmount: last?.valuePerShare ?? 0,
      catalystScore: null, agmDate: isoToVn(dates?.agmDate), isUniverseOnly: true,
    });
  }
  return out;
}

/**
 * F3 (06/11/2026) — cảnh báo tỷ suất cổ tức 12 tháng BẤT THƯỜNG (chỉ cảnh báo, KHÔNG đổi số hay kết quả bộ lọc).
 * Lý do được nêu rõ từ dữ liệu sự kiện: (1) tỷ suất ≥ 15%; (2) cổ tức 12 tháng ≥ 2 lần trung vị 4 năm trước; (3) cửa sổ 12 tháng gộp
 * đợt của ≥ 2 năm tài chính (VD đợt cuối năm trước trả muộn + đợt 1 năm nay); (4) có chia cổ phiếu / thưởng SAU một đợt tiền mặt trong
 * cửa sổ (cổ tức cũ tính trên số cổ phiếu trước khi chia). Trả null khi không có dấu hiệu.
 */
export interface YieldAnomaly { reasons: string[]; fiscalYears: number[]; payments: number }
const FY_RE = /(?:đợt\s*\d+\s*\/\s*|năm\s*)(20\d{2})/i;
export function yieldAnomaly(events: DividendLifecycleEvent[] | undefined, yieldPct: number | null | undefined, today: string): YieldAnomaly | null {
  if (!events?.length || yieldPct == null) return null;
  const from = new Date(Date.parse(today) - 365 * 86_400_000).toISOString().slice(0, 10);
  const seen = new Set<string>();
  const cash: DividendLifecycleEvent[] = [];
  for (const e of events) {
    if (e.eventType !== 'CASH' || !e.exrightDate || !(e.valuePerShare && e.valuePerShare > 0)) continue;
    const d = e.exrightDate.slice(0, 10);
    if (d <= from || d > today) continue;
    const k = `${d}:${e.valuePerShare}`;
    if (seen.has(k)) continue;
    seen.add(k);
    cash.push(e);
  }
  const reasons: string[] = [];
  if (yieldPct >= 15) reasons.push(`tỷ suất ${yieldPct.toLocaleString('vi-VN')}% ≥ 15%`);
  if (isSpecialDividend(events, today)) reasons.push('cổ tức 12 tháng ≥ 2 lần trung vị 4 năm trước');
  const fy = [...new Set(cash.map((e) => Number(FY_RE.exec(e.eventTitleVi ?? '')?.[1])).filter((y) => Number.isFinite(y) && y > 2000))].sort();
  if (fy.length >= 2) reasons.push(`gộp cổ tức của ${fy.length} năm tài chính (${fy.join(', ')}) trong 12 tháng`);
  const firstCash = cash.map((e) => e.exrightDate!.slice(0, 10)).sort()[0];
  const split = firstCash ? events.some((e) => (e.eventType === 'STOCK_DIVIDEND' || e.eventType === 'BONUS_ISSUE') && e.exrightDate && e.exrightDate.slice(0, 10) > firstCash && e.exrightDate.slice(0, 10) <= today) : false;
  if (split) reasons.push('có chia cổ phiếu / thưởng sau một đợt tiền mặt — cổ tức cũ tính trên số cổ phiếu trước khi chia');
  return reasons.length ? { reasons, fiscalYears: fy, payments: cash.length } : null;
}
