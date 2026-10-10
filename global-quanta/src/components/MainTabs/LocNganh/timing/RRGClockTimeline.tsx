// Port từ locnganh-timing-engine (ui/sector-rotation/RRGClockTimeline.tsx).
import { useMemo, useState } from 'react';
import type { Quadrant, RRGPoint } from '../../../../lib/locnganh/types';

/**
 * RRG Clock — thay cho timeline 12 tháng của cotuc-timing-engine vì RRG là chu kỳ XOAY VÒNG
 * không gắn với lịch (một ngành có thể mất 3 tuần hoặc 3 quý để đi hết một vòng), vẽ lên trục
 * tháng sẽ sai bản chất. Thay vào đó: mặt phẳng RS-Ratio × RS-Momentum, 4 góc phần tư đúng vị
 * trí quy ước ngành (Leading trên-phải, Improving trên-trái, Lagging dưới-trái, Weakening
 * dưới-phải), mỗi ngành là một VỆT ĐUÔI N điểm gần nhất mờ dần theo thời gian, độ đậm điểm
 * cuối theo xác suất outperform (Beta-Binomial) nếu có, điểm hiện tại nhấp nháy nhẹ khi vừa
 * cắt vào Improving.
 */
const QUADRANT_COLOR: Record<Quadrant, string> = {
  LEADING: 'var(--ct-buy, #1e9e5a)',
  IMPROVING: 'var(--ct-line, #0d6b8f)',
  LAGGING: 'var(--ct-muted, #5d6b78)',
  WEAKENING: 'var(--ct-warn, #c47a00)',
};
const QUADRANT_LABEL: Record<Quadrant, string> = { LEADING: 'Dẫn dắt', IMPROVING: 'Cải thiện', LAGGING: 'Tụt hậu', WEAKENING: 'Suy yếu' };

const W = 560;
const H = 560;
const PAD = 40;
const CX = W / 2;
const CY = H / 2;
const R = Math.min(W, H) / 2 - PAD;

export interface SectorRRGHistory {
  sectorKey: string;
  sectorLabel: string;
  /** Lịch sử gần đây, CŨ → MỚI, điểm cuối là hiện tại. */
  points: RRGPoint[];
  /** Xác suất outperform (Beta-Binomial) của cửa sổ đang theo dõi — null nếu chưa đủ bằng chứng. */
  reactionProbabilityMean: number | null;
  /** true nếu vừa cắt vào quadrant mục tiêu trong vài phiên gần nhất. */
  isFreshlyInTarget: boolean;
  /** (tích hợp) nhãn ngắn hiển thị cạnh điểm cuối — mặc định sectorKey như gói gốc. */
  shortLabel?: string;
}

export interface RRGClockTimelineProps {
  sectors: SectorRRGHistory[];
  /** Số điểm đuôi tối đa hiển thị cho mỗi ngành. Mặc định 6. */
  tailLength?: number;
  onSelectSector?: (sectorKey: string) => void;
  className?: string;
}

/** Quy đổi (rsRatio, rsMomentum) sang toạ độ SVG — tâm là (100,100), bán kính co giãn theo độ lệch khỏi 100. */
function toXY(rsRatio: number, rsMomentum: number, scale: number): { x: number; y: number } {
  const dx = (rsRatio - 100) * scale;
  const dy = (rsMomentum - 100) * scale;
  return { x: CX + dx, y: CY - dy }; // trục Y SVG ngược chiều toán học
}

