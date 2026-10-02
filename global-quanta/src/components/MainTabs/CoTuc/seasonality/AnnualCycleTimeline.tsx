import { useMemo, useState } from 'react';
import type { AnnualEarningsCalendarV3, Quarter, QuarterSeasonality } from '../../../../lib/cotuc/timing-types';
import { densitySegments, doyToMonthPosition, peakDensity, positionOnYear } from '../../../../lib/cotuc/annual-timeline.utils';

/**
 * AnnualCycleTimeline — timeline chu kỳ KQKD TỔNG HỢP CẢ NĂM cho một mã: một trục ngang 12
 * tháng, 4 "làn" (một cho mỗi quý), mỗi làn là một dải thể hiện:
 *
 *   - VỊ TRÍ + ĐỘ RỘNG dải  → thời điểm công bố điển hình (trung vị lịch sử) ± độ lệch chuẩn.
 *     Rộng = nhiều năm công bố lệch ngày nhau (ít đoán trước được thời điểm).
 *   - ĐỘ ĐẬM MÀU dải        → xác suất Bayes (Beta-Binomial) mà cửa sổ mua tối ưu của quý đó
 *     có phản ứng giá dương — giá trị TRUNG BÌNH hậu nghiệm, không phải tỷ lệ thắng thô.
 *   - VIỀN NÉT ĐỨT vs ĐẶC   → dataStatus ESTIMATED (ít sự kiện lịch sử) vs CONFIRMED.
 *   - Khi hover/chạm/focus  → hiện khoảng tin cậy Bayes đầy đủ [cận dưới, cận trên], không chỉ
 *     một con số — đúng tinh thần "không bịa chắc chắn từ mẫu nhỏ" của toàn bộ tính năng này.
 *
 * Tích hợp vào global-quanta: giữ nguyên logic của gói; màu lấy từ biến --ct-q1..4 / --ct-* do SeasonalityTheme đặt theo
 * bảng màu tab Siêu Quét AI (Q1 cyan · Q2 emerald · Q3 amber · Q4 violet), chữ dùng phông của trang.
 *
 * Component THUẦN HIỂN THỊ: nhận `AnnualEarningsCalendarV3` đã tính sẵn (useAnnualEarningsCalendar),
 * không tự tính toán Bayes hay backtest gì — mọi con số đến từ backend/earnings-seasonality/.
 */

export interface AnnualCycleTimelineProps {
  calendar: AnnualEarningsCalendarV3 | null;
  /** Tháng hiện tại (1-12), để vẽ marker "hôm nay". Mặc định lấy từ đồng hồ hệ thống lúc render. */
  currentMonth?: number;
  /** Ngày trong tháng (1-31), định vị "hôm nay" chính xác hơn trong tháng. Mặc định 15 (giữa tháng). */
  currentDay?: number;
  className?: string;
}

const W = 700;
const H = 230;
const ML = 46;
const MR = 16;
const MT = 22;
const MB = 34;
const PW = W - ML - MR;
const PH = H - MT - MB;
const LANE_H = PH / 4;

const MONTH_LABELS = ['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12'];

/** Màu riêng cho từng quý — cố định để người dùng quen mắt qua nhiều mã khác nhau. */
const QUARTER_COLOR: Record<Quarter, string> = {
  1: 'var(--ct-q1, #0d6b8f)',
  2: 'var(--ct-q2, #1e9e5a)',
  3: 'var(--ct-q3, #c47a00)',
  4: 'var(--ct-q4, #a04dd6)',
};

const C = {
  muted: 'var(--ct-muted, #5d6b78)',
  grid: 'var(--ct-grid, #dde3e9)',
  fg: 'var(--ct-fg, currentColor)',
  today: 'var(--ct-today, #d6336c)',
};

function monthPosition(month: number, day: number): number {
  // Vị trí liên tục trong [1, 13): tháng 1 ngày 1 → 1.0; tháng 1 ngày 31 → gần 2.0.
  const daysInMonthApprox = 30.44;
  return month + Math.max(0, Math.min(1, (day - 1) / daysInMonthApprox));
}

function formatPct(v: number, digits = 0): string {
  return (v * 100).toFixed(digits).replace('.', ',') + '%';
}

function opacityFromProbability(p: number | null): number {
  if (p === null) return 0.12; // NO_SIGNAL — dải mờ, gần như chỉ còn viền
  // Ánh xạ [0,1] → [0.15, 0.85] để ngay cả xác suất thấp cũng còn nhìn thấy dải (không biến mất),
  // và xác suất cao không bị chói (vẫn đọc được chữ đè lên trên).
  return 0.15 + 0.7 * Math.max(0, Math.min(1, p));
}

