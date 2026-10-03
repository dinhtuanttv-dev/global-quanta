// TVChartManager — TradingView Lightweight Charts v5 (gói `lightweight-charts-v5`; tab Elite 10 vẫn dùng v4).
// P3 (TA_VNINDEX_UPGRADE_SPEC §2.1.1): pane giá (+ pane khối lượng / RSI14 chỉ khi người dùng bật), lớp phủ canvas
// OverlayPrimitive trong vùng giá, marker qua plugin createSeriesMarkers, màu Bullish #00F5A0 / Bearish #FF0055.
// GHIM VÀO NẾN: mọi chỉ báo là series / marker / primitive của thư viện -> kéo chuột, cuộn, zoom, bàn phím đều di chuyển
// cùng nến (không có lớp DOM/SVG nào tự tính pixel ngoài thư viện).
import {
  createChart, createSeriesMarkers, CandlestickSeries, HistogramSeries, LineSeries, LineStyle,
  type IChartApi, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type Time, type UTCTimestamp,
} from "lightweight-charts-v5";
import type { OhlcvBar } from "./types";
import { OverlayPrimitive } from "./chart/OverlayPrimitive";
import { GQ_COLORS, rgba, type Scene } from "./chart/scene";

/** Ngày "YYYY-MM-DD" hoặc ISO có giờ (khung intraday) -> UTCTimestamp. */
export function toTime(dateStr: string): UTCTimestamp {
  const hasTime = dateStr.includes("T");
  const isoStr = hasTime ? (dateStr.endsWith("Z") ? dateStr : `${dateStr}Z`) : `${dateStr}T00:00:00Z`;
  return (new Date(isoStr).getTime() / 1000) as UTCTimestamp;
}

const DEFAULT_VISIBLE_BARS = 250;

export interface ChartMarkerInput {
  time: string;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text: string;
}

export interface TVChartManagerOptions { timeVisible?: boolean }

export class TVChartManager {
  private chart: IChartApi;
  private candleSeries: ISeriesApi<"Candlestick">;
  private volumeSeries: ISeriesApi<"Histogram"> | null = null;
  private rsiSeries: ISeriesApi<"Line"> | null = null;
  private rsiValues: (number | null)[] = [];
  private markers: ISeriesMarkersPluginApi<Time>;
  readonly overlay = new OverlayPrimitive();
  private currentBars: OhlcvBar[] = [];
  private container: HTMLElement;

  constructor(container: HTMLElement, bars: OhlcvBar[], options?: TVChartManagerOptions) {
    this.container = container;
    const initialHeight = container.clientHeight > 0 ? container.clientHeight : 360;
    this.chart = createChart(container, {
      width: container.clientWidth,
      height: initialHeight,
      layout: {
        background: { color: "transparent" }, textColor: GQ_COLORS.text2, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace",
        panes: { separatorColor: "rgba(148,163,184,0.12)", separatorHoverColor: "rgba(34,211,238,0.25)", enableResize: true },
      },
      grid: { vertLines: { color: "rgba(148,163,184,0.05)" }, horzLines: { color: "rgba(148,163,184,0.05)" } },
      rightPriceScale: { borderColor: "rgba(148,163,184,0.15)" },
      timeScale: { borderColor: "rgba(148,163,184,0.15)", timeVisible: options?.timeVisible ?? false, rightOffset: 6 },
      crosshair: { vertLine: { color: rgba(GQ_COLORS.cyan, 0.4) }, horzLine: { color: rgba(GQ_COLORS.cyan, 0.4) } },
    });

    this.candleSeries = this.chart.addSeries(CandlestickSeries, {
      upColor: GQ_COLORS.bull, downColor: GQ_COLORS.bear,
      borderUpColor: GQ_COLORS.bull, borderDownColor: GQ_COLORS.bear,
      wickUpColor: GQ_COLORS.bull, wickDownColor: GQ_COLORS.bear,
    }, 0);
    this.candleSeries.attachPrimitive(this.overlay);
    // Dữ liệu giám sát mỗi lần vẽ: số nhãn/phần tử, khung nhìn logic, toạ độ x của nến mẫu & phần tử mẫu
    // (kiểm thử "ghim vào nến": khi kéo/cuộn/bàn phím, lớp phủ phải dịch đúng bằng nến).
    this.overlay.onRendered = (labels, items, probe) => {
      container.dataset.overlayLabels = String(labels);
      container.dataset.overlayItems = String(items);
      const r = this.chart.timeScale().getVisibleLogicalRange();
      container.dataset.overlayRange = r ? `${r.from.toFixed(2)},${r.to.toFixed(2)}` : "";
      container.dataset.overlayProbe = probe ? `${probe.date}|${probe.itemX?.toFixed(1) ?? ""}|${probe.candleX?.toFixed(1) ?? ""}` : "";
    };
    this.markers = createSeriesMarkers(this.candleSeries, []);
    container.dataset.panes = "1";

    this.setData(bars);
  }

