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

/**
 * GIAI DOAN 2 (ra soat "Optimal Timing"): thanh CTA lon, de nhin ngay
 * (khong can doc bang so/giai thich chi tiet ben duoi) - hien ro "hom
 * nay co nen vao khong" bang mau + chu lon, kem thanh ky vong rong
 * (expectedNetReturn) truc quan hoa do lon/dau.
 */
function OptimalActionCTA({ rec }: { rec: TimingRecommendation }) {
  const k = rec.tdToEx === null ? null : -rec.tdToEx;
  const win = rec.window;

  let badgeBg = 'var(--ct-muted, #5d6b78)';
  let badgeText = '—';
  let subText: string | null = null;

  if (rec.action === 'IN_WINDOW') {
    badgeBg = 'var(--ct-buy, #1e9e5a)';
    badgeText = '🟢 TRONG CỬA SỔ — MUA NGAY';
    subText = rec.tdToEx !== null ? `Còn ${rec.tdToEx} ngày giao dịch đến GDKHQ` : null;
  } else if (rec.action === 'TOO_EARLY') {
    badgeBg = 'var(--ct-warn, #c47a00)';
    const waitDays = k !== null && win ? Math.max(0, k - win.entryFrom) : null;
    badgeText = waitDays !== null ? `⏳ Chờ cửa sổ (còn ${waitDays} ngày GD)` : '⏳ Chờ cửa sổ';
  } else if (rec.action === 'WINDOW_PASSED') {
    badgeBg = 'var(--ct-gap, #7a5cc7)';
    badgeText = '◐ Đã qua cửa sổ mua — cân nhắc chốt lời nếu đã mua trước đó';
  } else if (rec.action === 'POST_EX') {
    badgeText = '◻ Đã qua GDKHQ — hết cơ hội cho đợt này';
  } else if (rec.action === 'NO_SIGNAL') {
    badgeText = '— Chưa đủ tín hiệu thống kê tin cậy';
  } else {
    badgeText = '— Chưa có ngày GDKHQ để tính';
  }

  const barPct = rec.expectedNetReturn === null ? null : Math.max(-100, Math.min(100, rec.expectedNetReturn * 100 * 4));
  const barPositive = (rec.expectedNetReturn ?? 0) >= 0;

  return (
    <div data-testid="optimal-action-cta" style={{ marginBottom: 12 }}>
      <div
        style={{
          padding: '8px 12px', borderRadius: 8, background: `color-mix(in srgb, ${badgeBg} 18%, transparent)`,
          border: `1px solid ${badgeBg}`, fontWeight: 700, fontSize: 13, color: badgeBg,
          display: 'flex', flexDirection: 'column', gap: 2,
        }}
      >
        <span>{badgeText}</span>
        {subText && <span style={{ fontWeight: 400, fontSize: 11, opacity: 0.85 }}>{subText}</span>}
      </div>

      {rec.expectedNetReturn !== null && (
        <div
          title={rec.nEvents !== null ? `Dựa trên ${rec.nEvents} sự kiện lịch sử` : undefined}
          style={{ marginTop: 6, height: 6, borderRadius: 3, background: 'var(--ct-grid, #dde3e9)', position: 'relative', overflow: 'hidden' }}
        >
          <div
            style={{
              position: 'absolute', top: 0, bottom: 0,
              left: barPct! >= 0 ? '50%' : `${50 + barPct! / 2}%`,
              width: `${Math.abs(barPct!) / 2}%`,
              background: barPositive ? 'var(--ct-buy, #1e9e5a)' : 'var(--ct-today, #d6336c)',
            }}
          />
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: 'var(--ct-fg, currentColor)', opacity: 0.3 }} />
        </div>
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

      <OptimalActionCTA rec={rec} />

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
  const { data: stats, status: statsStatus, error: statsError, isStale, refresh } = useCycleStatsV3(ticker);
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
        <p>Không tải được dữ liệu backtest{statsError ? `: ${statsError.message}` : ''}.</p>
        <button type="button" onClick={() => refresh()} style={{ marginTop: 8, fontSize: 12, color: 'var(--ct-line, #0d6b8f)', textDecoration: 'underline', cursor: 'pointer' }}>
          Thử lại
        </button>
      </div>
    );
  }
  {/* GIAI DOAN 3 (ra soat 2026-09-26): "empty" (chua co du lieu backtest,
      KHAC "error" - khong phai loi, chi la CHUA DU lich su/chua duoc
      cron tinh) truoc day roi xuong render OptimalTimingPanel binh
      thuong voi stats=null, khong co thong bao ro rang gi cho nguoi
      dung - them nhanh rieng, minh bach ly do. */}
  if (statsStatus === 'empty') {
    return (
      <div className={className} role="status" data-testid="optimal-timing-empty" style={{ opacity: 0.7, padding: 16, textAlign: 'center', color: 'var(--ct-muted, #5d6b78)' }}>
        Chưa có đủ lịch sử để backtest cho mã này — cron quét định kỳ sẽ tự bổ sung khi có thêm dữ liệu.
      </div>
    );
  }

  return (
    <div className={className}>
      {isStale && (
        <div
          role="status"
          data-testid="optimal-timing-stale-banner"
          style={{
            marginBottom: 8, padding: '6px 10px', borderRadius: 6,
            background: 'color-mix(in srgb, var(--ct-warn, #c47a00) 15%, transparent)',
            border: '1px solid var(--ct-warn, #c47a00)', fontSize: 11, color: 'var(--ct-warn, #c47a00)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          }}
        >
          <span>⚠ Dữ liệu backtest có thể đã cũ — đang chờ lần quét tiếp theo.</span>
          <button type="button" onClick={() => refresh()} style={{ color: 'inherit', textDecoration: 'underline', cursor: 'pointer', flexShrink: 0 }}>
            Làm mới
          </button>
        </div>
      )}
      <OptimalTimingPanel
        ticker={ticker}
        rec={rec}
        stats={stats}
        paths={pathsStatus === 'ready' ? paths : null}
      />
    </div>
  );
}

export default OptimalTimingTab;
