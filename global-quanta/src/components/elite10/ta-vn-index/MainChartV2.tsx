import { useMemo } from 'react';
import type { LineData, SeriesMarker, Time, WhitespaceData } from 'lightweight-charts';
import type { OhlcBar, PriceZone, TrendlinePoint, ChartEvent, ComputedIndicatorBar, TradeScenario } from '../../../types/taVnIndex';
import type { TripleBarrierOccurrence } from '../../../hooks/elite10/useSmcDetector';
import type { FanChartPoint } from '../../../hooks/elite10/useMsGarch';
import { buildTimeIndex } from '../../../lib/taMath';
import { ChartWrapper } from './chart/ChartContainer';
import { CandlestickSeries } from './chart/CandlestickSeries';
import { LineSeries } from './chart/LineSeries';
import { CrosshairLegend } from './chart/CrosshairLegend';
import { TradeScenarioLines } from './chart/TradeScenarioLines';
import { TripleBarrierZone } from './chart/TripleBarrierZone';
import { PriceZones } from './chart/PriceZones';
import { ForecastDivider } from './chart/ForecastDivider';
import { WyckoffPhaseZones } from './chart/WyckoffPhaseZones';
import { ElliottWaveSeries } from './chart/ElliottWaveSeries';
import { VwapSeries } from './chart/VwapSeries';
import { SuperTrendSeries } from './chart/SuperTrendSeries';
import { FibonacciLevels } from './chart/FibonacciLevels';
import { VolumeProfileZones } from './chart/VolumeProfileZones';
import type { WyckoffSchematic } from '../../../hooks/elite10/useSmcDetector';
import type { ElliottData } from '../../../types/taVnIndex';

/**
 * MainChart - VIET LAI HOAN TOAN (Huong B, trietde) theo kien truc
 * component-based chinh thuc cua TradingView (xem cac file trong thu
 * muc ./chart/) - thay the toan bo "sieu useEffect" cu, giai quyet
 * DUNG GOC RE bug "Object is disposed" (thu tu cleanup khong kiem soat
 * duoc giua nhieu useEffect chung 1 component).
 *
 * Props giu NGUYEN 100% giao dien cu (khong doi gi ben ngoai) - chi
 * doi kien truc BEN TRONG. TaVnIndexPanel.tsx khong can sua gi.
 */
