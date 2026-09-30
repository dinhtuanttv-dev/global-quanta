import { LineStyle } from 'lightweight-charts';
import type { ISeriesApi, LineData, WhitespaceData } from 'lightweight-charts';
import { useLayoutEffect, useRef, useMemo } from 'react';
import type { OhlcBar } from '../../../../types/taVnIndex';
import { useChartContext } from './ChartContainer';

/**
 * Tính toán đường VWAP (Volume Weighted Average Price) từ chuỗi nến OHLCV
 */
function computeVwap(priceSeries: OhlcBar[]): (LineData | WhitespaceData)[] {
  if (priceSeries.length === 0) return [];

  let cumVolume = 0;
  let cumPV = 0;

  return priceSeries.map((bar) => {
    const typicalPrice = (bar.high + bar.low + bar.close) / 3;
    const vol = bar.volume || 1;
    cumVolume += vol;
    cumPV += typicalPrice * vol;

    const vwapValue = cumVolume > 0 ? cumPV / cumVolume : typicalPrice;

    return {
      time: bar.time as never,
      value: Number(vwapValue.toFixed(2)),
    };
  });
}

export function VwapSeries({
  priceSeries,
  showVwap,
}: {
  priceSeries: OhlcBar[];
  showVwap: boolean;
}) {
  const chartCtx = useChartContext();
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const vwapData = useMemo(() => {
    if (!showVwap || priceSeries.length === 0) return [];
    return computeVwap(priceSeries);
  }, [priceSeries, showVwap]);

  useLayoutEffect(() => {
    let chart;
    try { chart = chartCtx.api(); } catch { return; }

    if (!showVwap || vwapData.length === 0) {
      if (lineSeriesRef.current) {
        try { chart.removeSeries(lineSeriesRef.current); } catch { /* an toan */ }
        lineSeriesRef.current = null;
      }
      return;
    }

    try {
      if (!lineSeriesRef.current) {
        lineSeriesRef.current = chart.addLineSeries({
          color: '#f59e0b', // Màu cam hổ phách rực rỡ cho VWAP
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          lastValueVisible: true,
          priceLineVisible: false,
          title: 'VWAP',
        });
      }

      lineSeriesRef.current.setData(vwapData);
    } catch {
      /* chart da dispose, bo qua an toan */
    }

    return () => {
      if (lineSeriesRef.current) {
        try { chart.removeSeries(lineSeriesRef.current); } catch { /* an toan */ }
        lineSeriesRef.current = null;
      }
    };
  }, [showVwap, vwapData, chartCtx]);

  return null;
}
