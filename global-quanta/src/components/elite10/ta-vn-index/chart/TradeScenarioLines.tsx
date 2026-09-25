import { LineStyle } from 'lightweight-charts';
import type { IPriceLine } from 'lightweight-charts';
import { useLayoutEffect, useRef } from 'react';
import type { TradeScenario } from '../../../../types/taVnIndex';
import { useCandlestickSeriesContext } from './CandlestickSeries';

/**
 * Giai doan 4/5: component con cua CandlestickSeries - ve 5 duong
 * Trade Scenario (Mua tu/den, Stop loss, Chot loi 1/2) bang Price
 * Lines. La CON cua CandlestickSeries (dung useCandlestickSeriesContext,
 * khong phai useChartContext) - dam bao dung thu tu cleanup theo cay:
 * component nay don TRUOC CandlestickSeries, CandlestickSeries don
 * TRUOC ChartContainer.
 */
export function TradeScenarioLines({ tradeScenario }: { tradeScenario?: TradeScenario | null }) {
  const series = useCandlestickSeriesContext();
  const linesRef = useRef<IPriceLine[]>([]);

  useLayoutEffect(() => {
    const lines = linesRef.current;
    try {
      lines.forEach((l) => series.api().removePriceLine(l));
    } catch { /* chart da dispose, bo qua an toan */ }
    lines.length = 0;

    if (!tradeScenario) return;
    try {
      const candleSeries = series.api();
      const dim = tradeScenario.isEstimated;
      const suffix = dim ? ' (tham chiếu)' : '';

      lines.push(candleSeries.createPriceLine({
        price: tradeScenario.buyZone[0], color: dim ? 'rgba(34,232,255,0.4)' : '#22e8ff',
        lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Mua từ${suffix}`,
      }));
      lines.push(candleSeries.createPriceLine({
        price: tradeScenario.buyZone[1], color: dim ? 'rgba(34,232,255,0.4)' : '#22e8ff',
        lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Mua đến${suffix}`,
      }));
      lines.push(candleSeries.createPriceLine({
        price: tradeScenario.stopLoss, color: dim ? 'rgba(255,77,94,0.4)' : '#ff4d5e',
        lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `Stop loss${suffix}`,
      }));
      lines.push(candleSeries.createPriceLine({
        price: tradeScenario.takeProfit[0], color: dim ? 'rgba(31,224,138,0.4)' : '#1fe08a',
        lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `Chốt lời 1${suffix}`,
      }));
      lines.push(candleSeries.createPriceLine({
        price: tradeScenario.takeProfit[1], color: dim ? 'rgba(31,224,138,0.4)' : '#1fe08a',
        lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `Chốt lời 2${suffix}`,
      }));
    } catch { /* chart da dispose, bo qua an toan */ }

    return () => {
      // CHI go NEU series (candlestick) CHUA bi remove - diem mau chot
      // giai quyet dung goc re bug cu.
      if (series.isRemoved) return;
      try { lines.forEach((l) => series.api().removePriceLine(l)); } catch { /* an toan */ }
      lines.length = 0;
    };
  }, [tradeScenario, series]);

  return null;
}
