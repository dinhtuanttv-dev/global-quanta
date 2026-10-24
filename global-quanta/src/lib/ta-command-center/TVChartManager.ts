// TVChartManager — TradingView Lightweight Charts v5 (gói `lightweight-charts-v5`; tab Elite 10 vẫn dùng v4).
// P3 (TA_VNINDEX_UPGRADE_SPEC §2.1.1): pane giá (+ pane khối lượng / RSI14 chỉ khi người dùng bật), lớp phủ canvas
// OverlayPrimitive trong vùng giá, marker qua plugin createSeriesMarkers, màu Bullish #00F5A0 / Bearish #FF0055.
// GHIM VÀO NẾN: mọi chỉ báo là series / marker / primitive của thư viện -> kéo chuột, cuộn, zoom, bàn phím đều di chuyển
// cùng nến (không có lớp DOM/SVG nào tự tính pixel ngoài thư viện).
import {
  createChart, createSeriesMarkers, CandlestickSeries, CrosshairMode, HistogramSeries, LineSeries, LineStyle,
  type IChartApi, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type MouseEventParams, type SeriesMarker, type Time,
} from "lightweight-charts-v5";
import type { OhlcvBar } from "./types";
import { OverlayPrimitive } from "./chart/OverlayPrimitive";
import { chartTime } from "./chart/time";
import { GQ_COLORS, rgba, type Scene } from "./chart/scene";

/** Ngày hoặc ISO (intraday) -> thời gian trục — dùng chung với lớp phủ (chart/time.ts). */
export const toTime = chartTime;

const DEFAULT_VISIBLE_BARS = 250;

export interface ChartMarkerInput {
  time: string;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle" | "square";
  text: string;
}

export interface TVChartManagerOptions { timeVisible?: boolean }

/** Pane đang có trên biểu đồ (SC2: tiêu đề + nút đóng + nhớ tỷ lệ chiều cao). */
export type PaneKind = "price" | "volume" | "rsi" | "macd" | "adx" | "flow" | "foreign" | "eosc";
export interface PaneInfo { index: number; kind: PaneKind; top: number; height: number }
/** Nến dưới crosshair (SC2: chú giải OHLC). */
export interface CrosshairBar { date: string; open: number; high: number; low: number; close: number; volume: number; prevClose: number | null; index: number }

/** Cột dương xanh / âm đỏ / đúng 0 xám (0 = cân bằng, không phải mua). */
const signColor = (v: number, a = 0.6) => (v > 0 ? rgba(GQ_COLORS.bull, a) : v < 0 ? rgba(GQ_COLORS.bear, a) : `rgba(100,116,139,${a})`);

export class TVChartManager {
  private chart: IChartApi;
  private candleSeries: ISeriesApi<"Candlestick">;
  private volumeSeries: ISeriesApi<"Histogram"> | null = null;
  private rsiSeries: ISeriesApi<"Line"> | null = null;
  private rsiValues: (number | null)[] = [];
  /** R5: ngưỡng RSI / ADX do người dùng chỉnh (vạch đứt trong pane). */
  private rsiLevels: [number, number] = [70, 30];
  private rsiLines: IPriceLine[] = [];
  private adxLevel = 25;
  private adxLine: IPriceLine | null = null;
  private currentDates = new Set<string>();
  /** Chỉ giữ điểm trùng thời gian một nến của chuỗi hiện tại (pane chỉ báo không được thêm mốc lạ vào trục). */
  private onCandles<T extends { date: string }>(data: T[]): T[] { return data.filter((d) => this.currentDates.has(d.date)); }
  // P5: pane Order Flow (Delta + CVD) và pane Khối ngoại (ròng + luỹ kế) — chỉ tồn tại khi bật lớp.
  private flowSeries: { delta: ISeriesApi<"Histogram">; cvd: ISeriesApi<"Line"> } | null = null;
  private foreignSeries: { net: ISeriesApi<"Histogram">; cum: ISeriesApi<"Line"> } | null = null;
  private elliottOscSeries: { osc: ISeriesApi<"Histogram">; up: ISeriesApi<"Line">; lo: ISeriesApi<"Line"> } | null = null;
  /** 25/10: đường TB (EMA 21/50/100, MA 200) và Tenkan / Kijun / Chikou của Ichimoku — series của thư viện trên pane giá (bám nến). */
  private overlayLines = new Map<string, ISeriesApi<"Line">>();
  private macdSeries: { hist: ISeriesApi<"Histogram">; macd: ISeriesApi<"Line">; signal: ISeriesApi<"Line"> } | null = null;
  private adxSeries: { adx: ISeriesApi<"Line">; plus: ISeriesApi<"Line">; minus: ISeriesApi<"Line"> } | null = null;
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
    this.overlay.onRendered = ((prev) => (labels, items, probe, hidden) => { prev?.(labels, items, probe, hidden); container.dataset.overlayHidden = String(hidden ?? 0); this.onLabels?.(hidden ?? 0); })(this.overlay.onRendered);
    this.chart.subscribeCrosshairMove(this.handleCrosshair);

