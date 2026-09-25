import type { MouseEventParams, Time } from 'lightweight-charts';
import { useLayoutEffect, useState } from 'react';
import type { OhlcBar } from '../../../../types/taVnIndex';
import { useChartContext } from './ChartContainer';

function fmtLegend(bar: OhlcBar): string {
  const chg = bar.open === 0 ? 0 : ((bar.close - bar.open) / bar.open) * 100;
  const color = chg >= 0 ? '#1fe08a' : '#ff4d5e';
  const sign = chg > 0 ? '+' : '';
  return (
    `O ${bar.open.toLocaleString()}  H ${bar.high.toLocaleString()}  ` +
    `L ${bar.low.toLocaleString()}  C ${bar.close.toLocaleString()}  ` +
    `<span style="color:${color}">${sign}${chg.toFixed(2)}%</span>`
  );
}

/**
 * Giai doan 3/5: component con hien thi legend OHLC theo vi tri
 * crosshair - subscribeCrosshairMove la method cua CHART (khong phai
 * series), nen dung truc tiep parent.api() tu ChartContext thay vi can
 * ref toi 1 series cu the. Render JSX truc tiep (khac Series/Line -
 * component nay CO hien thi UI, khong return null).
 */
export function CrosshairLegend({ priceSeries }: { priceSeries: OhlcBar[] }) {
  const parent = useChartContext();
  const [legendHtml, setLegendHtml] = useState('');

  useLayoutEffect(() => {
    if (priceSeries.length === 0) return;
    const lastBar = priceSeries[priceSeries.length - 1];
    setLegendHtml(fmtLegend(lastBar));

    const handleCrosshair = (param: MouseEventParams<Time>) => {
      if (!param.time) { setLegendHtml(fmtLegend(lastBar)); return; }
      const bar = priceSeries.find((b) => b.time === param.time);
      if (bar) setLegendHtml(fmtLegend(bar));
    };

    let chart;
    try { chart = parent.api(); } catch { return; }
    chart.subscribeCrosshairMove(handleCrosshair);
    return () => {
      try { if (!parent.isRemoved) chart.unsubscribeCrosshairMove(handleCrosshair); } catch { /* da dispose, bo qua */ }
    };
  }, [priceSeries, parent]);

  return (
    <div className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-slate-950/70 px-2 py-1 text-[10px] font-mono text-slate-300" dangerouslySetInnerHTML={{ __html: legendHtml }} />
  );
}