interface MainChartProps {
  priceSeries: OhlcBar[];
  zones: PriceZone[];
  trendline: TrendlinePoint[];
  events: ChartEvent[];
  showTrendline: boolean;
  showDemandZone: boolean;
  computedIndicators?: ComputedIndicatorBar[] | null;
  showSma200?: boolean;
  showEma?: boolean;
  showBollinger?: boolean;
  showWyckoff?: boolean;
  showElliott?: boolean;
  showVwap?: boolean;
  showSuperTrend?: boolean;
  showFibonacci?: boolean;
  showVolumeProfile?: boolean;
  showMsGarch?: boolean;
  showEvents?: boolean;
  showRiskFlags?: boolean;
  wyckoffReal?: WyckoffSchematic | null;
  elliott?: ElliottData | null;
  tradeScenario?: TradeScenario | null;
  riskFlags?: string[];
  tripleBarrierOccurrences?: TripleBarrierOccurrence[] | null;
  selectedOccurrenceIndex?: number | null;
  fanChart?: FanChartPoint[] | null;
}

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
function toDateStrLocal(dt: Date): string {
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function MainChart(props: MainChartProps) {
  const {
    priceSeries, zones, trendline, events, showTrendline, showDemandZone,
    computedIndicators, showSma200, showEma, showBollinger,
    showWyckoff, showElliott, showVwap, showSuperTrend, showFibonacci, showVolumeProfile,
    showMsGarch, showEvents, showRiskFlags,
    wyckoffReal, elliott,
    tradeScenario, riskFlags,
    tripleBarrierOccurrences, selectedOccurrenceIndex,
    fanChart,
  } = props;

  const markers = useMemo<SeriesMarker<Time>[]>(() => {
    const timeIndex = buildTimeIndex(priceSeries);
    const eventMarkers = showEvents && Array.isArray(events)
      ? events
          .filter((ev) => timeIndex.has(ev.time))
          .map((ev) => ({
            time: ev.time as unknown as Time,
            position: (ev.type === 'T' ? 'aboveBar' : 'belowBar') as 'aboveBar' | 'belowBar',
            color: ev.type === 'T' ? '#22e8ff' : ev.type === 'A' ? '#a78bfa' : '#ffb020',
            shape: 'circle' as const,
            text: ev.type,
          }))
      : [];
    const lastBarTime = priceSeries[priceSeries.length - 1]?.time;
    const riskMarker = showRiskFlags && riskFlags && riskFlags.length > 0 && lastBarTime
      ? [{ time: lastBarTime as unknown as Time, position: 'aboveBar' as const, color: '#ff4d5e', shape: 'arrowDown' as const, text: '⚠' }]
      : [];
    const tbMarkers = (tripleBarrierOccurrences ?? [])
      .filter((occ) => timeIndex.has(occ.signalDate))
      .map((occ) => ({
        time: occ.signalDate as unknown as Time,
        position: (occ.label === 1 ? 'belowBar' : 'aboveBar') as 'aboveBar' | 'belowBar',
        color: occ.label === 1 ? '#1fe08a' : '#ff4d5e',
        shape: (occ.label === 1 ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
        text: occ.label === 1 ? '✓' : '✗',
      }));
    return [...eventMarkers, ...riskMarker, ...tbMarkers].sort((a, b) => (a.time > b.time ? 1 : -1));
  }, [events, riskFlags, priceSeries, tripleBarrierOccurrences, showEvents, showRiskFlags]);

  const trendlineData = useMemo<(LineData | WhitespaceData)[]>(
    () => (showTrendline ? (trendline as unknown as LineData[]) : []),
    [showTrendline, trendline],
  );

  const rows = computedIndicators ?? [];
  const sma200Data = useMemo<(LineData | WhitespaceData)[]>(
    () => (showSma200 ? rows.filter((r) => r.sma200 !== null).map((r) => ({ time: r.time as unknown as Time, value: r.sma200 as number })) : []),
    [rows, showSma200],
  );
  const ema100Data = useMemo<(LineData | WhitespaceData)[]>(
    () => (showEma ? rows.filter((r) => r.ema100 !== null).map((r) => ({ time: r.time as unknown as Time, value: r.ema100 as number })) : []),
    [rows, showEma],
  );
  const ema50Data = useMemo<(LineData | WhitespaceData)[]>(
    () => (showEma ? rows.filter((r) => r.ema50 !== null).map((r) => ({ time: r.time as unknown as Time, value: r.ema50 as number })) : []),
    [rows, showEma],
  );
  const ema21Data = useMemo<(LineData | WhitespaceData)[]>(
    () => (showEma ? rows.filter((r) => r.ema21 !== null).map((r) => ({ time: r.time as unknown as Time, value: r.ema21 as number })) : []),
    [rows, showEma],
  );
  const bbUpperData = useMemo<(LineData | WhitespaceData)[]>(
    () => (showBollinger ? rows.filter((r) => r.bbUpper !== null).map((r) => ({ time: r.time as unknown as Time, value: r.bbUpper as number })) : []),
    [rows, showBollinger],
  );
  const bbLowerData = useMemo<(LineData | WhitespaceData)[]>(
    () => (showBollinger ? rows.filter((r) => r.bbLower !== null).map((r) => ({ time: r.time as unknown as Time, value: r.bbLower as number })) : []),
    [rows, showBollinger],
  );

  const { p10Data, p50Data, p90Data } = useMemo(() => {
    if (!showMsGarch || !fanChart || fanChart.length === 0 || priceSeries.length === 0) {
      return { p10Data: [] as (LineData | WhitespaceData)[], p50Data: [] as (LineData | WhitespaceData)[], p90Data: [] as (LineData | WhitespaceData)[] };
    }
    try {
      const lastBar = priceSeries[priceSeries.length - 1];
      const [y, m, d] = lastBar.time.split('-').map(Number);
      if (!y || !m || !d) throw new Error(`Ngày nến cuối không hợp lệ: ${lastBar.time}`);
      const lastDate = new Date(y, m - 1, d);

      // FIX CHUẨN HÓA ĐƠN VỊ GIÁ DỰ BÁO MS-GARCH FAN CHART:
      const samplePrice = lastBar.close;
      const isSeriesKvnd = samplePrice > 0 && samplePrice < 1000;
      const sampleFanPrice = fanChart[0]?.p50 ?? 0;
      const isFanVnd = sampleFanPrice > 1000;
      const fanScale = (isSeriesKvnd && isFanVnd) ? 0.001 : (!isSeriesKvnd && !isFanVnd && sampleFanPrice > 0 && sampleFanPrice < 1000) ? 1000 : 1;

      const anchor = { time: lastBar.time as unknown as Time, value: lastBar.close };
      return {
        p10Data: [anchor, ...fanChart.map((p) => ({ time: toDateStrLocal(addBusinessDays(lastDate, p.day)) as unknown as Time, value: p.p10 * fanScale }))],
        p50Data: [anchor, ...fanChart.map((p) => ({ time: toDateStrLocal(addBusinessDays(lastDate, p.day)) as unknown as Time, value: p.p50 * fanScale }))],
        p90Data: [anchor, ...fanChart.map((p) => ({ time: toDateStrLocal(addBusinessDays(lastDate, p.day)) as unknown as Time, value: p.p90 * fanScale }))],
      };
    } catch (err) {
      console.error('[MainChart] Không tính được fan chart MS-GARCH (bỏ qua):', err);
      return { p10Data: [] as (LineData | WhitespaceData)[], p50Data: [] as (LineData | WhitespaceData)[], p90Data: [] as (LineData | WhitespaceData)[] };
    }
  }, [fanChart, priceSeries, showMsGarch]);

  return (
    <ChartWrapper height={560}>
      <CandlestickSeries data={priceSeries} markers={markers}>
        <TradeScenarioLines tradeScenario={tradeScenario} samplePrice={priceSeries[priceSeries.length - 1]?.close} />
        <TripleBarrierZone priceSeries={priceSeries} occurrences={tripleBarrierOccurrences} selectedIndex={selectedOccurrenceIndex} />
        <PriceZones priceSeries={priceSeries} zones={zones} showDemandZone={showDemandZone} />
        <ForecastDivider priceSeries={priceSeries} hasForecast={Boolean(showMsGarch && fanChart && fanChart.length > 0)} />
        <WyckoffPhaseZones priceSeries={priceSeries} wyckoffReal={wyckoffReal} showWyckoff={Boolean(showWyckoff)} />
        <ElliottWaveSeries priceSeries={priceSeries} elliott={elliott} showElliott={Boolean(showElliott)} />
        <VwapSeries priceSeries={priceSeries} showVwap={Boolean(showVwap)} />
        <SuperTrendSeries priceSeries={priceSeries} showSuperTrend={Boolean(showSuperTrend)} />
        <FibonacciLevels priceSeries={priceSeries} showFibonacci={Boolean(showFibonacci)} />
        <VolumeProfileZones priceSeries={priceSeries} showVolumeProfile={Boolean(showVolumeProfile)} />
      </CandlestickSeries>

      <LineSeries data={trendlineData} options={{ color: '#22e8ff', lineWidth: 2 }} />
      <LineSeries data={sma200Data} options={{ color: '#b71c1c', lineWidth: 2 }} />
      <LineSeries data={ema100Data} options={{ color: '#9b59b6', lineWidth: 1 }} />
      <LineSeries data={ema50Data} options={{ color: '#ffd60a', lineWidth: 1 }} />
      <LineSeries data={ema21Data} options={{ color: '#1fe08a', lineWidth: 1 }} />
      <LineSeries data={bbUpperData} options={{ color: 'rgba(150,150,255,0.5)' }} />
      <LineSeries data={bbLowerData} options={{ color: 'rgba(150,150,255,0.5)' }} />
      <LineSeries data={p10Data} options={{ color: 'rgba(255,77,94,0.7)', lineWidth: 1 }} />
      <LineSeries data={p50Data} options={{ color: 'rgba(251,191,36,0.9)', lineWidth: 2 }} />
      <LineSeries data={p90Data} options={{ color: 'rgba(31,224,138,0.7)', lineWidth: 1 }} />

      <CrosshairLegend priceSeries={priceSeries} />
    </ChartWrapper>
  );
}
