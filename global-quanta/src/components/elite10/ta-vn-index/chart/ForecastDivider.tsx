import { useLayoutEffect, useRef } from 'react';
import type { OhlcBar } from '../../../../types/taVnIndex';
import { useChartContext } from './ChartContainer';
import { useCandlestickSeriesContext } from './CandlestickSeries';

/**
 * Ve 1 duong doc phan cach RO RANG giua "du lieu that" (nen/gia da xay
 * ra) va "vung du bao" (fan chart MS-GARCH mo rong ra tuong lai) - vi
 * fan chart co du lieu (p10/p50/p90) o vung sau ngay cuoi cung, nguoi
 * dung keo chart sang phai se thay 3 duong mau (do/vang/xanh) nhung
 * KHONG co nen - de bi hieu nham la loi hien thi. Duong phan cach nay
 * lam ro day la vung du bao, khong phai loi.
 *
 * Chi hien khi fanChart co du lieu (hasForecast=true) - neu khong co
 * fan chart, khong can duong phan cach.
 */
export function ForecastDivider({ priceSeries, hasForecast }: { priceSeries: OhlcBar[]; hasForecast: boolean }) {
  const chartCtx = useChartContext();
  const series = useCandlestickSeriesContext();
  const elRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!hasForecast || priceSeries.length === 0) {
      elRef.current?.remove();
      elRef.current = null;
      return;
    }

    let chart;
    try { chart = chartCtx.api(); } catch { return; }
    const container = chartCtx.container;
    const lastBar = priceSeries[priceSeries.length - 1];

    function draw() {
      try {
        elRef.current?.remove();
        elRef.current = null;
        if (series.isRemoved || chartCtx.isRemoved) return;

        const x = chart!.timeScale().timeToCoordinate(lastBar.time as never);
        if (x === null) return;

        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.pointerEvents = 'none';
        div.style.left = `${x}px`;
        div.style.top = '0';
        div.style.bottom = '0';
        div.style.width = '0';
        div.style.borderLeft = '1.5px dashed rgba(148,163,184,0.6)';
        div.style.zIndex = '5';

        const label = document.createElement('div');
        label.style.position = 'absolute';
        label.style.top = '4px';
        label.style.left = '4px';
        label.style.whiteSpace = 'nowrap';
        label.style.fontSize = '9px';
        label.style.fontWeight = 'bold';
        label.style.padding = '2px 6px';
        label.style.borderRadius = '3px';
        label.style.background = 'rgba(148,163,184,0.9)';
        label.style.color = '#0a1420';
        label.textContent = '← Dữ liệu thật · Dự báo →';
        div.appendChild(label);

        container.appendChild(div);
        elRef.current = div;
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
      elRef.current?.remove();
      elRef.current = null;
    };
  }, [priceSeries, hasForecast, chartCtx, series]);

  return null;
}
