import { LineStyle } from 'lightweight-charts';
import type { ISeriesApi, LineData, WhitespaceData } from 'lightweight-charts';
import { useLayoutEffect, useRef, useMemo } from 'react';
import type { OhlcBar } from '../../../../types/taVnIndex';
import { useChartContext } from './ChartContainer';

function computeSuperTrend(priceSeries: OhlcBar[], period = 10, multiplier = 3.0) {
  if (priceSeries.length < period) return { greenData: [], redData: [] };

  const atrValues: number[] = [];
  for (let i = 0; i < priceSeries.length; i++) {
    if (i === 0) {
      atrValues.push(priceSeries[i].high - priceSeries[i].low);
      continue;
    }
    const tr = Math.max(
      priceSeries[i].high - priceSeries[i].low,
      Math.abs(priceSeries[i].high - priceSeries[i - 1].close),
      Math.abs(priceSeries[i].low - priceSeries[i - 1].close)
    );
    const prevAtr = atrValues[i - 1];
    atrValues.push((prevAtr * (period - 1) + tr) / period);
  }

  const greenData: (LineData | WhitespaceData)[] = [];
  const redData: (LineData | WhitespaceData)[] = [];

  let isBullish = true;
  let upperBand = 0;
  let lowerBand = 0;

  for (let i = 0; i < priceSeries.length; i++) {
    const bar = priceSeries[i];
    const hl2 = (bar.high + bar.low) / 2;
    const atr = atrValues[i];

    let basicUpper = hl2 + multiplier * atr;
    let basicLower = hl2 - multiplier * atr;

    if (i === 0) {
      upperBand = basicUpper;
      lowerBand = basicLower;
    } else {
      const prevClose = priceSeries[i - 1].close;
      lowerBand = basicLower > lowerBand || prevClose < lowerBand ? basicLower : lowerBand;
      upperBand = basicUpper < upperBand || prevClose > upperBand ? basicUpper : upperBand;
    }

    if (isBullish && bar.close < lowerBand) {
      isBullish = false;
    } else if (!isBullish && bar.close > upperBand) {
      isBullish = true;
    }

    const val = Number((isBullish ? lowerBand : upperBand).toFixed(2));
    if (isBullish) {
      greenData.push({ time: bar.time as never, value: val });
      redData.push({ time: bar.time as never });
    } else {
      redData.push({ time: bar.time as never, value: val });
      greenData.push({ time: bar.time as never });
    }
  }

  return { greenData, redData };
}

export function SuperTrendSeries({
  priceSeries,
  showSuperTrend,
}: {
  priceSeries: OhlcBar[];
  showSuperTrend: boolean;
}) {
  const chartCtx = useChartContext();
  const greenSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const redSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const { greenData, redData } = useMemo(() => {
    if (!showSuperTrend || priceSeries.length === 0) return { greenData: [], redData: [] };
    return computeSuperTrend(priceSeries);
  }, [priceSeries, showSuperTrend]);

  useLayoutEffect(() => {
    let chart;
    try { chart = chartCtx.api(); } catch { return; }

    if (!showSuperTrend || (greenData.length === 0 && redData.length === 0)) {
      if (greenSeriesRef.current) {
        try { chart.removeSeries(greenSeriesRef.current); } catch { /* an toan */ }
        greenSeriesRef.current = null;
      }
      if (redSeriesRef.current) {
        try { chart.removeSeries(redSeriesRef.current); } catch { /* an toan */ }
        redSeriesRef.current = null;
      }
      return;
    }

    try {
      if (!greenSeriesRef.current) {
        greenSeriesRef.current = chart.addLineSeries({
          color: '#1fe08a',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          lastValueVisible: false,
          priceLineVisible: false,
          title: 'SuperTrend (Bull)',
        });
      }
      if (!redSeriesRef.current) {
        redSeriesRef.current = chart.addLineSeries({
          color: '#ff4d5e',
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          lastValueVisible: false,
          priceLineVisible: false,
          title: 'SuperTrend (Bear)',
        });
      }

      greenSeriesRef.current.setData(greenData);
      redSeriesRef.current.setData(redData);
    } catch {
      /* chart da dispose, bo qua an toan */
    }

    return () => {
      if (greenSeriesRef.current) {
        try { chart.removeSeries(greenSeriesRef.current); } catch { /* an toan */ }
        greenSeriesRef.current = null;
      }
      if (redSeriesRef.current) {
        try { chart.removeSeries(redSeriesRef.current); } catch { /* an toan */ }
        redSeriesRef.current = null;
      }
    };
  }, [showSuperTrend, greenData, redData, chartCtx]);

  return null;
}
