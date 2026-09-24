import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
} from 'lightweight-charts';
import type { OhlcBar, PriceZone, TrendlinePoint, ChartEvent, ComputedIndicatorBar, TradeScenario } from '../../../types/taVnIndex';
import type { TripleBarrierOccurrence } from '../../../hooks/elite10/useSmcDetector';
import { buildTimeIndex } from '../../../lib/taMath';

interface MainChartProps {
  priceSeries: OhlcBar[];
  zones: PriceZone[];
  trendline: TrendlinePoint[];
  events: ChartEvent[];
  showTrendline: boolean;
  showDemandZone: boolean;
  // Bo overlay chinh (theo yeu cau nguoi dung): SMA200 + EMA100/50/21 -
  // thay the SMA20/EMA12/26 cu (van giu o backend cho MACD, khong con
  // dung lam overlay chinh).
  computedIndicators?: ComputedIndicatorBar[] | null;
  showSma200?: boolean;
  showEma?: boolean; // BAT/TAT chung ca 3 duong EMA100/50/21
  showBollinger?: boolean;
  // MOI (2026-09-17, tich hop Time Engine + Confluence Engine len chart):
  // Trade Scenario (Buy Zone/Stop Loss/Take Profit) ve bang Price Lines,
  // risk flags danh dau canh bao tai nen hien tai.
  tradeScenario?: TradeScenario | null;
  riskFlags?: string[];
  // MOI (2026-09-24, tich hop Triple-Barrier len bieu do - thiet ke 2
  // lop): Lop 1 (markers) hien TAT CA occurrences cua pattern dang xem
  // (xanh=thang, do=thua). Lop 2 (TP/SL lines + vung to mau) CHI hien
  // dung 1 occurrence dang duoc chon.
  tripleBarrierOccurrences?: TripleBarrierOccurrence[] | null;
  selectedOccurrenceIndex?: number | null;
}

