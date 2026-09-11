import { useMemo } from 'react';
import type { AtrPoint, CycleMatch, PricePoint } from '../../../types/cycleFingerprint';
import { useCfI18n } from '../../../i18n/CfI18nProvider';

interface MainChartProps {
  priceSeries: PricePoint[];
  topMatches: CycleMatch[];
  atrSeries: AtrPoint[];
  useAtrAxis: boolean;
  highlightedTicker: string | null;
}

const WIDTH = 720;
const HEIGHT = 320;
const PADDING = 32;

function buildOffsetPositionMap(
  domainOffsets: number[],
  atrByOffset: Map<number, number>,
  useAtrAxis: boolean,
): Map<number, number> {
  const sorted = [...new Set(domainOffsets)].sort((a, b) => a - b);
  const positions = new Map<number, number>();
  if (sorted.length === 0) return positions;

  const fallbackAtr =
    atrByOffset.size > 0 ? [...atrByOffset.values()].reduce((s, v) => s + v, 0) / atrByOffset.size : 1;

  let cumulative = 0;
  const cumulatives: number[] = [0];
  for (let i = 1; i < sorted.length; i += 1) {
    const step = useAtrAxis ? (atrByOffset.get(sorted[i]) ?? fallbackAtr) : 1;
    cumulative += Math.max(step, 1e-6);
    cumulatives.push(cumulative);
  }
  const total = cumulatives[cumulatives.length - 1] || 1;
  sorted.forEach((offset, i) => positions.set(offset, cumulatives[i] / total));
  return positions;
}

/**
 * Biểu đồ SVG thuần - CHỈ vẽ giá lịch sử + overlay Top-3 chu kỳ (đúng
 * Giai đoạn 1). KHÔNG nhận/vẽ Fan Chart hay bất kỳ dữ liệu Nhóm 1 nào -
 * cố tình bỏ hẳn tham số đó khỏi kiểu dữ liệu (không phải "không dùng"
 * mà là "không thể truyền vào") để tránh lặp lại lỗi trục biểu đồ bị
 * biến dạng do gộp domain với dữ liệu dự báo tương lai. Fan Chart hiển
 * thị ở <FanChartPanel /> riêng biệt, xem CfPanel.tsx.
 */
export function MainChart({ priceSeries, topMatches, atrSeries, useAtrAxis, highlightedTicker }: MainChartProps) {
  const { t } = useCfI18n();

  const { pricePath, matchPaths, ready } = useMemo(() => {
    if (priceSeries.length === 0) {
      return { pricePath: '', matchPaths: [] as { ticker: string; d: string }[], ready: false };
    }

    const baseIdx = priceSeries.length - 1;
    const atrByOffset = new Map(atrSeries.map((a) => [a.sessionOffset, a.atr.value]));

    const priceOffsets = priceSeries.map((_, i) => i - baseIdx);
    const matchOffsets = topMatches.slice(0, 3).flatMap((m) => m.alignedSeries.map((pt) => pt.sessionOffset));
    const domainOffsets = [...priceOffsets, ...matchOffsets];

    const posMap = buildOffsetPositionMap(domainOffsets, atrByOffset, useAtrAxis);
    const xScaleFn = (offset: number) => {
      const pos = posMap.get(offset) ?? 0;
      return PADDING + pos * (WIDTH - PADDING * 2);
    };

    const closes = priceSeries.map((p) => p.close.value);
    const yMin = Math.min(...closes);
    const yMax = Math.max(...closes);
    const yScaleFn = (v: number) =>
      HEIGHT - PADDING - ((v - yMin) / Math.max(yMax - yMin, 1e-6)) * (HEIGHT - PADDING * 2);

    const pricePathD = priceSeries
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xScaleFn(i - baseIdx)} ${yScaleFn(p.close.value)}`)
      .join(' ');

    const basePrice = priceSeries[baseIdx]?.close.value ?? 100;
    const matchPathsD = topMatches.slice(0, 3).map((m) => {
      const d = m.alignedSeries
        .map((pt, i) => {
          const scaledPrice = (pt.normalizedClose.value / 100) * basePrice;
          return `${i === 0 ? 'M' : 'L'} ${xScaleFn(pt.sessionOffset)} ${yScaleFn(scaledPrice)}`;
        })
        .join(' ');
      return { ticker: m.ticker, d };
    });

    return { pricePath: pricePathD, matchPaths: matchPathsD, ready: true };
  }, [priceSeries, topMatches, atrSeries, useAtrAxis]);

  if (!ready) return null;

  return (
    <div className="cf-main-chart">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={t('chart.legend.price')}>
        <path d={pricePath} fill="none" stroke="var(--positive)" strokeWidth={2} />
        {matchPaths.map((m) => (
          <path
            key={m.ticker} d={m.d} fill="none" stroke="var(--gold)"
            strokeWidth={highlightedTicker === m.ticker ? 2.5 : 1}
            strokeDasharray="4 3"
            opacity={highlightedTicker && highlightedTicker !== m.ticker ? 0.3 : 0.9}
          />
        ))}
      </svg>
      <p className="cf-chart-legend">
        <span className="cf-legend-dot cf-legend-dot--price" /> {t('chart.legend.price')}
        <span className="cf-legend-dot cf-legend-dot--match" /> {t('chart.legend.match')}
      </p>
    </div>
  );
}
