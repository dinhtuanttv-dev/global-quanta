import { LineStyle } from 'lightweight-charts';
import type { IPriceLine } from 'lightweight-charts';
import { useLayoutEffect, useRef } from 'react';
import type { OhlcBar } from '../../../../types/taVnIndex';
import { useCandlestickSeriesContext } from './CandlestickSeries';

const FIB_RATIOS = [
  { ratio: 0, label: 'Fib 0.0 (Đáy)', color: 'rgba(239,68,68,0.7)', style: LineStyle.Solid },
  { ratio: 0.236, label: 'Fib 0.236', color: 'rgba(249,115,22,0.7)', style: LineStyle.Dashed },
  { ratio: 0.382, label: 'Fib 0.382', color: 'rgba(234,179,8,0.7)', style: LineStyle.Dashed },
  { ratio: 0.5, label: 'Fib 0.500 (Cân bằng)', color: 'rgba(34,211,238,0.9)', style: LineStyle.Solid },
  { ratio: 0.618, label: 'Fib 0.618 (Tỷ lệ vàng)', color: 'rgba(31,224,138,0.9)', style: LineStyle.Solid },
  { ratio: 0.786, label: 'Fib 0.786', color: 'rgba(168,85,247,0.7)', style: LineStyle.Dashed },
  { ratio: 1.0, label: 'Fib 1.0 (Đỉnh)', color: 'rgba(59,130,246,0.7)', style: LineStyle.Solid },
];

export function FibonacciLevels({
  priceSeries,
  showFibonacci,
}: {
  priceSeries: OhlcBar[];
  showFibonacci: boolean;
}) {
  const series = useCandlestickSeriesContext();
  const linesRef = useRef<IPriceLine[]>([]);

  useLayoutEffect(() => {
    const lines = linesRef.current;
    try { lines.forEach((l) => series.api().removePriceLine(l)); } catch { /* an toan */ }
    lines.length = 0;

    if (!showFibonacci || priceSeries.length < 10) return;

    try {
      const candleSeries = series.api();
      const windowSeries = priceSeries.slice(-90);

      let minLow = Infinity;
      let maxHigh = -Infinity;
      for (const bar of windowSeries) {
        if (bar.low < minLow) minLow = bar.low;
        if (bar.high > maxHigh) maxHigh = bar.high;
      }

      if (minLow === Infinity || maxHigh === -Infinity || minLow >= maxHigh) return;

      const diff = maxHigh - minLow;

      for (const item of FIB_RATIOS) {
        const fibPrice = Number((minLow + diff * item.ratio).toFixed(2));
        lines.push(
          candleSeries.createPriceLine({
            price: fibPrice,
            color: item.color,
            lineWidth: item.ratio === 0.618 || item.ratio === 0.5 ? 2 : 1,
            lineStyle: item.style,
            axisLabelVisible: true,
            title: item.label,
          })
        );
      }
    } catch {
      /* chart da dispose, bo qua an toan */
    }

    return () => {
      if (series.isRemoved) return;
      try { lines.forEach((l) => series.api().removePriceLine(l)); } catch { /* an toan */ }
      lines.length = 0;
    };
  }, [showFibonacci, priceSeries, series]);

  return null;
}
