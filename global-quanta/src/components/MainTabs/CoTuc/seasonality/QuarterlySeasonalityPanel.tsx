import type { CyclePathsV3, EarningsCycleStatsV3, Quarter } from '../../../../lib/cotuc/timing-types';
import { CycleTimeline } from '../CycleTimeline';

/**
 * Lưới 2×2 bốn quý (port QuarterlySeasonalityPanel của gói): mỗi ô là CycleTimeline nguyên bản vẽ CAR quanh ngày công bố
 * (offset 0 = phiên đầu tiên sau ngày công bố thực). Thuần hiển thị — EarningsSeasonalityTab lo phần hook. Trình bày theo
 * chuẩn Siêu Quét (viền trên theo màu quý: Q1 cyan · Q2 emerald · Q3 amber · Q4 violet).
 */
const QUARTER_COLOR: Record<Quarter, string> = { 1: '#22d3ee', 2: '#34d399', 3: '#fbbf24', 4: '#a78bfa' };

export interface QuarterCardData {
  quarter: Quarter;
  stats: EarningsCycleStatsV3 | null;
  paths: CyclePathsV3 | null;
  /** Số ngày giao dịch tới ngày công bố dự kiến của quý này (âm = đã qua). null nếu chưa biết. */
  todayOffset: number | null;
  loading?: boolean;
  errorMessage?: string | null;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function QuarterCard({ data }: { data: QuarterCardData }) {
  const { quarter, stats, paths, todayOffset, loading, errorMessage } = data;
  const rp = stats?.reactionProbability ?? null;
  return (
    <div data-testid={`quarter-card-${quarter}`} className="rounded-lg p-2.5 bg-white/[0.02] border border-white/5 [&_p]:!text-[10.5px] [&_label]:!text-[10.5px]" style={{ borderTop: `2px solid ${QUARTER_COLOR[quarter]}` }}>
      <h4 className="text-[11.5px] font-semibold mb-1" style={{ color: QUARTER_COLOR[quarter] }}>
        Quý {quarter}{' '}
        <span data-testid={`quarter-prob-${quarter}`} className="font-normal text-[10px] text-slate-400">
          {rp ? `· P(phản ứng dương) ${pct(rp.mean)} (CI${Math.round(rp.level * 100)}: ${pct(rp.ci[0])}–${pct(rp.ci[1])})` : '· chưa đủ bằng chứng thống kê'}
        </span>
      </h4>
      {loading ? (
        <p role="status" data-testid={`quarter-loading-${quarter}`} className="text-[10.5px] text-slate-500">Đang tải…</p>
      ) : errorMessage ? (
        <p role="alert" data-testid={`quarter-error-${quarter}`} className="text-[10.5px] text-rose-300">Không tải được: {errorMessage}</p>
      ) : (
        <CycleTimeline stats={stats} paths={paths} todayOffset={todayOffset} eventLabel="công bố" hideWindowTable />
      )}
    </div>
  );
}

export function QuarterlySeasonalityPanel({ cards, className }: { cards: QuarterCardData[]; className?: string }) {
  const ordered = [...cards].sort((a, b) => a.quarter - b.quarter);
  return (
    <section className={className} aria-label="Timeline CAR quanh ngày công bố KQKD, theo từng quý">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
        {ordered.map((c) => <QuarterCard key={c.quarter} data={c} />)}
      </div>
    </section>
  );
}

export default QuarterlySeasonalityPanel;
