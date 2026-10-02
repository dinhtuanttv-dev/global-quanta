import type { SeasonalOpportunity } from '../../../../lib/cotuc/timing-types';
import type { WatchItem } from '../../../../lib/cotuc/seasonal-bulk';
import { useSeasonalOpportunities } from '../../../../hooks/useCotucSeasonalBulk';
import { CARD } from './EarningsSeasonalityTab';

/**
 * Bảng "quét xác suất chu kỳ KQKD" toàn danh mục (port SeasonalOpportunityList của gói): xếp theo CẬN DƯỚI khoảng tin cậy,
 * không theo trung bình. Bổ sung danh sách ứng viên gần đạt (ghi rõ còn thiếu gì) để danh sách trống không bị hiểu là lỗi.
 */
const pct = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%`;

export function SeasonalOpportunityList({ items, watchlist = [], onSelectTicker, className }: {
  items: SeasonalOpportunity[]; watchlist?: WatchItem[]; onSelectTicker?: (t: string) => void; className?: string;
}) {
  const tickerBtn = (t: string) => (
    <button type="button" onClick={() => onSelectTicker?.(t)} className="font-mono font-semibold text-cyan-200 hover:text-cyan-100 hover:underline">{t}</button>
  );
  return (
    <div className={className}>
      {items.length === 0 ? (
        <p data-testid="opportunity-empty" className="text-[10.5px] text-slate-400">
          Chưa có cơ hội nào đủ bằng chứng thống kê. Đây là kết quả hợp lệ, không phải lỗi: tách theo quý khiến mỗi mã chỉ còn vài kỳ lịch sử.
        </p>
      ) : (
        <table data-testid="opportunity-table" className="w-full text-[10.5px]">
          <caption className="text-left text-[10px] font-semibold tracking-wider text-amber-300 pb-1">ĐÃ ĐẠT KIỂM ĐỊNH · xếp theo cận dưới khoảng tin cậy</caption>
          <thead>
            <tr className="text-slate-500 text-[9.5px]">
              <th className="text-left font-normal">Mã</th><th className="text-left font-normal">Quý</th>
              <th className="text-right font-normal">Cận dưới</th><th className="text-right font-normal">Trung bình</th>
              <th className="text-right font-normal">Kỳ vọng ròng</th><th className="text-right font-normal">Số lần</th><th className="text-left font-normal pl-2">Cửa sổ mua</th>
            </tr>
          </thead>
          <tbody>
            {items.map((o) => (
              <tr key={`${o.ticker}-${o.quarter}`} data-testid="opportunity-row" className="border-t border-white/5">
                <td className="py-1">{tickerBtn(o.ticker)}</td>
                <td className="font-mono text-slate-300">Q{o.quarter}</td>
                <td className="text-right font-mono tabular-nums text-amber-300 font-semibold">{Math.round(o.reactionProbabilityLowerBound * 100)}%</td>
                <td className="text-right font-mono tabular-nums text-slate-300">{Math.round(o.reactionProbabilityMean * 100)}%</td>
                <td className="text-right font-mono tabular-nums text-emerald-400">{pct(o.expectedNetReturn)}</td>
                <td className="text-right font-mono tabular-nums text-slate-300">{o.nEvents}</td>
                <td className="font-mono tabular-nums text-slate-400 pl-2">[{o.window.entryFrom}, {o.window.entryTo}] → {o.window.exitOffset}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {watchlist.length > 0 && (
        <table data-testid="watchlist-table" className="w-full text-[10.5px] mt-2">
          <caption className="text-left text-[10px] font-semibold tracking-wider text-violet-300 pb-1">ỨNG VIÊN THEO DÕI · chưa đạt, còn thiếu điều kiện</caption>
          <tbody>
            {watchlist.map((w) => (
              <tr key={`${w.ticker}-${w.quarter}-${w.windowId}`} className="border-t border-white/5">
                <td className="py-1 w-12">{tickerBtn(w.ticker)}</td>
                <td className="font-mono text-slate-300 w-8">Q{w.quarter}</td>
                <td className="text-slate-300">{w.label}</td>
                <td className="text-right font-mono tabular-nums" style={{ color: w.netExpectancy >= 0 ? '#34d399' : '#fb7185' }}>{pct(w.netExpectancy)}</td>
                <td className="text-right font-mono tabular-nums text-slate-400">thắng {Math.round(w.winRate * 100)}%</td>
                <td className="text-right font-mono tabular-nums text-slate-400">q {w.fdrQValue.toFixed(2)}</td>
                <td className="text-right text-[9.5px] text-violet-200 pl-2">{w.missing.join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Khối đã nối dữ liệu (route /api/cotuc/seasonal-opportunities) cho sub-tab Thời Điểm Tối Ưu (v3). */
export function SeasonalOpportunitiesCard({ onSelectTicker }: { onSelectTicker?: (t: string) => void }) {
  const { data, loading, error } = useSeasonalOpportunities();
  return (
    <section className="tw-scope rounded-xl p-4" style={CARD} aria-label="Cơ hội mùa vụ KQKD toàn danh mục">
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-cyan-400">🗓️ Cơ hội mùa vụ KQKD · toàn danh mục</h3>
        {data && <span className="text-[9.5px] text-slate-500">{data.tickers} mã · cập nhật {data.asOf ? new Date(data.asOf).toLocaleDateString('vi-VN') : '—'}</span>}
      </div>
      {loading && <p role="status" className="text-[10.5px] text-slate-500">Đang tải…</p>}
      {error && <p role="alert" className="text-[10.5px] text-rose-300">Không tải được: {error}</p>}
      {!loading && !error && !data && <p className="text-[10.5px] text-slate-500">Chưa có dữ liệu (route hoặc cron mùa vụ chưa sẵn sàng).</p>}
      {data && <SeasonalOpportunityList items={data.opportunities} watchlist={data.watchlist} onSelectTicker={onSelectTicker} />}
    </section>
  );
}

export default SeasonalOpportunityList;
