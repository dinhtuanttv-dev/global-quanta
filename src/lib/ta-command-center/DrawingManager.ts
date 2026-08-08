import { EventEmitter } from "./EventEmitter";

export interface DomainPoint { date: string; price: number; }
export type DrawingToolType = "rectangle" | "trendline" | "fibonacci";

export interface RectangleZone { id: string; toolType: "rectangle"; p1: DomainPoint; p2: DomainPoint; createdAt: number; }
export interface Trendline { id: string; toolType: "trendline"; p1: DomainPoint; p2: DomainPoint; createdAt: number; }
export interface FibonacciRetracement {
  id: string; toolType: "fibonacci"; p1: DomainPoint; p2: DomainPoint;
  levels: { ratio: number; price: number }[]; createdAt: number;
}
export type DrawnPrimitive = RectangleZone | Trendline | FibonacciRetracement;

const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

function buildFibLevels(p1: DomainPoint, p2: DomainPoint) {
  const high = Math.max(p1.price, p2.price);
  const low = Math.min(p1.price, p2.price);
  return FIB_RATIOS.map((ratio) => ({ ratio, price: high - (high - low) * ratio }));
}

interface DrawingEvents extends Record<string, unknown> {
  "primitive:created": DrawnPrimitive;
  "primitive:draft-updated": { toolType: DrawingToolType; p1: DomainPoint; p2: DomainPoint } | null;
  "primitive:deleted": { id: string };
}

export class DrawingManager {
  private primitives: DrawnPrimitive[] = [];
  private draftStart: DomainPoint | null = null;
  private draftTool: DrawingToolType | null = null;
  private emitter = new EventEmitter<DrawingEvents>();
  private idCounter = 0;

  on<K extends keyof DrawingEvents>(event: K, handler: (payload: DrawingEvents[K]) => void) {
    return this.emitter.on(event, handler);
  }

  startDraw(tool: DrawingToolType, point: DomainPoint): void {
    this.draftTool = tool;
    this.draftStart = point;
    this.emitter.emit("primitive:draft-updated", { toolType: tool, p1: point, p2: point });
  }

  updateDraw(currentPoint: DomainPoint): void {
    if (!this.draftStart || !this.draftTool) return;
    this.emitter.emit("primitive:draft-updated", { toolType: this.draftTool, p1: this.draftStart, p2: currentPoint });
  }

  finishDraw(endPoint: DomainPoint): DrawnPrimitive | null {
    if (!this.draftStart || !this.draftTool) return null;
    const id = `prim-${++this.idCounter}-${Date.now()}`;
    let primitive: DrawnPrimitive;

    if (this.draftTool === "rectangle") {
      primitive = { id, toolType: "rectangle", p1: this.draftStart, p2: endPoint, createdAt: Date.now() };
    } else if (this.draftTool === "trendline") {
      primitive = { id, toolType: "trendline", p1: this.draftStart, p2: endPoint, createdAt: Date.now() };
    } else {
      primitive = { id, toolType: "fibonacci", p1: this.draftStart, p2: endPoint, levels: buildFibLevels(this.draftStart, endPoint), createdAt: Date.now() };
    }

    const priceDiff = Math.abs(this.draftStart.price - endPoint.price);
    const minDiff = (this.draftStart.price || 1) * 0.001;
    if (priceDiff < minDiff && this.draftStart.date === endPoint.date) {
      this.draftStart = null; this.draftTool = null;
      this.emitter.emit("primitive:draft-updated", null);
      return null;
    }

    this.primitives.push(primitive);
    this.draftStart = null; this.draftTool = null;
    this.emitter.emit("primitive:draft-updated", null);
    this.emitter.emit("primitive:created", primitive);
    return primitive;
  }

  cancelDraw(): void { this.draftStart = null; this.draftTool = null; this.emitter.emit("primitive:draft-updated", null); }
  deletePrimitive(id: string): void { this.primitives = this.primitives.filter((p) => p.id !== id); this.emitter.emit("primitive:deleted", { id }); }
  getPrimitives(): DrawnPrimitive[] { return this.primitives; }
  clearAll(): void {
    const ids = this.primitives.map((p) => p.id);
    this.primitives = [];
    ids.forEach((id) => this.emitter.emit("primitive:deleted", { id }));
  }
}
