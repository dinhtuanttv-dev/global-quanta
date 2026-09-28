import { LineStyle } from 'lightweight-charts';
import type { ISeriesApi } from 'lightweight-charts';
import { useLayoutEffect, useRef, useMemo } from 'react';
import type { OhlcBar, ElliottData } from '../../../../types/taVnIndex';
import { useChartContext } from './ChartContainer';
import { useCandlestickSeriesContext } from './CandlestickSeries';

export interface WavePivot {
  time: string;
  price: number;
  label: string;
  isHigh: boolean;
}

/**
 * Tính toán các điểm Pivot Đỉnh/Đáy của Sóng Elliott tự động từ chuỗi nến
 */
function computeElliottPivots(priceSeries: OhlcBar[]): WavePivot[] {
  if (priceSeries.length < 30) return [];
  
  // Lấy 60 nến gần nhất để tính toán các sóng
  const slice = priceSeries.slice(-60);
  const pivots: { index: number; bar: OhlcBar; isHigh: boolean }[] = [];
  
  // Tìm các đỉnh/đáy cục bộ với bán kính 4 nến
  const radius = 4;
  for (let i = radius; i < slice.length - radius; i++) {
    const current = slice[i];
    let isHigh = true;
    let isLow = true;
    
    for (let j = i - radius; j <= i + radius; j++) {
      if (j === i) continue;
      if (slice[j].high >= current.high) isHigh = false;
      if (slice[j].low <= current.low) isLow = false;
    }
    
    if (isHigh) pivots.push({ index: i, bar: current, isHigh: true });
    else if (isLow) pivots.push({ index: i, bar: current, isHigh: false });
  }

  // Lọc lấy các điểm đan xen (High -> Low -> High -> Low)
  const filtered: typeof pivots = [];
  for (const p of pivots) {
    if (filtered.length === 0) {
      filtered.push(p);
    } else {
      const last = filtered[filtered.length - 1];
      if (last.isHigh !== p.isHigh) {
        filtered.push(p);
      } else {
        // Nếu cùng loại, giữ điểm cực trị cao/thấp hơn
        if (p.isHigh && p.bar.high > last.bar.high) filtered[filtered.length - 1] = p;
        if (!p.isHigh && p.bar.low < last.bar.low) filtered[filtered.length - 1] = p;
      }
    }
  }

  // Chỉ lấy tối đa 8 mốc sóng (5 sóng đẩy + 3 sóng điều chỉnh)
  const selected = filtered.slice(-8);
  const waveLabels = ['①', '②', '③', '④', '⑤', 'Ⓐ', 'Ⓑ', 'Ⓒ'];
  
  return selected.map((p, idx) => ({
    time: p.bar.time,
    price: p.isHigh ? p.bar.high : p.bar.low,
    label: waveLabels[idx] || `Wave ${idx + 1}`,
    isHigh: p.isHigh,
  }));
}

export function ElliottWaveSeries({
  priceSeries,
  elliott,
  showElliott,
}: {
  priceSeries: OhlcBar[];
  elliott?: ElliottData | null;
  showElliott: boolean;
}) {
  const chartCtx = useChartContext();
  const series = useCandlestickSeriesContext();
  const lineSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const pivots = useMemo(() => {
    if (!showElliott || priceSeries.length === 0) return [];
    return computeElliottPivots(priceSeries);
  }, [priceSeries, showElliott]);

  useLayoutEffect(() => {
    let chart;
    try { chart = chartCtx.api(); } catch { return; }

    if (!showElliott || pivots.length === 0) {
      if (lineSeriesRef.current) {
        try { chart.removeSeries(lineSeriesRef.current); } catch { /* an toan */ }
        lineSeriesRef.current = null;
      }
      return;
    }

    try {
      if (!lineSeriesRef.current) {
        lineSeriesRef.current = chart.addLineSeries({
          color: '#c084fc',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          lastValueVisible: false,
          priceLineVisible: false,
        });
      }

      const lineSeries = lineSeriesRef.current;
      const lineData = pivots.map((p) => ({
        time: p.time as never,
        value: p.price,
      }));

      lineSeries.setData(lineData);

      // Thêm các marker nhãn số sóng ①-⑤ và Ⓐ-Ⓒ
      const markers = pivots.map((p) => ({
        time: p.time as never,
        position: (p.isHigh ? 'aboveBar' : 'belowBar') as 'aboveBar' | 'belowBar',
        color: p.isHigh ? '#c084fc' : '#38bdf8',
        shape: (p.isHigh ? 'arrowDown' : 'arrowUp') as 'arrowDown' | 'arrowUp',
        text: p.label,
      }));

      // Set marker lên line series để không đè vào candlestick markers
      lineSeries.setMarkers(markers);
    } catch {
      /* chart da dispose, bo qua an toan */
    }

    return () => {
      if (lineSeriesRef.current) {
        try { chart.removeSeries(lineSeriesRef.current); } catch { /* an toan */ }
        lineSeriesRef.current = null;
      }
    };
  }, [showElliott, pivots, chartCtx]);

  return null;
}