  setData(bars: OhlcvBar[], rsi?: (number | null)[]): void {
    this.currentBars = bars;
    this.overlay.setDates(bars.map((b) => b.date));
    this.candleSeries.setData(bars.map((b) => ({ time: toTime(b.date), open: b.open, high: b.high, low: b.low, close: b.close })));
    this.fillVolume();
    if (rsi) this.setRsi(rsi);
    // Chuỗi dài (≈3 năm) -> mặc định nhìn 250 phiên gần nhất; kéo/cuộn để xem toàn bộ lịch sử.
    if (bars.length > DEFAULT_VISIBLE_BARS + 50) {
      this.chart.timeScale().setVisibleLogicalRange({ from: bars.length - DEFAULT_VISIBLE_BARS, to: bars.length + 3 });
    } else {
      this.chart.timeScale().fitContent();
    }
  }

  /** Pane khối lượng — chỉ tồn tại khi người dùng bật lớp "Khối lượng". */
  setVolumeVisible(on: boolean): void {
    if (on && !this.volumeSeries) {
      this.volumeSeries = this.chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false }, this.chart.panes().length);
      this.fillVolume();
    } else if (!on && this.volumeSeries) {
      this.chart.removeSeries(this.volumeSeries); // pane rỗng tự bị xoá (v5)
      this.volumeSeries = null;
    }
    this.layoutPanes();
  }

  /** Pane RSI14 — chỉ tồn tại khi người dùng bật lớp "RSI 14". */
  setRsiVisible(on: boolean): void {
    if (on && !this.rsiSeries) {
      this.rsiSeries = this.chart.addSeries(LineSeries, { color: GQ_COLORS.uv, lineWidth: 1, priceLineVisible: false, lastValueVisible: true }, this.chart.panes().length);
      for (const [price, color] of [[70, GQ_COLORS.bear], [30, GQ_COLORS.bull]] as const) {
        this.rsiSeries.createPriceLine({ price, color: rgba(color, 0.5), lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: "" });
      }
      this.fillRsi();
    } else if (!on && this.rsiSeries) {
      this.chart.removeSeries(this.rsiSeries);
      this.rsiSeries = null;
    }
    this.layoutPanes();
  }

  setRsi(rsi: (number | null)[]): void {
    this.rsiValues = rsi;
    this.fillRsi();
  }

  paneCount(): number { return this.chart.panes().length; }

  private fillVolume(): void {
    this.volumeSeries?.setData(this.currentBars.map((b) => ({
      time: toTime(b.date), value: b.volume,
      color: b.close >= b.open ? rgba(GQ_COLORS.bull, 0.45) : rgba(GQ_COLORS.bear, 0.45),
    })));
  }

  private fillRsi(): void {
    const rsi = this.rsiValues;
    this.rsiSeries?.setData(this.currentBars.map((b, i) => (rsi[i] == null ? { time: toTime(b.date) } : { time: toTime(b.date), value: rsi[i] as number })));
  }

  private layoutPanes(): void {
    const panes = this.chart.panes();
    this.container.dataset.panes = String(panes.length);
    panes[0]?.setStretchFactor(panes.length === 1 ? 1 : panes.length === 2 ? 0.78 : 0.66);
    for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor(panes.length === 2 ? 0.22 : 0.17);
  }

  // ---- Bàn phím: dịch chuyển/zoom qua API thời gian của thư viện -> mọi series, marker, lớp phủ di chuyển cùng nến ----
  /** Dịch khung nhìn `bars` nến (âm = về quá khứ). */
  panBars(bars: number): void {
    const ts = this.chart.timeScale();
    const r = ts.getVisibleLogicalRange();
    if (r) ts.setVisibleLogicalRange({ from: r.from + bars, to: r.to + bars });
  }
  /** Zoom quanh nến cuối khung nhìn (factor < 1 = phóng to). */
  zoom(factor: number): void {
    const ts = this.chart.timeScale();
    const r = ts.getVisibleLogicalRange();
    if (!r) return;
    const width = Math.min(Math.max((r.to - r.from) * factor, 20), Math.max(40, this.currentBars.length + 20));
    ts.setVisibleLogicalRange({ from: r.to - width, to: r.to });
  }
  goToStart(): void {
    const ts = this.chart.timeScale();
    const r = ts.getVisibleLogicalRange();
    const width = r ? r.to - r.from : DEFAULT_VISIBLE_BARS;
    ts.setVisibleLogicalRange({ from: -3, to: width - 3 });
  }
  goToEnd(): void { this.chart.timeScale().scrollToRealTime(); }
  visibleLogicalRange(): { from: number; to: number } | null { return this.chart.timeScale().getVisibleLogicalRange(); }

  setMarkers(markers: ChartMarkerInput[]): void {
    const sorted = [...markers].sort((a, b) => a.time.localeCompare(b.time));
    this.markers.setMarkers(sorted.map((m): SeriesMarker<Time> => ({
      time: toTime(m.time), position: m.position, color: m.color, shape: m.shape, text: m.text,
    })));
  }

  setScene(scene: Scene): void { this.overlay.setScene(scene); }

  resize(width: number, height: number): void { this.chart.resize(width, height); }

  /** Tạm khoá kéo/zoom của biểu đồ khi đang vẽ (chuột hoặc cảm ứng). */
  setInteractionLocked(locked: boolean): void {
    this.chart.applyOptions({ handleScroll: !locked, handleScale: !locked });
  }

  /** Vị trí con trỏ (clientX/Y) -> toạ độ miền trên pane giá; null nếu ngoài pane giá. */
  clientToDomain(clientX: number, clientY: number): { date: string; price: number } | null {
    const rect = this.container.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const pane = this.chart.paneSize(0);
    if (x < 0 || y < 0 || x > pane.width || y > pane.height) return null;
    const price = this.candleSeries.coordinateToPrice(y);
    const date = this.pixelToDate(x);
    return price === null || date === null ? null : { date, price };
  }

  priceToPixel(price: number): number | null { return this.candleSeries.priceToCoordinate(price); }
  pixelToPrice(y: number): number | null { return this.candleSeries.coordinateToPrice(y); }
  timeToPixel(dateStr: string): number | null { return this.overlay.x(dateStr); }

  /** x -> ngày của nến gần nhất (kể cả ngoài vùng dữ liệu: kẹp về nến đầu/cuối). */
  pixelToDate(x: number): string | null {
    const logical = this.chart.timeScale().coordinateToLogical(x);
    if (logical === null || !this.currentBars.length) return null;
    const i = Math.min(this.currentBars.length - 1, Math.max(0, Math.round(logical)));
    return this.currentBars[i].date;
  }

  onVisibleRangeChange(cb: () => void): () => void {
    this.chart.timeScale().subscribeVisibleTimeRangeChange(cb);
    return () => this.chart.timeScale().unsubscribeVisibleTimeRangeChange(cb);
  }

  destroy(): void { this.chart.remove(); }
}
