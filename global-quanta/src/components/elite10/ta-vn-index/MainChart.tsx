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
import type { FanChartPoint } from '../../../hooks/elite10/useMsGarch';
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
  // MOI (Muc F, Giai doan 5): fan chart MS-GARCH - dai xac suat p10/
  // p50/p90 mo rong ra TUONG LAI (sau ngay cuoi cung co du lieu that).
  fanChart?: FanChartPoint[] | null;
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
  fanChart,
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
  const p10SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const p50SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const p90SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const [legendHtml, setLegendHtml] = useState('');

  // Khởi tạo chart 1 lần
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      height: 560,
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

    // MOI (Muc F, Giai doan 5): 3 duong fan chart MS-GARCH - p10 (do
    // nhat, bi quan), p50 (vang, trung vi), p90 (xanh nhat, lac quan) -
    // mo rong ra TUONG LAI sau ngay cuoi cung.
    const p10Series = chart.addLineSeries({ color: 'rgba(255,77,94,0.7)', lineWidth: 1, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false });
    const p50Series = chart.addLineSeries({ color: 'rgba(251,191,36,0.9)', lineWidth: 2, lineStyle: LineStyle.Solid, lastValueVisible: false, priceLineVisible: false });
    const p90Series = chart.addLineSeries({ color: 'rgba(31,224,138,0.7)', lineWidth: 1, lineStyle: LineStyle.Dashed, lastValueVisible: false, priceLineVisible: false });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    trendSeriesRef.current = trendSeries;
    sma200SeriesRef.current = sma200Series;
    ema100SeriesRef.current = ema100Series;
    ema50SeriesRef.current = ema50Series;
    ema21SeriesRef.current = ema21Series;
    bbUpperSeriesRef.current = bbUpperSeries;
    bbLowerSeriesRef.current = bbLowerSeries;
    p10SeriesRef.current = p10Series;
    p50SeriesRef.current = p50Series;
    p90SeriesRef.current = p90Series;

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
      p10SeriesRef.current = null;
      p50SeriesRef.current = null;
      p90SeriesRef.current = null;
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
    // NANG CAP (2026-09-24, ro rang hon): doi tu cham tron nho sang mui
    // ten lon (arrowUp/arrowDown), aboveBar/belowBar de KHONG bi de len
    // than nen (khac voi 'inBar' truoc do, kho thay giua nhieu nen).
    const tbMarkers = (tripleBarrierOccurrences ?? [])
      .filter((occ) => timeIndex.has(occ.signalDate))
      .map((occ) => ({
        time: occ.signalDate,
        position: (occ.label === 1 ? 'belowBar' : 'aboveBar') as 'aboveBar' | 'belowBar',
        color: occ.label === 1 ? '#1fe08a' : '#ff4d5e',
        shape: (occ.label === 1 ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
        text: occ.label === 1 ? '✓' : '✗',
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
    return () => {
      try { chart.unsubscribeCrosshairMove(handleCrosshair); } catch { /* chart da dispose, bo qua */ }
    };
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

    return () => {
      // FIX (bug "Object is disposed"): React khong dam bao chart.remove()
      // (cleanup cua useEffect khoi tao) chay SAU CUNG khi unmount - neu
      // no chay TRUOC cleanup nay, removePriceLine se goi tren 1 series
      // DA DISPOSE. Boc try/catch de an toan bat ke thu tu cleanup thuc te.
      try { lines.forEach((l) => candleSeries.removePriceLine(l)); } catch { /* chart da dispose, bo qua */ }
      lines.length = 0;
    };
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

    // NANG CAP (2026-09-24): TU DONG cuon/zoom chart toi dung vung
    // tin hieu - truoc do chart khong di chuyen, neu tin hieu nam
    // ngoai vung dang hien thi thi nguoi dung KHONG THAY GI du da ve
    // dung. Tim index cua signalDate/resolvedDate trong priceSeries,
    // zoom voi padding 15 nen moi ben de co du boi canh gia xung quanh.
    const signalIdx = priceSeries.findIndex((b) => b.time === occ.signalDate);
    const resolvedIdx = priceSeries.findIndex((b) => b.time === occ.resolvedDate);
    if (signalIdx >= 0 && resolvedIdx >= 0) {
      chart.timeScale().setVisibleLogicalRange({
        from: Math.max(0, signalIdx - 15),
        to: Math.min(priceSeries.length - 1, resolvedIdx + 15),
      });
    }

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
      // FIX (bug "Object is disposed"): subscribeVisibleTimeRangeChange
      // co the goi ham nay TRUC TIEP (khong qua requestAnimationFrame),
      // nen co "cancelled" khong chan het duoc - boc ca THAN HAM trong
      // try/catch de an toan tuyet doi voi moi truong hop chart/series
      // da bi dispose truoc do.
      try {
        tbZoneElRef.current?.remove();
        tbZoneElRef.current = null;
        if (!container || !chart || !candleSeries) return;
        const y1 = candleSeries.priceToCoordinate(occ.tpBarrier);
        const y2 = candleSeries.priceToCoordinate(occ.slBarrier);
        const x1 = chart.timeScale().timeToCoordinate(occ.signalDate as never);
        const x2 = chart.timeScale().timeToCoordinate(occ.resolvedDate as never);
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

        // NANG CAP: nhan KET QUA hien SAN (khong chi hover) - de nhin la
        // hieu ngay, khong can ru chuot vao vung nho tren mobile.
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
        tbZoneElRef.current = div;
      } catch {
        // chart/series da dispose (unmount/chuyen ma dung luc nay) -
        // an toan bo qua, khong lam sap toan bo ung dung.
      }
    }

    // FIX (bug "Object is disposed"): "requestAnimationFrame(() =>
    // requestAnimationFrame(fn))" - cancelAnimationFrame(raf) CHI huy
    // duoc OUTER callback, khong huy duoc INNER neu outer da chay truoc
    // khi cleanup goi. Neu component unmount/chart bi remove() dung
    // luc do, inner rAF van chay drawZone() tren series/chart DA
    // DISPOSED -> loi. Sua bang co "cancelled" kiem tra TRUOC MOI lan
    // thuc thi, dam bao khong bao gio chay sau khi cleanup.
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => { if (!cancelled) drawZone(); });
    });
    chart.timeScale().subscribeVisibleTimeRangeChange(drawZone);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      try { chart.timeScale().unsubscribeVisibleTimeRangeChange(drawZone); } catch { /* chart da dispose, bo qua */ }
      try { tbLines.forEach((l) => candleSeries.removePriceLine(l)); } catch { /* chart da dispose, bo qua */ }
      tbLines.length = 0;
      tbZoneElRef.current?.remove();
      tbZoneElRef.current = null;
    };
  }, [tripleBarrierOccurrences, selectedOccurrenceIndex]);

  // MOI (Muc F, Giai doan 5): ve fan chart MS-GARCH - 3 duong p10/p50/
  // p90 MO RONG ra tuong lai tu ngay cuoi cung co du lieu that. Tinh
  // ngay tuong lai bo qua T7/CN (giong lich giao dich chung khoan VN),
  // don gian hoa - khong xu ly nghi le.
  useEffect(() => {
    const p10Series = p10SeriesRef.current, p50Series = p50SeriesRef.current, p90Series = p90SeriesRef.current;
    if (!p10Series || !p50Series || !p90Series) return;

    if (!fanChart || fanChart.length === 0 || priceSeries.length === 0) {
      p10Series.setData([]); p50Series.setData([]); p90Series.setData([]);
      return;
    }

    // FIX (bug hoi quy da phat hien): "new Date(lastBar.time)" voi
    // lastBar.time dang "YYYY-MM-DD" bi trinh duyet PARSE THEO UTC,
    // VA truoc do "toDateStr" dung toISOString() (cung LUON tra ve UTC)
    // - 2 loi timezone cong don co the lam ngay bi lech/trung lap,
    // khien setData() cua lightweight-charts nem loi (doi hoi time
    // TANG DAN nghiem ngat) va LAM SAP TOAN BO CHART (khong chi 3
    // duong fan chart, vi cung 1 chart instance). Sua bang cach PARSE
    // VA FORMAT THU CONG theo LOCAL time (khong qua Date UTC methods),
    // VA BOC TOAN BO trong try/catch de fan chart loi KHONG BAO GIO
    // lam sap chart chinh (chi bo qua fan chart, candlestick van hien
    // thi binh thuong).
    try {
      const lastBar = priceSeries[priceSeries.length - 1];
      const [y, m, d] = lastBar.time.split('-').map(Number);
      if (!y || !m || !d) throw new Error(`Ngày nến cuối không hợp lệ: ${lastBar.time}`);
      const lastDate = new Date(y, m - 1, d); // LOCAL time, khong qua UTC

      function addBusinessDays(start: Date, n: number): Date {
        const dt = new Date(start.getTime());
        let added = 0;
        while (added < n) {
          dt.setDate(dt.getDate() + 1);
          const dow = dt.getDay();
          if (dow !== 0 && dow !== 6) added++;
        }
        return dt;
      }
      function toDateStr(dt: Date): string {
        // Format LOCAL (khong dung toISOString - luon tra ve UTC).
        const yy = dt.getFullYear();
        const mm = String(dt.getMonth() + 1).padStart(2, '0');
        const dd = String(dt.getDate()).padStart(2, '0');
        return `${yy}-${mm}-${dd}`;
      }

      const anchor = { time: lastBar.time as never, value: lastBar.close };
      const p10Data = [anchor, ...fanChart.map((p) => ({ time: toDateStr(addBusinessDays(lastDate, p.day)) as never, value: p.p10 }))];
      const p50Data = [anchor, ...fanChart.map((p) => ({ time: toDateStr(addBusinessDays(lastDate, p.day)) as never, value: p.p50 }))];
      const p90Data = [anchor, ...fanChart.map((p) => ({ time: toDateStr(addBusinessDays(lastDate, p.day)) as never, value: p.p90 }))];

      p10Series.setData(p10Data);
      p50Series.setData(p50Data);
      p90Series.setData(p90Data);
    } catch (err) {
      console.error('[MainChart] Không vẽ được fan chart MS-GARCH (bỏ qua, chart chính vẫn hiển thị bình thường):', err);
      p10Series.setData([]); p50Series.setData([]); p90Series.setData([]);
    }
  }, [fanChart, priceSeries]);

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
      // FIX (bug "Object is disposed"): subscribeVisibleTimeRangeChange
      // co the goi ham nay TRUC TIEP (khong qua requestAnimationFrame),
      // boc ca than ham de an toan tuyet doi.
      try {
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
      } catch {
        // chart/series da dispose - an toan bo qua.
      }
    }

    // FIX (bug "Object is disposed") - xem giai thich chi tiet o useEffect
    // Triple-Barrier phia tren: inner requestAnimationFrame khong the
    // cancel qua cancelAnimationFrame(raf) neu outer da chay truoc do.
    let cancelled = false;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => { if (!cancelled) draw(); });
    });
    chart.timeScale().subscribeVisibleTimeRangeChange(draw);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      try { chart.timeScale().unsubscribeVisibleTimeRangeChange(draw); } catch { /* chart da dispose, bo qua */ }
      zoneElsRef.current.forEach((el) => el.remove());
      zoneElsRef.current = [];
    };
  }, [zones, showDemandZone, priceSeries]);

  return (
    <div>
      <div ref={containerRef} className="relative w-full" style={{ height: 560 }} />
      <div className="mt-1.5 text-[11px] text-slate-400" dangerouslySetInnerHTML={{ __html: legendHtml }} />
    </div>
  );
}
