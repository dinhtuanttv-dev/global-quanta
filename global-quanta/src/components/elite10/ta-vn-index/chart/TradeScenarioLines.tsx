import { plausiblePrice } from './sanitize';
import type { OhlcBar } from '../../../../types/taVnIndex';
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
export function TradeScenarioLines({ tradeScenario, samplePrice, priceSeries = [] }: { tradeScenario?: TradeScenario | null; samplePrice?: number; priceSeries?: OhlcBar[] }) {
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
      // Chỉ vẽ mức giá hợp lý so với chuỗi nến (kịch bản mẫu của mã khác -> bỏ, tránh giãn trục giá).
      const add = (o: Parameters<typeof candleSeries.createPriceLine>[0]) => { if (plausiblePrice(o.price, priceSeries)) lines.push(candleSeries.createPriceLine(o)); };
      const suffix = dim ? ' (tham chiếu)' : '';

      const isSeriesKvnd = samplePrice && samplePrice > 0 && samplePrice < 1000;
      const isScenarioVnd = tradeScenario.stopLoss > 1000 || tradeScenario.buyZone[0] > 1000;
      const scale = (isSeriesKvnd && isScenarioVnd) ? 0.001 : (!isSeriesKvnd && !isScenarioVnd && tradeScenario.stopLoss > 0 && tradeScenario.stopLoss < 1000) ? 1000 : 1;

      add({
        price: tradeScenario.buyZone[0] * scale, color: dim ? 'rgba(34,232,255,0.4)' : '#22e8ff',
        lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Mua từ${suffix}`,
      });
      add({
        price: tradeScenario.buyZone[1] * scale, color: dim ? 'rgba(34,232,255,0.4)' : '#22e8ff',
        lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Mua đến${suffix}`,
      });
      add({
        price: tradeScenario.stopLoss * scale, color: dim ? 'rgba(255,77,94,0.4)' : '#ff4d5e',
        lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `Stop loss${suffix}`,
      });
      add({
        price: tradeScenario.takeProfit[0] * scale, color: dim ? 'rgba(31,224,138,0.4)' : '#1fe08a',
        lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `Chốt lời 1${suffix}`,
      });
      add({
        price: tradeScenario.takeProfit[1] * scale, color: dim ? 'rgba(31,224,138,0.4)' : '#1fe08a',
        lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `Chốt lời 2${suffix}`,
      });
    } catch { /* chart da dispose, bo qua an toan */ }

    return () => {
      // CHI go NEU series (candlestick) CHUA bi remove - diem mau chot
      // giai quyet dung goc re bug cu.
      if (series.isRemoved) return;
      try { lines.forEach((l) => series.api().removePriceLine(l)); } catch { /* an toan */ }
      lines.length = 0;
    };
  }, [tradeScenario, series, samplePrice, priceSeries]);

  return null;
}
