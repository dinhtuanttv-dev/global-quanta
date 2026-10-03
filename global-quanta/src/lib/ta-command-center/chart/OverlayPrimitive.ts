// Lớp phủ canvas gắn vào series nến (LWC v5 ISeriesPrimitive): vẽ Scene trong VÙNG GIÁ (không tràn trục),
// tự vẽ lại khi zoom/pan (thư viện gọi renderer mỗi khung hình) — thay lớp SVG phủ cũ + forceTick React.

import type {
  IChartApi, ISeriesApi, ISeriesPrimitive, IPrimitivePaneRenderer, IPrimitivePaneView, SeriesAttachedParameter, SeriesType, Time, UTCTimestamp,
} from "lightweight-charts-v5";
import type { CanvasRenderingTarget2D } from "fancy-canvas";
import { EMPTY_SCENE, placeLabels, type LabelBox, type Scene, type SceneItem, type SceneLabel, type ScenePoint } from "./scene";

export const toTime = (date: string): UTCTimestamp =>
  (Date.parse(date.includes("T") ? (date.endsWith("Z") ? date : `${date}Z`) : `${date}T00:00:00Z`) / 1000) as UTCTimestamp;

const FONT = "600 9px 'IBM Plex Mono', monospace";

class Renderer implements IPrimitivePaneRenderer {
  constructor(private owner: OverlayPrimitive) {}

  draw(target: CanvasRenderingTarget2D) {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const o = this.owner;
      const W = mediaSize.width;
      const H = mediaSize.height;
      const labels: LabelBox[] = [];
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.clip();
      ctx.font = FONT;
      const addLabel = (l: SceneLabel | undefined, x: number, y: number) => {
        if (!l) return;
        labels.push({ x, y, w: ctx.measureText(l.text).width + 4, h: 10, text: l.text, color: l.color, priority: l.priority });
      };
      for (const it of o.scene.items) this.drawItem(ctx, it, W, H, addLabel);
      const placed = placeLabels(labels, W, H);
      o.onRendered?.(placed.length, o.scene.items.length, o.probe());
      for (const l of placed) {
        ctx.fillStyle = "rgba(10,14,23,0.72)";
        ctx.fillRect(l.x, l.y - l.h + 1, l.w, l.h);
        ctx.fillStyle = l.color;
        ctx.fillText(l.text, l.x + 2, l.y - 1);
      }
      ctx.restore();
    });
  }

  private drawItem(ctx: CanvasRenderingContext2D, it: SceneItem, W: number, H: number, addLabel: (l: SceneLabel | undefined, x: number, y: number) => void) {
    const o = this.owner;
    const dash = (d?: number[]) => ctx.setLineDash(d ?? []);
    if (it.kind === "zone") {
      const x1 = o.x(it.t1);
      const x2 = it.t2 ? o.x(it.t2) : W;
      const y1 = o.y(it.top);
      const y2 = o.y(it.bottom);
      if (x1 === null || x2 === null || y1 === null || y2 === null) return;
      const left = Math.min(x1, x2);
      const w = Math.max(2, Math.abs(x2 - x1));
      const top = Math.min(y1, y2);
      const h = Math.max(2, Math.abs(y2 - y1));
      ctx.fillStyle = it.fill;
      ctx.fillRect(left, top, w, h);
      if (it.stroke) { dash(it.dash); ctx.strokeStyle = it.stroke; ctx.lineWidth = 1; ctx.strokeRect(left + 0.5, top + 0.5, w - 1, h - 1); }
      addLabel(it.label, left + 2, top - 1);
    } else if (it.kind === "band") {
      const x1 = o.x(it.t1);
      const x2 = o.x(it.t2);
      if (x1 === null || x2 === null) return;
      ctx.fillStyle = it.fill;
      ctx.fillRect(Math.min(x1, x2), 0, Math.max(2, Math.abs(x2 - x1)), H);
      if (it.stroke) { dash(it.dash); ctx.strokeStyle = it.stroke; ctx.strokeRect(Math.min(x1, x2) + 0.5, 0.5, Math.abs(x2 - x1), H - 1); }
      addLabel(it.label, Math.min(x1, x2) + 2, 12);
    } else if (it.kind === "hline") {
      const x1 = o.x(it.t1);
      const x2 = it.t2 ? o.x(it.t2) : W;
      const y = o.y(it.price);
      if (x1 === null || x2 === null || y === null) return;
      dash(it.dash); ctx.strokeStyle = it.color; ctx.lineWidth = it.width ?? 1;
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
      addLabel(it.label, x1 + 2, y - 2); // neo vào nến bắt đầu — ra khỏi khung thì nhãn ẩn, không trôi theo màn hình
    } else if (it.kind === "vline") {
      const x = o.x(it.t);
      if (x === null) return;
      dash(it.dash); ctx.strokeStyle = it.color; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      const ly = it.labelPrice !== undefined ? o.y(it.labelPrice) : 12;
      if (ly !== null) addLabel(it.label, x + 2, ly - 2);
    } else if (it.kind === "segment") {
      const a = o.pt(it.a);
      const b = o.pt(it.b);
      if (!a || !b) return;
      dash(it.dash); ctx.strokeStyle = it.color; ctx.lineWidth = it.width ?? 1.5;
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    } else if (it.kind === "poly") {
      const pts = it.points.map((p) => o.pt(p)).filter((p): p is [number, number] => p !== null);
      if (pts.length < 1) return;
      dash(it.dash); ctx.strokeStyle = it.color; ctx.lineWidth = it.width ?? 1.5;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      if (it.nodeLabels) {
        ctx.setLineDash([]);
        pts.forEach(([x, y], i) => {
          ctx.fillStyle = "#0F1420"; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = it.color; ctx.stroke();
          ctx.fillStyle = it.color; ctx.textAlign = "center"; ctx.fillText(it.nodeLabels![i] ?? "", x, y + 3); ctx.textAlign = "start";
        });
      }
      const last = pts[pts.length - 1];
      addLabel(it.label, last[0] + 10, last[1]);
    }
    ctx.setLineDash([]);
  }
}

