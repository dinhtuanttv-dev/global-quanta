import { useLayoutEffect, useRef } from 'react';
import type { OhlcBar } from '../../../../types/taVnIndex';
import type { WyckoffSchematic } from '../../../../hooks/elite10/useSmcDetector';
import { useChartContext } from './ChartContainer';
import { useCandlestickSeriesContext } from './CandlestickSeries';

const PHASE_CONFIGS = [
  { name: 'Phase A', label: 'Phase A · Tích lũy ban đầu', color: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.3)', startRatio: 0, endRatio: 0.25 },
  { name: 'Phase B', label: 'Phase B · Xây dựng nguyên nhân', color: 'rgba(168,85,247,0.06)', border: 'rgba(168,85,247,0.3)', startRatio: 0.25, endRatio: 0.5 },
  { name: 'Phase C', label: 'Phase C · Spring / Rũ bỏ', color: 'rgba(234,179,8,0.07)', border: 'rgba(234,179,8,0.4)', startRatio: 0.5, endRatio: 0.7 },
  { name: 'Phase D', label: 'Phase D · Bứt phá (SOS)', color: 'rgba(31,224,138,0.08)', border: 'rgba(31,224,138,0.4)', startRatio: 0.7, endRatio: 0.88 },
  { name: 'Phase E', label: 'Phase E · Xu hướng tăng', color: 'rgba(34,232,255,0.08)', border: 'rgba(34,232,255,0.4)', startRatio: 0.88, endRatio: 1.0 },
];

export function WyckoffPhaseZones({
  priceSeries,
  wyckoffReal,
  showWyckoff,
}: {
  priceSeries: OhlcBar[];
  wyckoffReal?: WyckoffSchematic | null;
  showWyckoff: boolean;
}) {
  const chartCtx = useChartContext();
  const series = useCandlestickSeriesContext();
  const elsRef = useRef<HTMLDivElement[]>([]);

  useLayoutEffect(() => {
    elsRef.current.forEach((el) => el.remove());
    elsRef.current = [];

    if (!showWyckoff || priceSeries.length < 10) return;

    let chart;
    try { chart = chartCtx.api(); } catch { return; }
    const container = chartCtx.container;

    function draw() {
      try {
        if (series.isRemoved || chartCtx.isRemoved || !container) return;
        elsRef.current.forEach((el) => el.remove());
        elsRef.current = [];
        if (!showWyckoff) return;

        const totalBars = priceSeries.length;
        const timeScale = chart.timeScale();

        for (const phase of PHASE_CONFIGS) {
          const startIndex = Math.floor(phase.startRatio * (totalBars - 1));
          const endIndex = Math.min(totalBars - 1, Math.floor(phase.endRatio * (totalBars - 1)));

          const startTime = priceSeries[startIndex]?.time;
          const endTime = priceSeries[endIndex]?.time;
          if (!startTime || !endTime) continue;

          const x1 = timeScale.timeToCoordinate(startTime as never);
          const x2 = timeScale.timeToCoordinate(endTime as never);
          if (x1 === null || x2 === null) continue;

          const left = Math.min(x1, x2);
          const width = Math.max(2, Math.abs(x2 - x1));

          const div = document.createElement('div');
          div.style.position = 'absolute';
          div.style.pointerEvents = 'none';
          div.style.left = `${left}px`;
          div.style.top = '0px';
          div.style.width = `${width}px`;
          div.style.height = '100%';
          div.style.background = phase.color;
          div.style.borderLeft = `1px dashed ${phase.border}`;
          div.style.borderRight = `1px dashed ${phase.border}`;
          div.style.zIndex = '1';

          // Badge nhãn Phase ở góc trên cùng
          const badge = document.createElement('div');
          badge.style.position = 'absolute';
          badge.style.top = '28px';
          badge.style.left = '4px';
          badge.style.fontSize = '9px';
          badge.style.fontWeight = 'bold';
          badge.style.padding = '1px 5px';
          badge.style.borderRadius = '3px';
          badge.style.background = 'rgba(15, 23, 42, 0.75)';
          badge.style.border = `1px solid ${phase.border}`;
          badge.style.color = '#e2e8f0';
          badge.style.whiteSpace = 'nowrap';
          badge.textContent = phase.label;

          div.appendChild(badge);
          container.appendChild(div);
          elsRef.current.push(div);
        }

        // Nếu có sự kiện wyckoffReal (Spring/SOS/LPS), đính kèm nhãn sự kiện
        if (wyckoffReal) {
          const eventsToMark = [
            wyckoffReal.spring && { date: wyckoffReal.spring.date, label: '⚡ Spring (LPS)', color: '#eab308' },
            wyckoffReal.sos && { date: wyckoffReal.sos.date, label: '🚀 SOS', color: '#1fe08a' },
            wyckoffReal.lps && { date: wyckoffReal.lps.date, label: '🛡️ LPS', color: '#22e8ff' },
          ].filter(Boolean) as { date: string; label: string; color: string }[];

          for (const ev of eventsToMark) {
            const x = timeScale.timeToCoordinate(ev.date as never);
            if (x === null) continue;

            const evDiv = document.createElement('div');
            evDiv.style.position = 'absolute';
            evDiv.style.pointerEvents = 'none';
            evDiv.style.left = `${x - 20}px`;
            evDiv.style.top = '60px';
            evDiv.style.fontSize = '10px';
            evDiv.style.fontWeight = 'bold';
            evDiv.style.padding = '2px 6px';
            evDiv.style.borderRadius = '4px';
            evDiv.style.background = 'rgba(15, 23, 42, 0.9)';
            evDiv.style.border = `1px solid ${ev.color}`;
            evDiv.style.color = ev.color;
            evDiv.style.zIndex = '2';
            evDiv.textContent = ev.label;

            container.appendChild(evDiv);
            elsRef.current.push(evDiv);
          }
        }
      } catch {
        /* chart/series da dispose, bo qua an toan */
      }
    }

    let cancelled = false;
    draw(); // Draw immediately

    const timer = setTimeout(() => {
      if (!cancelled) draw();
    }, 50);

    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => { if (!cancelled) draw(); });
    });

    try { chart.timeScale().subscribeVisibleTimeRangeChange(draw); } catch { /* an toan */ }

    return () => {
      cancelled = true;
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      try { if (!chartCtx.isRemoved) chart!.timeScale().unsubscribeVisibleTimeRangeChange(draw); } catch { /* an toan */ }
      elsRef.current.forEach((el) => el.remove());
      elsRef.current = [];
    };
  }, [showWyckoff, priceSeries, wyckoffReal, chartCtx, series]);

  return null;
}
