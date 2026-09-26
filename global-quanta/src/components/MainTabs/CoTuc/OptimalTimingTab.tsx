import { useMemo } from 'react';
import type { EarningsImpact, EarningsStance, Explanation, TimingRecommendation } from '../../../lib/quant-cotuc';
import { DEFAULT_CONFIG, WEEKEND_ONLY_CALENDAR, optimizeDividendTiming, systemClock } from '../../../lib/quant-cotuc';
import type { Deps, HolidayCalendar, Sourced } from '../../../lib/quant-cotuc';
import type { EarningsSignal, ISODate } from '../../../lib/cotuc/timing-types';
import { useCyclePaths } from '../../../hooks/useCyclePaths';
import { useCycleStatsV3 } from '../../../hooks/useCycleStatsV3';
import { CycleTimeline } from './CycleTimeline';
import { markerOffset } from '../../../lib/cotuc/cycle-timeline.utils';

const CONFIDENCE_TEXT: Record<NonNullable<TimingRecommendation['confidence']>, string> = {
  HIGH: 'Cao',
  MEDIUM: 'Trung bình',
  LOW: 'Thấp',
};

const STANCE_TEXT: Record<EarningsStance, string> = {
  AVOID: 'Tránh mua sát ngày này',
  REDUCE_SIZE: 'Cân nhắc giảm khối lượng',
  NEUTRAL: 'Trung tính',
  FAVORABLE: 'Có thể thuận lợi (không phải khuyến nghị mua)',
  UNKNOWN: 'Chưa đủ dữ liệu',
};

function EffectDot({ effect }: { effect: Explanation['effect'] }) {
  const color = effect === 'POSITIVE' ? 'var(--ct-buy, #1e9e5a)' : effect === 'NEGATIVE' ? 'var(--ct-today, #d6336c)' : 'var(--ct-muted, #5d6b78)';
  const label = effect === 'POSITIVE' ? 'thuận lợi' : effect === 'NEGATIVE' ? 'bất lợi' : 'trung tính';
  return <span aria-hidden style={{ color, marginRight: 6 }} title={label}>{effect === 'POSITIVE' ? '▲' : effect === 'NEGATIVE' ? '▼' : '■'}</span>;
}

