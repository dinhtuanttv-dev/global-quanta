import { LineStyle } from 'lightweight-charts';
import type { IPriceLine } from 'lightweight-charts';
import { useLayoutEffect, useRef } from 'react';
import type { OhlcBar } from '../../../../types/taVnIndex';
import type { TripleBarrierOccurrence } from '../../../../hooks/elite10/useSmcDetector';
import { useChartContext } from './ChartContainer';
import { useCandlestickSeriesContext } from './CandlestickSeries';

/**
 * Giai doan 4/5: component con cua CandlestickSeries - ve 2 duong TP/
 * SL (Triple-Barrier Lop 2) + 1 vung to mau + tu dong zoom toi dung
 * vung tin hieu khi nguoi dung chon 1 occurrence. Can CA candleSeries
 * (useCandlestickSeriesContext) VA chart+container (useChartContext)
 * vi zone la div overlay tinh toa do tu chart.timeScale().
 */
export function TripleBarrierZone({
  priceSeries, occurrences, selectedIndex,
}: {
  priceSeries: OhlcBar[];
  occurrences?: TripleBarrierOccurrence[] | null;
  selectedIndex?: number | null;
}) {
  const chartCtx = useChartContext();
  const series = useCandlestickSeriesContext();
  const linesRef = useRef<IPriceLine[]>([]);
  const zoneElRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const lines = linesRef.current;
    try { lines.forEach((l) => series.api().removePriceLine(l)); } catch { /* an toan */ }
    lines.length = 0;
    zoneElRef.current?.remove();
    zoneElRef.current = null;

    if (selectedIndex === null || selectedIndex === undefined) return;
    const occ = (occurrences ?? [])[selectedIndex];
    if (!occ) return;

    let chart;
    try { chart = chartCtx.api(); } catch { return; }
    const container = chartCtx.container;

    // Tu dong cuon/zoom chart toi dung vung tin hieu - padding 15 nen
    // moi ben de co du boi canh gia xung quanh.
    const signalIdx = priceSeries.findIndex((b) => b.time === occ.signalDate);
    const resolvedIdx = priceSeries.findIndex((b) => b.time === occ.resolvedDate);
    if (signalIdx >= 0 && resolvedIdx >= 0) {
      try {
        chart.timeScale().setVisibleLogicalRange({
          from: Math.max(0, signalIdx - 15),
          to: Math.min(priceSeries.length - 1, resolvedIdx + 15),
        });
      } catch { /* an toan */ }
    }

    const resultColor = occ.label === 1 ? '#1fe08a' : '#ff4d5e';
    try {
      const candleSeries = series.api();
      lines.push(candleSeries.createPriceLine({
        price: occ.tpBarrier, color: '#c084fc', lineWidth: 2, lineStyle: LineStyle.Dashed,
        axisLabelVisible: true, title: 'Chốt lời (Triple-Barrier)',
      }));
      lines.push(candleSeries.createPriceLine({
        price: occ.slBarrier, color: '#fb923c', lineWidth: 2, lineStyle: LineStyle.Dashed,
        axisLabelVisible: true, title: 'Cắt lỗ (Triple-Barrier)',
      }));
    } catch { /* an toan */ }

    function drawZone() {
      try {
        zoneElRef.current?.remove();
        zoneElRef.current = null;
        if (series.isRemoved || chartCtx.isRemoved) return;
        const candleSeries = series.api();
        const y1 = candleSeries.priceToCoordinate(occ.tpBarrier);
        const y2 = candleSeries.priceToCoordinate(occ.slBarrier);
        const x1 = chart!.timeScale().timeToCoordinate(occ.signalDate as never);
        const x2 = chart!.timeScale().timeToCoordinate(occ.resolvedDate as never);
        if (y1 === null || y2 === null || x1 === null || x2 === null) return;

        const resultLabel = occ.barrierHit === 'take_profit' ? 'Chạm chốt lời' : occ.barrierHit === 'stop_loss' ? 'Chạm cắt lỗ' : 'Hết hạn thời gian';

        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.pointerEvents = 'none';
        div.style.left = `${Math.min(x1, x2)}px`;
        div.style.top = `${Math.min(y1, y2)}px`;
        div.style.width = `${Math.max(2, Math.abs(x2 - x1))}px`;
        div.style.height = `${Math.max(2, Math.abs(y2 - y1))}px`;
        div.style.background = 'rgba(168,85,247,0.1)';
        div.style.border = `2px solid ${resultColor}`;
        div.style.borderRadius = '3px';
        div.title = `${occ.signalDate} → ${occ.resolvedDate} · ${resultLabel} · ${occ.actualReturnPct >= 0 ? '+' : ''}${occ.actualReturnPct.toFixed(1)}%`;

        const badge = document.createElement('div');
        badge.style.position = 'absolute';
        badge.style.top = '-20px';
        badge.style.left = '0';
        badge.style.whiteSpace = 'nowrap';
        badge.style.fontSize = '10px';
        badge.style.fontWeight = 'bold';
        badge.style.padding = '2px 6px';
        badge.style.borderRadius = '3px';
        badge.style.background = resultColor;
        badge.style.color = '#0a1420';
        badge.textContent = `${occ.label === 1 ? '✓' : '✗'} ${resultLabel} (${occ.actualReturnPct >= 0 ? '+' : ''}${occ.actualReturnPct.toFixed(1)}%)`;
        div.appendChild(badge);

        container.appendChild(div);
        zoneElRef.current = div;
      } catch { /* chart/series da dispose, bo qua an toan */ }
    }

    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => { if (!cancelled) drawZone(); });
    });
    try { chart.timeScale().subscribeVisibleTimeRangeChange(drawZone); } catch { /* an toan */ }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      try { if (!chartCtx.isRemoved) chart!.timeScale().unsubscribeVisibleTimeRangeChange(drawZone); } catch { /* an toan */ }
      if (!series.isRemoved) {
        try { lines.forEach((l) => series.api().removePriceLine(l)); } catch { /* an toan */ }
      }
      lines.length = 0;
      zoneElRef.current?.remove();
      zoneElRef.current = null;
    };
  }, [occurrences, selectedIndex, priceSeries, chartCtx, series]);

  return null;
}
