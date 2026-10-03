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
      marketCap: (u.avgValue20 ?? 0) >= 1e11 ? 'Large' : (u.avgValue20 ?? 0) >= 2e10 ? 'Mid' : 'Small',
      eps: 0, fscore: 0, grossMargin: 0, pros: [], cons: [], technicalTrend: 'Neutral', rsi: 0, revenueGrowthQtr: 0, institutionalHold: 0,
      exDividendDate: isoToVn(dates?.exDate), paymentDate: isoToVn(dates?.paymentDate), dividendAmount: last?.valuePerShare ?? 0,
      catalystScore: 5, newsSentiment: '', sectorWaveScore: 0, agmDate: isoToVn(dates?.agmDate), agmAgenda: '', insiderStatus: '',
      macroCatalyst: '', globalIndicator: '', globalTrend: '', isUniverseOnly: true,
    });
  }
  return out;
}