function describeQuarter(q: QuarterSeasonality): string {
  const monthText = `Th${q.typicalAnnounceMonth}`;
  const stdText = q.announceMonthStd > 0.03 ? ` ± ${q.announceMonthStd.toFixed(1)} tháng` : '';
  if (!q.reactionProbability) {
    return `Q${q.quarter}: dự kiến công bố ${monthText}${stdText} · chưa đủ bằng chứng thống kê về xác suất phản ứng (${q.nEvents} sự kiện lịch sử)`;
  }
  const rp = q.reactionProbability;
  return (
    `Q${q.quarter}: dự kiến công bố ${monthText}${stdText} · ` +
    `xác suất phản ứng dương ${formatPct(rp.mean)} (khoảng tin cậy ${Math.round(rp.level * 100)}%: ${formatPct(rp.ci[0])} – ${formatPct(rp.ci[1])}) · ${q.nEvents} sự kiện lịch sử`
  );
}

export function AnnualCycleTimeline({ calendar, currentMonth, currentDay = 15, className }: AnnualCycleTimelineProps) {
  const [active, setActive] = useState<Quarter | null>(null);
  const now = useMemo(() => {
    const d = new Date();
    return { month: currentMonth ?? d.getMonth() + 1, day: currentDay };
  }, [currentMonth, currentDay]);

  // Ridgeline: mỗi quý có mô hình Student-t của ngày công bố ⇒ vẽ ĐƯỜNG MẬT ĐỘ XÁC SUẤT thay cho dải
  // cứng "tháng ± std". Chuẩn hoá chiều cao theo ĐỈNH CHUNG của cả 4 quý (không chuẩn hoá riêng từng
  // làn) để quý bất định hơn trông thấp và bè hơn — đúng bản chất, không tô vẽ cho đẹp.
  const curves = useMemo(
    () =>
      (calendar?.quarters ?? []).map((q) => ({
        quarter: q.quarter,
        segments: q.announceModel
          ? densitySegments({ mu: q.announceModel.mu, scale: q.announceModel.scale, dof: q.announceModel.dof, n: q.announceModel.n }, q.quarter, 0, 110)
          : [],
      })),
    [calendar],
  );
  const peak = useMemo(() => peakDensity(curves.map((c) => c.segments)), [curves]);

  if (!calendar) {
    return (
      <div className={className} role="status" data-testid="annual-timeline-empty">
        Chưa có dữ liệu mùa vụ KQKD cho mã này.
      </div>
    );
  }

  const X = (monthContinuous: number) => ML + ((monthContinuous - 1) / 12) * PW;
  const laneY = (index: number) => MT + index * LANE_H;

  const todayX = X(monthPosition(now.month, now.day));
  const ordered = [...calendar.quarters].sort((a, b) => a.quarter - b.quarter);
  const activeQuarter = ordered.find((q) => q.quarter === active) ?? null;

  return (
    <section className={className} aria-label={`Chu kỳ mùa vụ KQKD cả năm — ${calendar.ticker}`}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Timeline mùa vụ KQKD 12 tháng" style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* Lưới tháng */}
        {MONTH_LABELS.map((label, i) => {
          const month = i + 1;
          const x = X(month);
          return (
            <g key={label}>
              <line x1={x} x2={x} y1={MT} y2={MT + PH} style={{ stroke: C.grid }} />
              <text x={x} y={H - 14} textAnchor="middle" fontSize={11} style={{ fill: C.muted }}>
                {label}
              </text>
            </g>
          );
        })}
        <line x1={X(13)} x2={X(13)} y1={MT} y2={MT + PH} style={{ stroke: C.grid }} />

        {/* 4 làn quý */}
        {ordered.map((q, i) => {
          const color = QUARTER_COLOR[q.quarter];
          const center = q.typicalAnnounceMonth;
          const halfWidth = Math.max(0.15, q.announceMonthStd);
          const x0 = X(Math.max(1, center - halfWidth));
          const x1 = X(Math.min(13, center + halfWidth));
          const y = laneY(i) + 6;
          const laneHeight = LANE_H - 12;
          const opacity = opacityFromProbability(q.reactionProbability?.mean ?? null);
          const estimated = q.dataStatus !== 'CONFIRMED';
          const isActive = active === q.quarter;
          const model = q.announceModel;
          const segs = curves.find((c) => c.quarter === q.quarter)?.segments ?? [];
          const baseY = y + laneHeight;

          return (
            <g
              key={q.quarter}
              data-testid={`quarter-lane-${q.quarter}`}
              tabIndex={0}
              role="button"
              aria-label={describeQuarter(q)}
              style={{ cursor: 'pointer', outline: 'none' }}
              onMouseEnter={() => setActive(q.quarter)}
              onFocus={() => setActive(q.quarter)}
              onMouseLeave={() => setActive((cur) => (cur === q.quarter ? null : cur))}
              onClick={() => setActive((cur) => (cur === q.quarter ? null : q.quarter))}
            >
              <text x={ML - 8} y={y + laneHeight / 2 + 4} textAnchor="end" fontSize={12} fontWeight={600} style={{ fill: color }}>
                Q{q.quarter}
              </text>
              {model && segs.length > 0 ? (
                <g data-testid={`density-lane-${q.quarter}`}>
                  <rect x={ML} y={y} width={PW} height={laneHeight} fill="transparent" />
                  {segs.map((seg, si) => {
                    const pts = seg.map((p) => ({ x: X(doyToMonthPosition(p.doy)), y: baseY - (peak > 0 ? (p.density / peak) * (laneHeight - 4) : 0) }));
                    const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join('');
                    const area = `${line}L${pts[pts.length - 1].x.toFixed(1)} ${baseY}L${pts[0].x.toFixed(1)} ${baseY}Z`;
                    return (
                      <g key={si}>
                        <path d={area} style={{ fill: color }} opacity={opacity} />
                        <path d={line} fill="none" strokeWidth={isActive ? 2.4 : 1.6} strokeDasharray={estimated ? '4 3' : undefined} style={{ stroke: color }} />
                      </g>
                    );
                  })}
                  {/* Khoảng tin cậy 90% của NGÀY công bố: thanh mảnh dưới đường nền làn */}
                  {(() => {
                    const a = X(doyToMonthPosition(positionOnYear(q.quarter, model.ci90[0])));
                    const b = X(doyToMonthPosition(positionOnYear(q.quarter, model.ci90[1])));
                    return a <= b ? (
                      <line data-testid={`ci-bar-${q.quarter}`} x1={a} x2={b} y1={baseY + 2} y2={baseY + 2} strokeWidth={3} strokeLinecap="round" style={{ stroke: color }} />
                    ) : (
                      <g data-testid={`ci-bar-${q.quarter}`}>
                        <line x1={a} x2={X(13)} y1={baseY + 2} y2={baseY + 2} strokeWidth={3} strokeLinecap="round" style={{ stroke: color }} />
                        <line x1={X(1)} x2={b} y1={baseY + 2} y2={baseY + 2} strokeWidth={3} strokeLinecap="round" style={{ stroke: color }} />
                      </g>
                    );
                  })()}
                </g>
              ) : (
                <rect
                  x={x0}
                  y={y}
                  width={Math.max(2, x1 - x0)}
                  height={laneHeight}
                  rx={6}
                  style={{ fill: color, stroke: color }}
                  opacity={opacity}
                  strokeOpacity={isActive ? 1 : 0.6}
                  strokeWidth={isActive ? 2 : 1}
                  strokeDasharray={estimated ? '4 3' : undefined}
                />
              )}
              {q.reactionProbability && x1 - x0 > 55 && (
                <text x={(x0 + x1) / 2} y={y + laneHeight / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={600} style={{ fill: C.fg }}>
                  {formatPct(q.reactionProbability.mean)}
                </text>
              )}
              {!q.reactionProbability && x1 - x0 > 70 && (
                <text x={(x0 + x1) / 2} y={y + laneHeight / 2 + 4} textAnchor="middle" fontSize={10} style={{ fill: C.muted }}>
                  Chưa đủ dữ liệu
                </text>
              )}
            </g>
          );
        })}

        {/* Marker hôm nay — vẽ SAU các làn để luôn nổi lên trên */}
        <line x1={todayX} x2={todayX} y1={MT} y2={MT + PH} strokeWidth={2} style={{ stroke: C.today }} />
        <text x={todayX + 5} y={MT + 12} fontSize={10} fontWeight={600} style={{ fill: C.today }}>
          Hôm nay
        </text>
      </svg>

      <div data-testid="annual-timeline-info" aria-live="polite" className="min-h-[36px] text-[11px] text-slate-300 px-0.5 py-1.5 leading-snug">
        {activeQuarter ? describeQuarter(activeQuarter) : 'Di chuột, chạm hoặc dùng Tab để xem chi tiết từng quý.'}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[9.5px] text-slate-500 px-0.5">
        <span>Độ đậm dải = xác suất phản ứng dương (trung bình Bayes)</span>
        <span>Đường cong = xác suất dự báo NGÀY công bố (Student-t; thanh dưới = khoảng tin cậy 90%)</span>
        <span>Độ rộng = độ bất định thời điểm công bố</span>
        <span>Viền nét đứt = còn ít dữ liệu lịch sử</span>
      </div>
    </section>
  );
}

export default AnnualCycleTimeline;