const ZONE_COLORS: Record<PriceZone['kind'], { bg: string; border: string }> = {
  demand_zone: { bg: 'rgba(31,224,138,0.12)', border: 'rgba(31,224,138,0.5)' },
  order_block_bullish: { bg: 'rgba(31,224,138,0.14)', border: 'rgba(31,224,138,0.6)' },
  order_block_bearish: { bg: 'rgba(255,77,94,0.14)', border: 'rgba(255,77,94,0.6)' },
  fvg: { bg: 'rgba(34,232,255,0.1)', border: 'rgba(34,232,255,0.5)' },
  triple_barrier_window: { bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.45)' },
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
export function MainChart({
  priceSeries, zones, trendline, events, showTrendline, showDemandZone,
  computedIndicators, showSma200, showEma, showBollinger,
  tradeScenario, riskFlags,
  tripleBarrierOccurrences, selectedOccurrenceIndex,
}: MainChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const trendSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const sma200SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema100SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema21SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbUpperSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const bbLowerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const zoneElsRef = useRef<HTMLDivElement[]>([]);
  const priceLinesRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>[]>([]);
  const tbPriceLinesRef = useRef<ReturnType<ISeriesApi<'Candlestick'>['createPriceLine']>[]>([]);
  const tbZoneElRef = useRef<HTMLDivElement | null>(null);
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

    // Bo overlay chinh moi (theo yeu cau nguoi dung): do dam=SMA200,
    // tim=EMA100, vang=EMA50, xanh la=EMA21.
    const sma200Series = chart.addLineSeries({ color: '#b71c1c', lineWidth: 2, lastValueVisible: false, priceLineVisible: false });
    const ema100Series = chart.addLineSeries({ color: '#9b59b6', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const ema50Series = chart.addLineSeries({ color: '#ffd60a', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const ema21Series = chart.addLineSeries({ color: '#1fe08a', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
    const bbUpperSeries = chart.addLineSeries({ color: 'rgba(150,150,255,0.5)', lineWidth: 1, lineStyle: LineStyle.Dotted, lastValueVisible: false, priceLineVisible: false });
    const bbLowerSeries = chart.addLineSeries({ color: 'rgba(150,150,255,0.5)', lineWidth: 1, lineStyle: LineStyle.Dotted, lastValueVisible: false, priceLineVisible: false });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    trendSeriesRef.current = trendSeries;
    sma200SeriesRef.current = sma200Series;
    ema100SeriesRef.current = ema100Series;
    ema50SeriesRef.current = ema50Series;
    ema21SeriesRef.current = ema21Series;
    bbUpperSeriesRef.current = bbUpperSeries;
    bbLowerSeriesRef.current = bbLowerSeries;

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
      sma200SeriesRef.current = null;
      ema100SeriesRef.current = null;
      ema50SeriesRef.current = null;
      ema21SeriesRef.current = null;
      bbUpperSeriesRef.current = null;
      bbLowerSeriesRef.current = null;
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
    const eventMarkers = (Array.isArray(events) ? events : [])
      .filter((ev) => timeIndex.has(ev.time))
      .map((ev) => ({
        time: ev.time,
        position: (ev.type === 'T' ? 'aboveBar' : 'belowBar') as 'aboveBar' | 'belowBar',
        color: ev.type === 'T' ? '#22e8ff' : ev.type === 'A' ? '#a78bfa' : '#ffb020',
        shape: 'circle' as const,
        text: ev.type,
      }));
    // MOI: canh bao risk flag (VD bull_trap_warning) tai nen HIEN TAI
    // (nen cuoi cung) - de nguoi dung thay ngay tren chart, khong can
    // chuyen sang doc panel rieng.
    const lastBarTime = priceSeries[priceSeries.length - 1]?.time;
    const riskMarker = riskFlags && riskFlags.length > 0 && lastBarTime
      ? [{ time: lastBarTime, position: 'aboveBar' as const, color: '#ff4d5e', shape: 'arrowDown' as const, text: '⚠' }]
      : [];
    const markers = [...eventMarkers, ...riskMarker].sort((a, b) => (a.time > b.time ? 1 : -1));

    // MOI (Triple-Barrier Lop 1 - tong quan): danh dau MOI occurrence
    // cua pattern dang xem, xanh=thang do=thua. GOP VAO CUNG mot lan
    // goi setMarkers() (goi 2 lan rieng se GHI DE nhau).
    const tbMarkers = (tripleBarrierOccurrences ?? [])
      .filter((occ) => timeIndex.has(occ.signalDate))
      .map((occ) => ({
        time: occ.signalDate,
        position: 'inBar' as const,
        color: occ.label === 1 ? '#1fe08a' : '#ff4d5e',
        shape: 'circle' as const,
        text: '',
      }));
    const allMarkers = [...markers, ...tbMarkers].sort((a, b) => (a.time > b.time ? 1 : -1));
    candleSeries.setMarkers(allMarkers);

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
  }, [priceSeries, events, riskFlags, tripleBarrierOccurrences]);

  // Trendline
  useEffect(() => {
    const trendSeries = trendSeriesRef.current;
    if (!trendSeries) return;
    trendSeries.setData(showTrendline ? trendline : []);
  }, [trendline, showTrendline]);

  // MOI (2026-09-17): Trade Scenario (Buy Zone/Stop Loss/Take Profit) ve
  // bang Price Lines ngay tren chart gia - nguoi dung thay TRUC TIEP vung
  // mua/ban ma khong can chuyen sang doc so lieu o panel AI Insight rieng.
  // Neu isEstimated=true (chua du du lieu that cho cua so hien tai), VAN
  // VE nhung voi mau nhat hon + nhan "(tham chieu ky thuat)" de khong gay
  // hieu lam day la khuyen nghi dua tren backtest that.
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    const lines = priceLinesRef.current;
    lines.forEach((l) => candleSeries.removePriceLine(l));
    lines.length = 0;

    if (!tradeScenario) return;
    const dim = tradeScenario.isEstimated;
    const suffix = dim ? ' (tham chiếu)' : '';

    lines.push(candleSeries.createPriceLine({
      price: tradeScenario.buyZone[0], color: dim ? 'rgba(34,232,255,0.4)' : '#22e8ff',
      lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Mua từ${suffix}`,
    }));
    lines.push(candleSeries.createPriceLine({
      price: tradeScenario.buyZone[1], color: dim ? 'rgba(34,232,255,0.4)' : '#22e8ff',
      lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `Mua đến${suffix}`,
    }));
    lines.push(candleSeries.createPriceLine({
      price: tradeScenario.stopLoss, color: dim ? 'rgba(255,77,94,0.4)' : '#ff4d5e',
      lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `Stop loss${suffix}`,
    }));
    lines.push(candleSeries.createPriceLine({
      price: tradeScenario.takeProfit[0], color: dim ? 'rgba(31,224,138,0.4)' : '#1fe08a',
      lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `Chốt lời 1${suffix}`,
    }));
    lines.push(candleSeries.createPriceLine({
      price: tradeScenario.takeProfit[1], color: dim ? 'rgba(31,224,138,0.4)' : '#1fe08a',
      lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `Chốt lời 2${suffix}`,
    }));

    return () => { lines.forEach((l) => candleSeries.removePriceLine(l)); lines.length = 0; };
  }, [tradeScenario]);

  // MOI (Triple-Barrier Lop 2 - chi tiet): khi nguoi dung CHON 1
  // occurrence cu the, ve DUNG 2 duong TP/SL (ref RIENG, khong dam vao
  // priceLinesRef cua tradeScenario) + 1 vung to mau (tai su dung ky
  // thuat div-overlay giong zones nhung DOC LAP).
  useEffect(() => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const container = containerRef.current;

    const tbLines = tbPriceLinesRef.current;
    tbLines.forEach((l) => candleSeries?.removePriceLine(l));
    tbLines.length = 0;
    tbZoneElRef.current?.remove();
    tbZoneElRef.current = null;

    if (!chart || !candleSeries || !container) return;
    if (selectedOccurrenceIndex === null || selectedOccurrenceIndex === undefined) return;
    const occ = (tripleBarrierOccurrences ?? [])[selectedOccurrenceIndex];
    if (!occ) return;

    const resultColor = occ.label === 1 ? '#1fe08a' : '#ff4d5e';
    tbLines.push(candleSeries.createPriceLine({
      price: occ.tpBarrier, color: '#1fe08a', lineWidth: 2, lineStyle: LineStyle.Dashed,
      axisLabelVisible: true, title: 'Chốt lời (Triple-Barrier)',
    }));
    tbLines.push(candleSeries.createPriceLine({
      price: occ.slBarrier, color: '#ff4d5e', lineWidth: 2, lineStyle: LineStyle.Dashed,
      axisLabelVisible: true, title: 'Cắt lỗ (Triple-Barrier)',
    }));

    function drawZone() {
      tbZoneElRef.current?.remove();
      tbZoneElRef.current = null;
      if (!container || !chart || !candleSeries) return;
      const y1 = candleSeries.priceToCoordinate(occ.tpBarrier);
      const y2 = candleSeries.priceToCoordinate(occ.slBarrier);
      const x1 = chart.timeScale().timeToCoordinate(occ.signalDate as never);
      const x2 = chart.timeScale().timeToCoordinate(occ.resolvedDate as never);
      if (y1 === null || y2 === null || x1 === null || x2 === null) return;

      const div = document.createElement('div');
      div.style.position = 'absolute';
      div.style.pointerEvents = 'none';
      div.style.left = `${Math.min(x1, x2)}px`;
      div.style.top = `${Math.min(y1, y2)}px`;
      div.style.width = `${Math.max(2, Math.abs(x2 - x1))}px`;
      div.style.height = `${Math.max(2, Math.abs(y2 - y1))}px`;
      div.style.background = 'rgba(168,85,247,0.08)';
      div.style.border = `1.5px solid ${resultColor}`;
      div.style.borderRadius = '2px';
      div.title = `${occ.signalDate} → ${occ.resolvedDate} · ${occ.barrierHit === 'take_profit' ? 'Chạm chốt lời' : occ.barrierHit === 'stop_loss' ? 'Chạm cắt lỗ' : 'Hết hạn thời gian'} · ${occ.actualReturnPct >= 0 ? '+' : ''}${occ.actualReturnPct.toFixed(1)}%`;
      container.appendChild(div);
      tbZoneElRef.current = div;
    }

    const raf = requestAnimationFrame(() => requestAnimationFrame(drawZone));
    chart.timeScale().subscribeVisibleTimeRangeChange(drawZone);
    return () => {
      cancelAnimationFrame(raf);
      chart.timeScale().unsubscribeVisibleTimeRangeChange(drawZone);
      tbLines.forEach((l) => candleSeries.removePriceLine(l));
      tbLines.length = 0;
      tbZoneElRef.current?.remove();
      tbZoneElRef.current = null;
    };
  }, [tripleBarrierOccurrences, selectedOccurrenceIndex]);

  // Bo overlay chinh moi (theo yeu cau nguoi dung): SMA200/EMA100/50/21
  // - du lieu THAT tu computedIndicators (tinh boi api/stock.py qua
  // vnstock). Loc bo diem null - lightweight-charts khong chap nhan null.
  useEffect(() => {
    const sma200Series = sma200SeriesRef.current;
    const ema100Series = ema100SeriesRef.current;
    const ema50Series = ema50SeriesRef.current;
    const ema21Series = ema21SeriesRef.current;
    const bbUpperSeries = bbUpperSeriesRef.current;
    const bbLowerSeries = bbLowerSeriesRef.current;
    if (!sma200Series || !ema100Series || !ema50Series || !ema21Series || !bbUpperSeries || !bbLowerSeries) return;

    const rows = computedIndicators ?? [];
    sma200Series.setData(showSma200 ? rows.filter((r) => r.sma200 !== null).map((r) => ({ time: r.time, value: r.sma200 as number })) : []);
    ema100Series.setData(showEma ? rows.filter((r) => r.ema100 !== null).map((r) => ({ time: r.time, value: r.ema100 as number })) : []);
    ema50Series.setData(showEma ? rows.filter((r) => r.ema50 !== null).map((r) => ({ time: r.time, value: r.ema50 as number })) : []);
    ema21Series.setData(showEma ? rows.filter((r) => r.ema21 !== null).map((r) => ({ time: r.time, value: r.ema21 as number })) : []);
    bbUpperSeries.setData(showBollinger ? rows.filter((r) => r.bbUpper !== null).map((r) => ({ time: r.time, value: r.bbUpper as number })) : []);
    bbLowerSeries.setData(showBollinger ? rows.filter((r) => r.bbLower !== null).map((r) => ({ time: r.time, value: r.bbLower as number })) : []);
  }, [computedIndicators, showSma200, showEma, showBollinger]);

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
