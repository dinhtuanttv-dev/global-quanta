import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
} from 'lightweight-charts';
import type { OhlcBar, PriceZone, TrendlinePoint, ChartEvent } from '../../../types/taVnIndex';
import { buildTimeIndex } from '../../../lib/taMath';

interface MainChartProps {
  priceSeries: OhlcBar[];
  zones: PriceZone[];
  trendline: TrendlinePoint[];
  events: ChartEvent[];
  showTrendline: boolean;
  showDemandZone: boolean;
}

const ZONE_COLORS: Record<PriceZone['kind'], { bg: string; border: string }> = {
  demand_zone: { bg: 'rgba(31,224,138,0.12)', border: 'rgba(31,224,138,0.5)' },
  order_block_bullish: { bg: 'rgba(31,224,138,0.14)', border: 'rgba(31,224,138,0.6)' },
  order_block_bearish: { bg: 'rgba(255,77,94,0.14)', border: 'rgba(255,77,94,0.6)' },
  fvg: { bg: 'rgba(34,232,255,0.1)', border: 'rgba(34,232,255,0.5)' },
};

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
 * Chart nến thật (lightweight-charts) với overlay vẽ thật: Demand
 * Zone/Order Block (hình chữ nhật quy đổi toạ độ), Trendline (LineSeries),
 * sự kiện T/C ghim vào nến (setMarkers). KHÔNG dùng thư viện chart khác —
 * nếu Project B đã có chuẩn chart riêng, cân nhắc thay thế để đồng bộ UI.
 */
export function MainChart({ priceSeries, zones, trendline, events, showTrendline, showDemandZone }: MainChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const trendSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const zoneElsRef = useRef<HTMLDivElement[]>([]);
  const [legendHtml, setLegendHtml] = useState('');

  // Khởi tạo chart 1 lần
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      height: 300,
      layout: { background: { color: 'transparent' }, textColor: '#6f8ea3', fontSize: 10 },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      rightPriceScale: { borderColor: 'rgba(34,232,255,0.2)' },
      timeScale: { borderColor: 'rgba(34,232,255,0.2)' },
      crosshair: { mode: CrosshairMode.Normal },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#1fe08a',
      downColor: '#ff4d5e',
      borderVisible: false,
      wickUpColor: '#1fe08a',
      wickDownColor: '#ff4d5e',
    });

    const trendSeries = chart.addLineSeries({
      color: '#22e8ff',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lastValueVisible: false,
      priceLineVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    trendSeriesRef.current = trendSeries;

    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      trendSeriesRef.current = null;
    };
  }, []);

  // Cập nhật dữ liệu nến + marker sự kiện khi priceSeries/events đổi
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    if (!chart || !candleSeries || priceSeries.length === 0) return;

    candleSeries.setData(
      priceSeries.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })),
    );

    const timeIndex = buildTimeIndex(priceSeries);
    const markers = events
      .filter((ev) => timeIndex.has(ev.time))
      .map((ev) => ({
        time: ev.time,
        position: (ev.type === 'T' ? 'aboveBar' : 'belowBar') as 'aboveBar' | 'belowBar',
        color: ev.type === 'T' ? '#22e8ff' : '#ffb020',
        shape: 'circle' as const,
        text: ev.type,
      }))
      .sort((a, b) => (a.time > b.time ? 1 : -1));
    candleSeries.setMarkers(markers);

    const lastBar = priceSeries[priceSeries.length - 1];
    setLegendHtml(fmtLegend(lastBar));

    const handleCrosshair = (param: MouseEventParams) => {
      if (!param.time) {
        setLegendHtml(fmtLegend(lastBar));
        return;
      }
      const bar = priceSeries.find((b) => b.time === param.time);
      if (bar) setLegendHtml(fmtLegend(bar));
    };
    chart.subscribeCrosshairMove(handleCrosshair);
    return () => chart.unsubscribeCrosshairMove(handleCrosshair);
  }, [priceSeries, events]);

  // Trendline
  useEffect(() => {
    const trendSeries = trendSeriesRef.current;
    if (!trendSeries) return;
    trendSeries.setData(showTrendline ? trendline : []);
  }, [trendline, showTrendline]);

  // Vẽ zone (Demand Zone / Order Block) bằng div overlay quy đổi toạ độ thật
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const container = containerRef.current;
    if (!chart || !candleSeries || !container || priceSeries.length === 0) return;

    function draw() {
      if (!container) return;
      zoneElsRef.current.forEach((el) => el.remove());
      zoneElsRef.current = [];
      if (!showDemandZone) return;

      for (const zone of zones) {
        const y1 = candleSeries!.priceToCoordinate(zone.priceTop);
        const y2 = candleSeries!.priceToCoordinate(zone.priceBottom);
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
        zoneElsRef.current.push(div);
      }
    }

    const raf = requestAnimationFrame(() => requestAnimationFrame(draw));
    chart.timeScale().subscribeVisibleTimeRangeChange(draw);
    return () => {
      cancelAnimationFrame(raf);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(draw);
      zoneElsRef.current.forEach((el) => el.remove());
      zoneElsRef.current = [];
    };
  }, [zones, showDemandZone, priceSeries]);

  return (
    <div>
      <div ref={containerRef} className="relative w-full" style={{ height: 300 }} />
      <div className="mt-1.5 text-[11px] text-slate-400" dangerouslySetInnerHTML={{ __html: legendHtml }} />
    </div>
  );
}