    this.setData(bars);
  }

  // ---- SC2: chú giải OHLC theo crosshair, nhãn ẩn, pane, khoảng nhìn, ảnh chụp, chế độ bám nến ----
  private crosshairCbs = new Set<(b: CrosshairBar | null) => void>();
  private barIndexByTime = new Map<string, number>();
  /** Nhận số nhãn bị lược mỗi lần vẽ lớp phủ. */
  onLabels?: (hidden: number) => void;
  private handleCrosshair = (param: MouseEventParams<Time>) => {
    if (!this.crosshairCbs.size) return;
    const i = param.time == null ? undefined : this.barIndexByTime.get(String(param.time));
    const b = i == null ? null : this.currentBars[i];
    const out = b ? { ...b, volume: b.volume ?? 0, prevClose: i! > 0 ? this.currentBars[i! - 1].close : null, index: i! } : null;
    for (const cb of this.crosshairCbs) cb(out);
  };
  /** Đăng ký nhận nến dưới crosshair (null = con trỏ rời biểu đồ). */
  onCrosshair(cb: (b: CrosshairBar | null) => void): () => void { this.crosshairCbs.add(cb); return () => { this.crosshairCbs.delete(cb); }; }
  /** Vừa khung toàn bộ dữ liệu. */
  fit(): void { this.chart.timeScale().fitContent(); }
  /** Xem `n` nến gần nhất (mốc khoảng thời gian: 1T, 3T, 1N…); n = Infinity -> toàn bộ. */
  showLast(n: number): void {
    const len = this.currentBars.length;
    if (!Number.isFinite(n) || n >= len) { this.fit(); return; }
    const right = this.chart.timeScale().options().rightOffset ?? 6;
    this.chart.timeScale().setVisibleLogicalRange({ from: len - n, to: len - 1 + right });
  }
  /** Ảnh PNG của biểu đồ (gồm lớp phủ + nhãn). */
  screenshot(): HTMLCanvasElement { return this.chart.takeScreenshot(true); }
  /** Crosshair bám giá đóng cửa của nến (Magnet) hay tự do. */
  setMagnet(on: boolean): void { this.chart.applyOptions({ crosshair: { mode: on ? CrosshairMode.MagnetOHLC : CrosshairMode.Normal } }); }
  /** Danh sách pane hiện có: loại, vị trí đỉnh và chiều cao (px trong khung biểu đồ). */
  paneLayout(): PaneInfo[] {
    const owners: [PaneKind, ISeriesApi<never> | null | undefined][] = [
      ["volume", this.volumeSeries as never], ["rsi", this.rsiSeries as never], ["flow", this.flowSeries?.delta as never],
      ["foreign", this.foreignSeries?.net as never], ["eosc", this.elliottOscSeries?.osc as never],
      ["macd", this.macdSeries?.hist as never], ["adx", this.adxSeries?.adx as never],
    ];
    const kindOf = new Map<number, PaneKind>([[0, "price"]]);
    for (const [k, s] of owners) if (s) { try { kindOf.set(s.getPane().paneIndex(), k); } catch { /* series vừa gỡ */ } }
    let top = 0;
    return this.chart.panes().map((p, i) => { const h = p.getHeight(); const info = { index: i, kind: kindOf.get(i) ?? "price", top, height: h }; top += h + 1; return info; });
  }
  /** Tỷ lệ chiều cao người dùng đã kéo (theo loại pane) — để lưu vào bố cục. */
  paneStretch(): Partial<Record<PaneKind, number>> {
    const panes = this.chart.panes(), total = panes.reduce((a, p) => a + p.getStretchFactor(), 0) || 1;
    const out: Partial<Record<PaneKind, number>> = {};
    for (const info of this.paneLayout()) if (info.kind !== "price") out[info.kind] = Math.round((panes[info.index].getStretchFactor() / total) * 1000) / 1000;
    return out;
  }
  private savedStretch: Partial<Record<PaneKind, number>> = {};
  /** Áp tỷ lệ đã lưu cho các pane chỉ báo (pane giá nhận phần còn lại). */
  applyPaneStretch(s: Partial<Record<PaneKind, number>>): void { this.savedStretch = { ...s }; this.layoutPanes(); }
  /** (ngày, giá) -> px trong khung biểu đồ (hit-test hình vẽ). */
  domainToPixel(date: string, price: number): { x: number; y: number } | null {
    const x = this.overlay.x(date), y = this.candleSeries.priceToCoordinate(price);
    return x == null || y == null ? null : { x, y };
  }
  /** Kích thước pane giá. */
  pricePaneSize(): { width: number; height: number } { return this.chart.paneSize(0); }

  /**
   * Nạp nến. A4 (C-01/C-02): cùng chuỗi, chỉ nến cuối đổi / thêm vài nến mới -> CẬP NHẬT TỪNG NẾN (không nạp lại toàn bộ, khung nhìn
   * không nhảy; ở mép phải thì thư viện tự bám nến mới). `keepView` (làm mới dữ liệu cùng mã + khung): nạp lại nhưng GIỮ khung nhìn —
   * đang xem quá khứ thì đứng yên tại đó, đang ở mép phải thì giữ độ rộng và bám nến cuối. Đổi mã / khung: về 250 nến gần nhất như cũ.
   */
  setData(bars: OhlcvBar[], rsi?: (number | null)[], opts: { keepView?: boolean } = {}): void {
    const prev = this.currentBars;
    const n = bars.length, m = prev.length;
    const incremental = opts.keepView && m > 1 && n >= m && n - m <= 5 && prev[0].date === bars[0].date && prev[m - 2].date === bars[m - 2].date;
    if (incremental) {
      this.currentBars = bars;
      for (let i = m - 1; i < n; i++) {
        const b = bars[i];
        if (i >= m) { this.currentDates.add(b.date); this.barIndexByTime.set(String(toTime(b.date)), i); }
        this.candleSeries.update({ time: toTime(b.date), open: b.open, high: b.high, low: b.low, close: b.close });
        this.volumeSeries?.update(this.volumePoint(b));
      }
      if (n > m) this.overlay.setDates(bars.map((b) => b.date));
      if (rsi) this.setRsi(rsi);
      this.paintLast();
      return;
    }
    const ts = this.chart.timeScale();
    const view = opts.keepView && m > 0 ? ts.getVisibleLogicalRange() : null;
    const atRight = view ? view.to >= m - 2 : true;
    const keepTimes = view && !atRight ? ts.getVisibleRange() : null;
    // Trục thời gian của thư viện là HỢP thời gian mọi series: xoá dữ liệu cũ của pane chỉ báo TRƯỚC khi nạp nến mới,
    // nếu không các mốc của khung cũ (VD nến 15m) lẫn vào khung mới làm lệch khung nhìn (lỗi tái hiện 08/10/2026).
    this.flowSeries?.delta.setData([]);
    this.flowSeries?.cvd.setData([]);
    this.foreignSeries?.net.setData([]);
    this.foreignSeries?.cum.setData([]);
    for (const s of [...Object.values(this.macdSeries ?? {}), ...Object.values(this.adxSeries ?? {}), ...this.overlayLines.values()]) s.setData([]);
    this.currentBars = bars;
    this.currentDates = new Set(bars.map((b) => b.date));
    this.barIndexByTime = new Map(bars.map((b, i) => [String(toTime(b.date)), i]));
    this.overlay.setDates(bars.map((b) => b.date));
    this.candleSeries.setData(bars.map((b) => ({ time: toTime(b.date), open: b.open, high: b.high, low: b.low, close: b.close })));
    this.fillVolume();
    if (rsi) this.setRsi(rsi);
    this.paintLast();
    if (keepTimes) {
      try { ts.setVisibleRange(keepTimes); return; } catch { /* mốc cũ không còn trong dữ liệu -> mặc định */ }
    } else if (view) {
      const rightGap = view.to - (m - 1), width = view.to - view.from;
      ts.setVisibleLogicalRange({ from: n - 1 + rightGap - width, to: n - 1 + rightGap });
      return;
    }
    // Chuỗi dài (≈3 năm) -> mặc định nhìn 250 phiên gần nhất; kéo/cuộn để xem toàn bộ lịch sử.
    if (bars.length > DEFAULT_VISIBLE_BARS + 50) {
      ts.setVisibleLogicalRange({ from: bars.length - DEFAULT_VISIBLE_BARS, to: bars.length + 3 });
    } else {
      ts.fitContent();
    }
  }

  /** A3 (D-08): nến cuối đang hình thành (phiên đang chạy / tuần, tháng chưa kết thúc) -> vẽ RỖNG (chỉ viền) để không nhầm là nến đã đóng. */
  private formingLast = false;
  setFormingLast(on: boolean): void {
    if (on === this.formingLast) return;
    this.formingLast = on;
    this.paintLast();
  }
  private paintLast(): void {
    const b = this.currentBars[this.currentBars.length - 1];
    if (!b) return;
    const c = b.close >= b.open ? GQ_COLORS.bull : GQ_COLORS.bear;
    this.candleSeries.update(this.formingLast
      ? { time: toTime(b.date), open: b.open, high: b.high, low: b.low, close: b.close, color: "rgba(0,0,0,0)", borderColor: c, wickColor: c }
      : { time: toTime(b.date), open: b.open, high: b.high, low: b.low, close: b.close });
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
      this.drawRsiLevels();
      this.fillRsi();
    } else if (!on && this.rsiSeries) {
      this.chart.removeSeries(this.rsiSeries);
      this.rsiSeries = null;
      this.rsiLines = [];
    }
    this.layoutPanes();
  }

  setRsiLevels(upper: number, lower: number): void {
    if (this.rsiLevels[0] === upper && this.rsiLevels[1] === lower) return;
    this.rsiLevels = [upper, lower];
    this.drawRsiLevels();
  }
  private drawRsiLevels(): void {
    if (!this.rsiSeries) return;
    for (const l of this.rsiLines) this.rsiSeries.removePriceLine(l);
    const [up, lo] = this.rsiLevels;
    this.rsiLines = ([[up, GQ_COLORS.bear], [lo, GQ_COLORS.bull]] as const).map(([price, color]) =>
      this.rsiSeries!.createPriceLine({ price, color: rgba(color, 0.5), lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: "" }));
  }
  setAdxLevel(level: number): void {
    this.adxLevel = level;
    if (!this.adxSeries) return;
    if (this.adxLine) this.adxSeries.adx.removePriceLine(this.adxLine);
    this.adxLine = this.adxSeries.adx.createPriceLine({ price: level, color: rgba(GQ_COLORS.amber, 0.5), lineStyle: LineStyle.Dashed, lineWidth: 1, axisLabelVisible: false, title: "" });
  }

  setRsi(rsi: (number | null)[]): void {
    this.rsiValues = rsi;
    this.fillRsi();
  }

  paneCount(): number { return this.chart.panes().length; }

  /** Pane Order Flow: histogram Delta (mua − bán chủ động) + đường CVD (thang riêng bên trái). null = gỡ pane. */
  /** Delta: cột đậm = tick thật (Lee–Ready), cột nhạt = ước lượng BVC từ nến (R3 — không trộn lẫn hai nguồn). */
  setFlowPane(data: { date: string; delta: number; cvd: number; source?: "TICK" | "BVC" }[] | null): void {
    if (!data) {
      if (this.flowSeries) { this.chart.removeSeries(this.flowSeries.delta); this.chart.removeSeries(this.flowSeries.cvd); this.flowSeries = null; this.layoutPanes(); }
      return;
    }
    if (!this.flowSeries) {
      const pane = this.chart.panes().length;
      const delta = this.chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false }, pane);
      const cvd = this.chart.addSeries(LineSeries, { color: GQ_COLORS.amber, lineWidth: 1, priceScaleId: "left", priceLineVisible: false, lastValueVisible: true, priceFormat: { type: "volume" } }, pane);
      this.flowSeries = { delta, cvd };
      this.layoutPanes();
    }
    data = this.onCandles(data);
    this.flowSeries.delta.setData(data.map((d) => ({ time: toTime(d.date), value: d.delta, color: signColor(d.delta, d.source === "BVC" ? 0.22 : 0.6) })));
    this.flowSeries.cvd.setData(data.map((d) => ({ time: toTime(d.date), value: d.cvd })));
  }

  /** Pane Khối ngoại (khung D/W/M): giá trị mua − bán ròng theo nến + đường luỹ kế. null = gỡ pane. */
  setForeignPane(data: { date: string; net: number; cum: number }[] | null): void {
    if (!data) {
      if (this.foreignSeries) { this.chart.removeSeries(this.foreignSeries.net); this.chart.removeSeries(this.foreignSeries.cum); this.foreignSeries = null; this.layoutPanes(); }
      return;
    }
    if (!this.foreignSeries) {
      const pane = this.chart.panes().length;
      const net = this.chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false }, pane);
      const cum = this.chart.addSeries(LineSeries, { color: GQ_COLORS.cyan, lineWidth: 1, priceScaleId: "left", priceLineVisible: false, lastValueVisible: true, priceFormat: { type: "volume" } }, pane);
      this.foreignSeries = { net, cum };
      this.layoutPanes();
    }
    data = this.onCandles(data);
    this.foreignSeries.net.setData(data.map((d) => ({ time: toTime(d.date), value: d.net, color: signColor(d.net) })));
    this.foreignSeries.cum.setData(data.map((d) => ({ time: toTime(d.date), value: d.cum })));
  }

  /**
   * Pane Elliott Oscillator (SMA5 − SMA35 của giá giữa (H+L)/2) + dải bứt phá 80% cực trị 100 nến trước (T-20).
   * Cột sáng = vượt dải (dấu hiệu sóng 3 theo sách); cột mờ = trong dải. null = gỡ pane.
   */
  setElliottOscPane(data: { date: string; osc: number; up: number; lo: number }[] | null): void {
    if (!data) {
      if (this.elliottOscSeries) {
        for (const x of Object.values(this.elliottOscSeries)) this.chart.removeSeries(x);
        this.elliottOscSeries = null; this.layoutPanes();
      }
      return;
    }
    if (!this.elliottOscSeries) {
      const pane = this.chart.panes().length;
      const osc = this.chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: true, title: "EO 5/35" }, pane);
      const band = { lineWidth: 1 as const, lineStyle: LineStyle.Dashed, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
      const up = this.chart.addSeries(LineSeries, { ...band, color: rgba(GQ_COLORS.bull, 0.55) }, pane);
      const lo = this.chart.addSeries(LineSeries, { ...band, color: rgba(GQ_COLORS.bear, 0.55) }, pane);
      this.elliottOscSeries = { osc, up, lo };
      this.layoutPanes();
    }
    data = this.onCandles(data);
    this.elliottOscSeries.osc.setData(data.map((d) => ({
      time: toTime(d.date), value: d.osc,
      color: d.osc >= 0 ? rgba(GQ_COLORS.bull, d.up > 0 && d.osc > d.up ? 0.9 : 0.35) : rgba(GQ_COLORS.bear, d.lo < 0 && d.osc < d.lo ? 0.9 : 0.35),
    })));
    this.elliottOscSeries.up.setData(data.map((d) => ({ time: toTime(d.date), value: d.up })));
    this.elliottOscSeries.lo.setData(data.map((d) => ({ time: toTime(d.date), value: d.lo })));
  }

  /**
   * Nhóm đường phủ trên pane giá: `group` (VD "ma" / "ichi") -> các đường {id, màu, giá trị theo nến}. null = gỡ cả nhóm.
   * Giá trị null = khoảng trống (chưa đủ dữ liệu), không nối qua.
   */
  setOverlayLines(group: string, lines: { id: string; color: string; width?: 1 | 2; dashed?: boolean; values: (number | null)[] }[] | null): void {
    const prefix = `${group}:`;
    const keep = new Set((lines ?? []).map((l) => prefix + l.id));
    for (const [k, s] of this.overlayLines) if (k.startsWith(prefix) && !keep.has(k)) { this.chart.removeSeries(s); this.overlayLines.delete(k); }
    for (const l of lines ?? []) {
      const k = prefix + l.id;
      let s = this.overlayLines.get(k);
      if (!s) {
        s = this.chart.addSeries(LineSeries, { color: l.color, lineWidth: l.width ?? 1, lineStyle: l.dashed ? LineStyle.Dotted : LineStyle.Solid,
          priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 0);
        this.overlayLines.set(k, s);
      }
      s.setData(this.currentBars.map((b, i) => (l.values[i] == null ? { time: toTime(b.date) } : { time: toTime(b.date), value: l.values[i] as number })));
    }
  }

  /** R4 — pane MACD: histogram (đậm khi tăng dần, nhạt khi giảm dần) + đường MACD + Signal. null = gỡ pane. */
  setMacdPane(data: { date: string; macd: number | null; signal: number | null; hist: number | null }[] | null): void {
    if (!data) {
      if (this.macdSeries) { for (const x of Object.values(this.macdSeries)) this.chart.removeSeries(x); this.macdSeries = null; this.layoutPanes(); }
      return;
    }
    if (!this.macdSeries) {
      const pane = this.chart.panes().length;
      const hist = this.chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, pane);
      const line = { lineWidth: 1 as const, priceLineVisible: false, lastValueVisible: true };
      const macd = this.chart.addSeries(LineSeries, { ...line, color: GQ_COLORS.cyan }, pane);
      const signal = this.chart.addSeries(LineSeries, { ...line, color: GQ_COLORS.amber }, pane);
      this.macdSeries = { hist, macd, signal };
      this.layoutPanes();
    }
    data = this.onCandles(data);
    let prev: number | null = null;
    this.macdSeries.hist.setData(data.map((d) => {
      if (d.hist == null) return { time: toTime(d.date) };
      const rising = prev != null && Math.abs(d.hist) >= Math.abs(prev);
      prev = d.hist;
      return { time: toTime(d.date), value: d.hist, color: signColor(d.hist, rising ? 0.7 : 0.35) };
    }));
    this.macdSeries.macd.setData(data.map((d) => (d.macd == null ? { time: toTime(d.date) } : { time: toTime(d.date), value: d.macd })));
    this.macdSeries.signal.setData(data.map((d) => (d.signal == null ? { time: toTime(d.date) } : { time: toTime(d.date), value: d.signal })));
  }

  /** R4 — pane ADX (trắng) + +DI (xanh) / −DI (đỏ), vạch 25 = ngưỡng xu hướng (quy ước Wilder). null = gỡ pane. */
  setAdxPane(data: { date: string; adx: number | null; plus: number | null; minus: number | null }[] | null): void {
    if (!data) {
      if (this.adxSeries) { for (const x of Object.values(this.adxSeries)) this.chart.removeSeries(x); this.adxSeries = null; this.adxLine = null; this.layoutPanes(); }
      return;
    }
    if (!this.adxSeries) {
      const pane = this.chart.panes().length;
      const line = { lineWidth: 1 as const, priceLineVisible: false, lastValueVisible: true };
      const adx = this.chart.addSeries(LineSeries, { ...line, color: "#e2e8f0", lineWidth: 2 }, pane);
      const plus = this.chart.addSeries(LineSeries, { ...line, color: rgba(GQ_COLORS.bull, 0.8) }, pane);
      const minus = this.chart.addSeries(LineSeries, { ...line, color: rgba(GQ_COLORS.bear, 0.8) }, pane);
      this.adxSeries = { adx, plus, minus };
      this.setAdxLevel(this.adxLevel);
      this.layoutPanes();
    }
    data = this.onCandles(data);
    const pick = (k: "adx" | "plus" | "minus") => data!.map((d) => (d[k] == null ? { time: toTime(d.date) } : { time: toTime(d.date), value: d[k] as number }));
    this.adxSeries.adx.setData(pick("adx"));
    this.adxSeries.plus.setData(pick("plus"));
    this.adxSeries.minus.setData(pick("minus"));
  }

  private volumePoint(b: OhlcvBar) {
    return { time: toTime(b.date), value: b.volume, color: b.close >= b.open ? rgba(GQ_COLORS.bull, 0.45) : rgba(GQ_COLORS.bear, 0.45) };
  }
  private fillVolume(): void {
    this.volumeSeries?.setData(this.currentBars.map((b) => this.volumePoint(b)));
  }

  private fillRsi(): void {
    const rsi = this.rsiValues;
    this.rsiSeries?.setData(this.currentBars.map((b, i) => (rsi[i] == null ? { time: toTime(b.date) } : { time: toTime(b.date), value: rsi[i] as number })));
  }

  private layoutPanes(): void {
    const panes = this.chart.panes();
    this.container.dataset.panes = String(panes.length);
    // Pane giá luôn chiếm phần lớn; các pane chỉ báo chia đều phần còn lại.
    const main = panes.length === 1 ? 1 : panes.length === 2 ? 0.78 : panes.length === 3 ? 0.66 : 0.58;
    // SC2: tỷ lệ người dùng đã lưu (theo loại pane) thắng tỷ lệ mặc định; pane giá giữ tối thiểu 40%.
    const info = panes.length > 1 ? this.paneLayout() : [];
    const custom = info.filter((p) => p.kind !== "price").map((p) => this.savedStretch[p.kind]);
    if (custom.length && custom.every((x) => x != null)) {
      const sum = Math.min(0.6, custom.reduce((a, b) => a + (b as number), 0));
      const scale = sum / custom.reduce((a, b) => a + (b as number), 0);
      panes[0]?.setStretchFactor(1 - sum);
      info.filter((p) => p.kind !== "price").forEach((p, k) => panes[p.index].setStretchFactor((custom[k] as number) * scale));
      return;
    }
    panes[0]?.setStretchFactor(main);
    for (let i = 1; i < panes.length; i++) panes[i].setStretchFactor((1 - main) / (panes.length - 1));
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

  private levelLines: IPriceLine[] = [];
  /** Thang mức giá ở trục phải (priceLine của thư viện — ghim theo giá, tự theo zoom/pan). [] = gỡ hết. */
  setPriceLevels(levels: { price: number; color: string; title: string }[]): void {
    for (const l of this.levelLines) this.candleSeries.removePriceLine(l);
    this.levelLines = levels.filter((l) => Number.isFinite(l.price)).map((l) => this.candleSeries.createPriceLine({
      price: l.price, color: l.color, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: l.title,
    }));
    this.container.dataset.priceLevels = String(this.levelLines.length);
  }

  /** Khoảng trống bên phải nến cuối (số nến) — mở rộng khi vẽ vùng tương lai (nón dự báo, kịch bản). */
  /**
   * Chỗ trống bên phải (nến) cho đường tương lai. A4 (C-01): đặt lại tuỳ chọn này làm thư viện kéo khung nhìn về mép phải — trước đây
   * bị gọi mỗi lần nến / scene đổi nên người dùng đang xem quá khứ bị giật về. Giờ chỉ áp khi giá trị đổi, và giữ nguyên khung nhìn
   * nếu người dùng không ở mép phải.
   */
  private rightOffset = 6;
  setRightOffset(bars: number): void {
    if (bars === this.rightOffset) return;
    const ts = this.chart.timeScale();
    const r = ts.getVisibleLogicalRange();
    const atRight = !r || r.to >= this.currentBars.length - 2;
    this.rightOffset = bars;
    this.chart.applyOptions({ timeScale: { rightOffset: bars } });
    if (!atRight && r) ts.setVisibleLogicalRange(r);
  }

  /** Khung intraday: hiện giờ:phút trên trục thời gian. */
  setTimeVisible(on: boolean): void { this.chart.applyOptions({ timeScale: { timeVisible: on, secondsVisible: false } }); }

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

  destroy(): void { this.chart.unsubscribeCrosshairMove(this.handleCrosshair); this.crosshairCbs.clear(); this.chart.remove(); }
}
