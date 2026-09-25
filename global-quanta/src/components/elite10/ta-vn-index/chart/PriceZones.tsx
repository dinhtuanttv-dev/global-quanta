import { useLayoutEffect, useRef } from 'react';
import type { OhlcBar, PriceZone } from '../../../../types/taVnIndex';
import { useChartContext } from './ChartContainer';
import { useCandlestickSeriesContext } from './CandlestickSeries';

const ZONE_COLORS: Record<PriceZone['kind'], { bg: string; border: string }> = {
  demand_zone: { bg: 'rgba(31,224,138,0.12)', border: 'rgba(31,224,138,0.5)' },
  order_block_bullish: { bg: 'rgba(31,224,138,0.14)', border: 'rgba(31,224,138,0.6)' },
  order_block_bearish: { bg: 'rgba(255,77,94,0.14)', border: 'rgba(255,77,94,0.6)' },
  fvg: { bg: 'rgba(34,232,255,0.1)', border: 'rgba(34,232,255,0.5)' },
  triple_barrier_window: { bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.45)' },
};

/**
 * Giai doan 5/5 (CUOI): component con cua CandlestickSeries - ve nhieu
 * zone (Demand Zone/Order Block/FVG) bang div overlay quy doi toa do
 * that. Tuong tu TripleBarrierZone (Giai doan 4) nhung xu ly MANG
 * zones thay vi 1 occurrence duy nhat.
 */
export function PriceZones({
  priceSeries, zones, showDemandZone,
}: {
  priceSeries: OhlcBar[];
  zones: PriceZone[];
  showDemandZone: boolean;
}) {
  const chartCtx = useChartContext();
  const series = useCandlestickSeriesContext();
  const elsRef = useRef<HTMLDivElement[]>([]);

  useLayoutEffect(() => {
    if (priceSeries.length === 0) return;

    let chart;
    try { chart = chartCtx.api(); } catch { return; }
    const container = chartCtx.container;

    function draw() {
      try {
        if (series.isRemoved || chartCtx.isRemoved) return;
        elsRef.current.forEach((el) => el.remove());
        elsRef.current = [];
        if (!showDemandZone) return;

        const candleSeries = series.api();
        for (const zone of zones) {
          const y1 = candleSeries.priceToCoordinate(zone.priceTop);
          const y2 = candleSeries.priceToCoordinate(zone.priceBottom);
          const x1 = chart!.timeScale().timeToCoordinate(zone.timeFrom as never);
          const x2 = chart!.timeScale().timeToCoordinate(zone.timeTo as never);
          if (y1 === null || y2 === null || x1 === null || x2 === null) continue;

          const colors = ZONE_COLORS[zone.kind];
          const div = document.createElement('div');
          div.style.position = 'absolute';
          div.style.pointerEvents = 'none';
          div.style.left = `${Math.min(x1, x2)}px`;
          div.style.top = `${Math.min(y1, y2)}px`;
          div.style.width = `${Math.max(2, Math.abs(x2 - x1))}px`;
          div.style.height = `${Math.max(2, Math.abs(y2 - y1))}px`;
          div.style.background = colors.bg;
          div.style.border = `1px dashed ${colors.border}`;
          div.style.borderRadius = '2px';
          div.title = zone.label;
          container.appendChild(div);
          elsRef.current.push(div);
        }
      } catch { /* chart/series da dispose, bo qua an toan */ }
    }

    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => { if (!cancelled) draw(); });
    });
    try { chart.timeScale().subscribeVisibleTimeRangeChange(draw); } catch { /* an toan */ }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      try { if (!chartCtx.isRemoved) chart!.timeScale().unsubscribeVisibleTimeRangeChange(draw); } catch { /* an toan */ }
      elsRef.current.forEach((el) => el.remove());
      elsRef.current = [];
    };
  }, [zones, showDemandZone, priceSeries, chartCtx, series]);

  return null;
}