class PaneView implements IPrimitivePaneView {
  private r: Renderer;
  constructor(owner: OverlayPrimitive) { this.r = new Renderer(owner); }
  zOrder() { return "normal" as const; }
  renderer() { return this.r; }
}

export class OverlayPrimitive implements ISeriesPrimitive<Time> {
  scene: Scene = EMPTY_SCENE;
  /** Gọi sau mỗi lần vẽ (số nhãn đã đặt, số phần tử) — dùng cho kiểm thử/giám sát. */
  onRendered?: (labels: number, items: number, probe: { date: string; itemX: number | null; candleX: number | null } | null) => void;

  /** Phần tử mẫu (có ngày bắt đầu) + toạ độ của nó và của nến cùng ngày, tính ở khung hình hiện tại. */
  probe() {
    const it = this.scene.items.find((x) => "t1" in x || "a" in x || "t" in x);
    if (!it) return null;
    const date = "t1" in it ? it.t1 : "a" in it ? it.a.t : "t" in it ? it.t : "";
    const candleX = this.chart?.timeScale().timeToCoordinate(toTime(date)) ?? null;
    return { date, itemX: this.x(date), candleX };
  }
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType> | null = null;
  private requestUpdate: (() => void) | null = null;
  private views = [new PaneView(this)];
  private dates: string[] = [];

  attached(p: SeriesAttachedParameter<Time>) {
    this.chart = p.chart as IChartApi;
    this.series = p.series as ISeriesApi<SeriesType>;
    this.requestUpdate = p.requestUpdate;
  }
  detached() { this.chart = null; this.series = null; this.requestUpdate = null; }
  paneViews() { return this.views; }

  setDates(dates: string[]) { this.dates = dates; }
  setScene(scene: Scene) { this.scene = scene; this.requestUpdate?.(); }

  /** Ngày -> x; ngày không có nến (VD khung W, ngày nghỉ) -> nến gần nhất trước đó. */
  x(date: string): number | null {
    if (!this.chart) return null;
    const ts = this.chart.timeScale();
    const direct = ts.timeToCoordinate(toTime(date));
    if (direct !== null) return direct;
    if (!this.dates.length) return null;
    let lo = 0;
    let hi = this.dates.length - 1;
    if (date < this.dates[0]) return ts.timeToCoordinate(toTime(this.dates[0]));
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.dates[mid] <= date) lo = mid; else hi = mid - 1; }
    return ts.timeToCoordinate(toTime(this.dates[lo]));
  }
  y(price: number): number | null { return this.series?.priceToCoordinate(price) ?? null; }
  pt(p: ScenePoint): [number, number] | null {
    const x = this.x(p.t);
    const y = this.y(p.price);
    return x === null || y === null ? null : [x, y];
  }
}
