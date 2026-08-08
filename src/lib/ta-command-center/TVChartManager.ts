// TVChartManager - boc TradingView Lightweight Charts v4.x
import {
  createChart, IChartApi, ISeriesApi,
  CandlestickData, HistogramData, UTCTimestamp, SeriesMarker, Time
} from "lightweight-charts";
import type { OhlcvBar } from "./types";

function toTime(dateStr: string): UTCTimestamp {
  return (new Date(dateStr + "T00:00:00Z").getTime() / 1000) as UTCTimestamp;
}

export interface ChartMarkerInput {
  time: string;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle";
  text: string;
}

export class TVChartManager {
  private chart: IChartApi;
  private candleSeries: ISeriesApi<"Candlestick">;
  private volumeSeries: ISeriesApi<"Histogram">;
  private currentBars: OhlcvBar[] = [];

  constructor(container: HTMLElement, bars: OhlcvBar[]) {
    this.chart = createChart(container, {
      width: container.clientWidth,
      height: 360,
      layout: { background: { color: "transparent" }, textColor: "#94a3b8", fontSize: 10 },
      grid: { vertLines: { color: "rgba(148,163,184,0.06)" }, horzLines: { color: "rgba(148,163,184,0.06)" } },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.15)" },
      timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: false },
    });

    this.candleSeries = this.chart.addCandlestickSeries({
      upColor: "#10b981", downColor: "#ef4444",
      borderUpColor: "#10b981", borderDownColor: "#ef4444",
      wickUpColor: "#10b981", wickDownColor: "#ef4444",
    });

    this.volumeSeries = this.chart.addHistogramSeries({
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });
    this.volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    this.setData(bars);
  }

  setData(bars: OhlcvBar[]): void {
    this.currentBars = bars;
    const candleData: CandlestickData[] = bars.map((b) => ({
      time: toTime(b.date), open: b.open, high: b.high, low: b.low, close: b.close,
    }));
    const volData: HistogramData[] = bars.map((b) => ({
      time: toTime(b.date), value: b.volume,
      color: b.close >= b.open ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)",
    }));
    this.candleSeries.setData(candleData);
    this.volumeSeries.setData(volData);
    this.chart.timeScale().fitContent();
  }

  setMarkers(markers: ChartMarkerInput[]): void {
    const sorted = [...markers].sort((a, b) => a.time.localeCompare(b.time));
    const seriesMarkers: SeriesMarker<Time>[] = sorted.map((m) => ({
      time: toTime(m.time), position: m.position, color: m.color, shape: m.shape, text: m.text,
    }));
    this.candleSeries.setMarkers(seriesMarkers);
  }

  resize(width: number, height: number = 360): void {
    this.chart.resize(width, height);
  }

  priceToPixel(price: number): number | null {
    return this.candleSeries.priceToCoordinate(price);
  }

  pixelToPrice(y: number): number | null {
    return this.candleSeries.coordinateToPrice(y);
  }

  timeToPixel(dateStr: string): number | null {
    const direct = this.chart.timeScale().timeToCoordinate(toTime(dateStr));
    if (direct !== null) return direct;

    if (this.currentBars.length === 0) return null;
    const targetTime = new Date(dateStr + "T00:00:00Z").getTime();
    let nearestBar: OhlcvBar | null = null;
    for (const bar of this.currentBars) {
      const barTime = new Date(bar.date + "T00:00:00Z").getTime();
      if (barTime <= targetTime) nearestBar = bar;
      else break;
    }
    if (!nearestBar) nearestBar = this.currentBars[0];
    return this.chart.timeScale().timeToCoordinate(toTime(nearestBar.date));
  }

  pixelToDate(x: number): string | null {
    const time = this.chart.timeScale().coordinateToTime(x);
    if (time === null) return null;
    return new Date((time as number) * 1000).toISOString().slice(0, 10);
  }

  onVisibleRangeChange(cb: () => void): () => void {
    this.chart.timeScale().subscribeVisibleTimeRangeChange(cb);
    return () => this.chart.timeScale().unsubscribeVisibleTimeRangeChange(cb);
  }

  destroy(): void { this.chart.remove(); }
}