function EarningsCard({ impact }: { impact: EarningsImpact }) {
  if (!impact.expectedAnnounce) {
    return <p data-testid="earnings-card-empty" style={{ fontSize: 13 }}>Chưa có dữ liệu KQKD dự kiến cho mã này.</p>;
  }
  return (
    <div data-testid="earnings-card" style={{ fontSize: 13 }}>
      <p style={{ margin: '0 0 4px' }}>
        KQKD dự kiến {impact.expectedAnnounce}
        {impact.announceMethod === 'DEADLINE_ONLY' && ' (chỉ ước theo hạn pháp lý)'}
        {impact.announceMethod === 'HISTORICAL_LAG' && ' (ước theo độ trễ công bố lịch sử)'}
        {impact.announceMethod === 'CONFIRMED' && ' (đã xác nhận)'}
        {impact.tdToEarnings !== null && ` · còn ${impact.tdToEarnings} ngày GD`}
      </p>
      <p data-testid="earnings-stance" style={{ margin: '0 0 4px', fontWeight: 600 }}>{STANCE_TEXT[impact.stance]}</p>
      {impact.reasons.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {impact.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export interface OptimalTimingPanelProps {
  ticker: string;
  rec: TimingRecommendation;
  stats: Parameters<typeof CycleTimeline>[0]['stats'];
  paths?: Parameters<typeof CycleTimeline>[0]['paths'];
  className?: string;
}

/**
 * Phần hiển thị THUẦN (nhận rec/stats/paths đã tính sẵn) — tách khỏi OptimalTimingTab để
 * test được không cần chạy hook mạng. OptimalTimingTab bên dưới là lớp mỏng nối hook thật.
 */
export function OptimalTimingPanel({ ticker, rec, stats, paths, className }: OptimalTimingPanelProps) {
  const markers = useMemo(
    () => ({
      agm: markerOffset(rec.tdToAgm, rec.tdToEx),
      payment: markerOffset(rec.tdToPayment, rec.tdToEx),
      earnings:
        rec.earningsImpact.tdToEarnings === null || rec.tdToEx === null
          ? null
          : { offset: rec.earningsImpact.tdToEarnings - rec.tdToEx, halfWidth: 3 },
    }),
    [rec.tdToAgm, rec.tdToPayment, rec.tdToEx, rec.earningsImpact.tdToEarnings],
  );
  const todayOffset = rec.tdToEx === null ? null : -rec.tdToEx;

  return (
    <section className={className} aria-label={`Optimal Timing — ${ticker}`}>
      {rec.confidence && (
        <p data-testid="confidence-line" style={{ margin: '0 0 8px', fontSize: 13 }}>
          Độ tin cậy: <strong>{CONFIDENCE_TEXT[rec.confidence]}</strong>
          {rec.nEvents !== null && ` (${rec.nEvents} sự kiện lịch sử)`}
          {rec.expectedNetReturn !== null && ` · kỳ vọng ròng (cận dưới 90%) ${(rec.expectedNetReturn * 100).toFixed(1).replace('.', ',')}%`}
        </p>
      )}

      <CycleTimeline stats={stats} paths={paths ?? null} todayOffset={todayOffset} markers={markers} />

      <div data-testid="earnings-section" style={{ marginTop: 12 }}>
        <h4 style={{ fontSize: 13, margin: '0 0 6px' }}>Kết quả kinh doanh</h4>
        <EarningsCard impact={rec.earningsImpact} />
      </div>

      {rec.explanations.length > 0 && (
        <div data-testid="explanations" style={{ marginTop: 12 }}>
          <h4 style={{ fontSize: 13, margin: '0 0 6px' }}>Yếu tố</h4>
          <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', fontSize: 13 }}>
            {rec.explanations.map((e, i) => (
              <li key={i} style={{ margin: '2px 0' }}>
                <EffectDot effect={e.effect} />
                <strong>{e.factor}:</strong> {e.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p style={{ fontSize: 11, color: 'var(--ct-muted, #5d6b78)', marginTop: 12 }}>
        Đây là thông tin định lượng tham khảo, không phải khuyến nghị đầu tư.
      </p>
    </section>
  );
}

export interface OptimalTimingTabProps {
  ticker: string;
  /** Ngày sự kiện đã có sẵn từ hook cổ tức hiện có của dự án (ví dụ useDividendEvents đã merge). */
  exDate: Sourced<ISODate> | null;
  agmDate: Sourced<ISODate> | null;
  paymentDate: Sourced<ISODate> | null;
  /** Tín hiệu KQKD từ hook earnings hiện có của dự án (ví dụ useEarningsSignal(ticker)). */
  earnings: EarningsSignal | null;
  /** Lịch giao dịch (nghỉ lễ + cuối tuần). Mặc định chỉ loại cuối tuần — KHÔNG dùng mặc định này cho sản xuất. */
  calendar?: HolidayCalendar;
  className?: string;
}

/**
 * Tab "Optimal Timing" trong StockModal (mục 11.3 tài liệu v3): nối useCycleStats +
 * useCyclePaths + optimizeDividendTiming rồi vẽ bằng OptimalTimingPanel/CycleTimeline.
 *
 * `exDate`/`agmDate`/`paymentDate`/`earnings` được truyền từ hook cổ tức/earnings CÓ SẴN của
 * dự án (mergedStocks, useEarningsData ở tài liệu v2) — component này không tự fetch phần đó,
 * chỉ fetch phần MỚI ở v3 (cycle-stats, cycle-paths).
 */
export function OptimalTimingTab({ ticker, exDate, agmDate, paymentDate, earnings, calendar, className }: OptimalTimingTabProps) {
  const { data: stats, status: statsStatus, error: statsError } = useCycleStatsV3(ticker);
  const { data: paths, status: pathsStatus } = useCyclePaths(ticker);

  const deps: Deps = useMemo(() => ({ clock: systemClock, cal: calendar ?? WEEKEND_ONLY_CALENDAR, cfg: DEFAULT_CONFIG }), [calendar]);

  const rec = useMemo(
    () => optimizeDividendTiming({ exDate, agmDate, paymentDate, cycle: stats, earnings }, deps),
    [exDate, agmDate, paymentDate, stats, earnings, deps],
  );

  if (statsStatus === 'loading') {
    return (
      <div className={className} role="status" data-testid="optimal-timing-loading">
        Đang tải dữ liệu backtest…
      </div>
    );
  }
  if (statsStatus === 'error') {
    return (
      <div className={className} role="alert" data-testid="optimal-timing-error">
        Không tải được dữ liệu backtest{statsError ? `: ${statsError.message}` : ''}.
      </div>
    );
  }

  return (
    <OptimalTimingPanel
      ticker={ticker}
      rec={rec}
      stats={stats}
      paths={pathsStatus === 'ready' ? paths : null}
      className={className}
    />
  );
}

export default OptimalTimingTab;
