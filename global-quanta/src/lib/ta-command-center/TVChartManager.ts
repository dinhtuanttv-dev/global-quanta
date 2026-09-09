// TVChartManager - boc TradingView Lightweight Charts v4.x
import {
  createChart, IChartApi, ISeriesApi,
  CandlestickData, HistogramData, UTCTimestamp, SeriesMarker, Time
} from "lightweight-charts";
import type { OhlcvBar } from "./types";

// ĐÃ SỬA — LỖI CŨ: luôn nối "T00:00:00Z" bất kể dateStr đã có giờ:phút hay
// chưa. Với nến khung H4/M1 (dateStr dạng "2026-09-09T14:00:00"), nối
// thêm tạo chuỗi KHÔNG HỢP LỆ ("2026-09-09T14:00:00T00:00:00Z") -> Date
// trả về Invalid Date -> getTime() trả về NaN -> toàn bộ nến khung
// intraday không hiển thị được hoặc hiển thị sai vị trí. Giờ kiểm tra: đã
// có "T" (đã có giờ) thì dùng trực tiếp, chỉ thêm hậu tố "Z" nếu thiếu;
// chỉ có ngày mới nối "T00:00:00Z" như hành vi cũ.
function toTime(dateStr: string): UTCTimestamp {
  const hasTime = dateStr.includes("T");
  const isoStr = hasTime ? (dateStr.endsWith("Z") ? dateStr : `${dateStr}Z`) : `${dateStr}T00:00:00Z`;
  return (new Date(isoStr).getTime() / 1000) as UTCTimestamp;
}

export interface ChartMarkerInput {
  time: string;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle";
  text: string;
}

export interface TVChartManagerOptions {
  // ĐÃ THÊM: cho phép TVChartPanel truyền timeframe hiện tại để bật hiển
  // thị giờ:phút trên trục thời gian khi xem khung intraday (H4/M1) —
  // trước đây "timeVisible: false" cố định, khiến các nến trong cùng 1
  // ngày không phân biệt được theo giờ trên trục X.
  timeVisible?: boolean;
}

export class TVChartManager {
  private chart: IChartApi;
  private candleSeries: ISeriesApi<"Candlestick">;
  private volumeSeries: ISeriesApi<"Histogram">;
  private currentBars: OhlcvBar[] = [];

  constructor(container: HTMLElement, bars: OhlcvBar[], options?: TVChartManagerOptions) {
    // ĐÃ SỬA — LỖI CŨ: chiều cao chart luôn CỐ ĐỊNH 360px, hoàn toàn không
    // liên quan tới CSS height thật của khung chứa (container). Việc chỉnh
    // CSS height cho div bọc ngoài (VD "70vh" để chiếm 70% màn hình) trước
    // đây KHÔNG có tác dụng gì lên chart thật — chart vẫn luôn chỉ cao
    // 360px. Giờ lấy đúng container.clientHeight thật tại thời điểm khởi
    // tạo (dự phòng 360 chỉ khi container chưa có kích thước, ví dụ đang
    // ẩn/chưa layout xong).
    const initialHeight = container.clientHeight > 0 ? container.clientHeight : 360;
    this.chart = createChart(container, {
      width: container.clientWidth,
      height: initialHeight,
      layout: { background: { color: "transparent" }, textColor: "#94a3b8", fontSize: 10 },
      grid: { vertLines: { color: "rgba(148,163,184,0.06)" }, horzLines: { color: "rgba(148,163,184,0.06)" } },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.15)" },
      timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: options?.timeVisible ?? false },
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

  // ĐÃ SỬA: bỏ giá trị mặc định height=360 — bắt buộc bên gọi truyền đúng
  // chiều cao thật của container (xem TVChartPanel.tsx: ResizeObserver giờ
  // theo dõi cả chiều cao, không chỉ chiều rộng như trước).
  resize(width: number, height: number): void {
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
    const targetTime = (toTime(dateStr) as number) * 1000;
    let nearestBar: OhlcvBar | null = null;
    for (const bar of this.currentBars) {
      const barTime = (toTime(bar.date) as number) * 1000;
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
