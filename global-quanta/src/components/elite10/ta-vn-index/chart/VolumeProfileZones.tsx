import { useLayoutEffect, useRef } from 'react';
import type { IChartApi } from 'lightweight-charts';
import type { OhlcBar } from '../../../../types/taVnIndex';
import { useChartContext } from './ChartContainer';
import { useCandlestickSeriesContext } from './CandlestickSeries';

export function VolumeProfileZones({
  priceSeries,
  showVolumeProfile,
}: {
  priceSeries: OhlcBar[];
  showVolumeProfile: boolean;
}) {
  const chartCtx = useChartContext();
  const series = useCandlestickSeriesContext();
  const elsRef = useRef<HTMLDivElement[]>([]);

  useLayoutEffect(() => {
    elsRef.current.forEach((el) => el.remove());
    elsRef.current = [];

    if (!showVolumeProfile || priceSeries.length < 15) return;

    let chart: IChartApi | undefined;
    try { chart = chartCtx.api(); } catch { return; }
    const container = chartCtx.container;

    function draw() {
      try {
        if (series.isRemoved || chartCtx.isRemoved || !container || !chart) return;
        elsRef.current.forEach((el) => el.remove());
        elsRef.current = [];
        if (!showVolumeProfile) return;

        const candleSeries = series.api();
        const slice = priceSeries.slice(-60);

        let minLow = Infinity;
        let maxHigh = -Infinity;
        for (const b of slice) {
          if (b.low < minLow) minLow = b.low;
          if (b.high > maxHigh) maxHigh = b.high;
        }

        if (minLow === Infinity || maxHigh === -Infinity || minLow >= maxHigh) return;

        const numBuckets = 12;
        const bucketStep = (maxHigh - minLow) / numBuckets;
        const bucketVolumes = new Array(numBuckets).fill(0);

        for (const b of slice) {
          const midPrice = (b.high + b.low) / 2;
          const idx = Math.min(numBuckets - 1, Math.max(0, Math.floor((midPrice - minLow) / bucketStep)));
          bucketVolumes[idx] += b.volume || 1;
        }

        const maxVol = Math.max(...bucketVolumes, 1);
        let pocIndex = 0;
        let pocVol = 0;
        bucketVolumes.forEach((v, i) => {
          if (v > pocVol) {
            pocVol = v;
            pocIndex = i;
          }
        });

        // Tọa độ lề phải của container
        const containerWidth = container.clientWidth;
        const barMaxWidth = 120; // Độ rộng tối đa 120px ở rìa phải

        for (let i = 0; i < numBuckets; i++) {
          const bTopPrice = minLow + (i + 1) * bucketStep;
          const bBottomPrice = minLow + i * bucketStep;

          const y1 = candleSeries.priceToCoordinate(bTopPrice);
          const y2 = candleSeries.priceToCoordinate(bBottomPrice);
          if (y1 === null || y2 === null) continue;

          const top = Math.min(y1, y2);
          const height = Math.max(2, Math.abs(y2 - y1));
          const width = Math.max(4, Math.round((bucketVolumes[i] / maxVol) * barMaxWidth));
          const isPoc = i === pocIndex;

          const div = document.createElement('div');
          div.style.position = 'absolute';
          div.style.pointerEvents = 'none';
          div.style.right = '0px';
          div.style.top = `${top}px`;
          div.style.width = `${width}px`;
          div.style.height = `${height}px`;
          div.style.background = isPoc ? 'rgba(245, 158, 11, 0.35)' : 'rgba(34, 232, 255, 0.15)';
          div.style.borderLeft = isPoc ? '2px solid #f59e0b' : '1px solid rgba(34, 232, 255, 0.4)';
          div.style.zIndex = '3';
          div.title = `Volume Profile: ${bucketVolumes[i].toLocaleString()} (Giá: ${bBottomPrice.toFixed(1)}-${bTopPrice.toFixed(1)})${isPoc ? ' · POC (Point of Control)' : ''}`;

          if (isPoc) {
            const pocBadge = document.createElement('div');
            pocBadge.style.position = 'absolute';
            pocBadge.style.left = '-36px';
            pocBadge.style.top = '0px';
            pocBadge.style.fontSize = '8px';
            pocBadge.style.fontWeight = 'bold';
            pocBadge.style.color = '#f59e0b';
            pocBadge.style.background = 'rgba(15, 23, 42, 0.9)';
            pocBadge.style.padding = '0px 3px';
            pocBadge.style.borderRadius = '2px';
            pocBadge.textContent = 'POC';
            div.appendChild(pocBadge);
          }

          container.appendChild(div);
          elsRef.current.push(div);
        }
      } catch {
        /* chart da dispose, bo qua an toan */
      }
    }

    let cancelled = false;
    draw();

    const timer = setTimeout(() => {
      if (!cancelled) draw();
    }, 50);

    try { chart.timeScale().subscribeVisibleTimeRangeChange(draw); } catch { /* an toan */ }

    return () => {
      cancelled = true;
      clearTimeout(timer);
      try { if (!chartCtx.isRemoved) chart!.timeScale().unsubscribeVisibleTimeRangeChange(draw); } catch { /* an toan */ }
      elsRef.current.forEach((el) => el.remove());
      elsRef.current = [];
    };
  }, [showVolumeProfile, priceSeries, chartCtx, series]);

  return null;
}