export function RRGClockTimeline({ sectors, tailLength = 6, onSelectSector, className }: RRGClockTimelineProps) {
  const [hover, setHover] = useState<string | null>(null);

  const scale = useMemo(() => {
    let maxAbsDeviation = 5; // sàn tối thiểu để tránh chia cho số quá nhỏ khi dữ liệu phẳng
    for (const s of sectors) {
      for (const p of s.points.slice(-tailLength)) {
        maxAbsDeviation = Math.max(maxAbsDeviation, Math.abs(p.rsRatio - 100), Math.abs(p.rsMomentum - 100));
      }
    }
    return (R - 8) / (maxAbsDeviation * 1.15); // chừa biên 15%
  }, [sectors, tailLength]);

  if (sectors.length === 0) {
    return (
      <div className={className} role="status" data-testid="rrg-clock-empty">
        Chưa có dữ liệu RRG để vẽ đồng hồ chu kỳ ngành.
      </div>
    );
  }

  const hovered = hover ? sectors.find((s) => s.sectorKey === hover) ?? null : null;

  return (
    <section className={className} aria-label="Đồng hồ chu kỳ RRG theo ngành">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mặt phẳng RS-Ratio và RS-Momentum, 4 góc phần tư RRG" style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* 4 góc phần tư */}
        <rect x={CX} y={CY - R} width={R} height={R} style={{ fill: QUADRANT_COLOR.LEADING }} opacity={0.06} />
        <rect x={CX - R} y={CY - R} width={R} height={R} style={{ fill: QUADRANT_COLOR.IMPROVING }} opacity={0.06} />
        <rect x={CX - R} y={CY} width={R} height={R} style={{ fill: QUADRANT_COLOR.LAGGING }} opacity={0.06} />
        <rect x={CX} y={CY} width={R} height={R} style={{ fill: QUADRANT_COLOR.WEAKENING }} opacity={0.06} />
        <line x1={CX - R} x2={CX + R} y1={CY} y2={CY} style={{ stroke: 'var(--ct-grid, #dde3e9)' }} />
        <line x1={CX} x2={CX} y1={CY - R} y2={CY + R} style={{ stroke: 'var(--ct-grid, #dde3e9)' }} />
        <text x={CX + R - 6} y={CY - R + 16} textAnchor="end" fontSize={12} fontWeight={600} style={{ fill: QUADRANT_COLOR.LEADING }}>
          {QUADRANT_LABEL.LEADING}
        </text>
        <text x={CX - R + 6} y={CY - R + 16} textAnchor="start" fontSize={12} fontWeight={600} style={{ fill: QUADRANT_COLOR.IMPROVING }}>
          {QUADRANT_LABEL.IMPROVING}
        </text>
        <text x={CX - R + 6} y={CY + R - 8} textAnchor="start" fontSize={12} fontWeight={600} style={{ fill: QUADRANT_COLOR.LAGGING }}>
          {QUADRANT_LABEL.LAGGING}
        </text>
        <text x={CX + R - 6} y={CY + R - 8} textAnchor="end" fontSize={12} fontWeight={600} style={{ fill: QUADRANT_COLOR.WEAKENING }}>
          {QUADRANT_LABEL.WEAKENING}
        </text>

        {sectors.map((s) => {
          const tail = s.points.slice(-tailLength);
          if (tail.length === 0) return null;
          const dim = hover !== null && hover !== s.sectorKey;
          const last = tail[tail.length - 1];
          const lastXY = toXY(last.rsRatio, last.rsMomentum, scale);
          const opacity = s.reactionProbabilityMean === null ? 0.5 : Math.max(0.35, Math.min(1, s.reactionProbabilityMean));

          return (
            <g
              key={s.sectorKey}
              data-testid={`rrg-sector-${s.sectorKey}`}
              opacity={dim ? 0.2 : 1}
              style={{ cursor: onSelectSector ? 'pointer' : undefined }}
              onMouseEnter={() => setHover(s.sectorKey)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelectSector?.(s.sectorKey)}
            >
              {tail.map((p, i) => {
                if (i === 0) return null;
                const a = toXY(tail[i - 1].rsRatio, tail[i - 1].rsMomentum, scale);
                const b = toXY(p.rsRatio, p.rsMomentum, scale);
                const segOpacity = (0.15 + (0.65 * i) / tail.length) * (s.reactionProbabilityMean ?? 0.6) + 0.1;
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={2} style={{ stroke: QUADRANT_COLOR[p.quadrant] }} opacity={Math.min(1, segOpacity)} />;
              })}
              <circle
                data-testid={s.isFreshlyInTarget ? `rrg-fresh-${s.sectorKey}` : undefined}
                cx={lastXY.x}
                cy={lastXY.y}
                r={s.isFreshlyInTarget ? 8 : 5}
                style={{ fill: QUADRANT_COLOR[last.quadrant], stroke: '#fff' }}
                strokeWidth={s.isFreshlyInTarget ? 2 : 1}
                opacity={opacity}
              />
              <text x={lastXY.x + 8} y={lastXY.y + 4} fontSize={11} fontWeight={dim ? 400 : 600} style={{ fill: QUADRANT_COLOR[last.quadrant] }}>
                {s.shortLabel ?? s.sectorKey}
              </text>
            </g>
          );
        })}
      </svg>

      <div data-testid="rrg-clock-detail" aria-live="polite" style={{ fontSize: 13, minHeight: 32, margin: '6px 0' }}>
        {hovered ? (
          <span>
            <strong>{hovered.sectorLabel}</strong> — {QUADRANT_LABEL[hovered.points[hovered.points.length - 1].quadrant]}
            {hovered.reactionProbabilityMean !== null && ` · P(outperform) ${Math.round(hovered.reactionProbabilityMean * 100)}%`}
            {hovered.isFreshlyInTarget && ' · vừa chuyển quadrant'}
          </span>
        ) : (
          'Di chuột hoặc chạm vào một ngành để xem chi tiết.'
        )}
      </div>

      <p style={{ fontSize: 11, color: 'var(--ct-muted, #5d6b78)', margin: '6px 0 0' }}>
        Vệt đuôi: {tailLength} phiên gần nhất, mờ dần theo thời gian. Độ đậm điểm cuối theo xác
        suất outperform đã qua kiểm định thống kê — không phải khuyến nghị đầu tư.
      </p>
    </section>
  );
}

export default RRGClockTimeline;
