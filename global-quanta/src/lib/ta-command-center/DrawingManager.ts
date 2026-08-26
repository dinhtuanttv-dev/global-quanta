import { EventEmitter } from "./EventEmitter";

export interface DomainPoint { date: string; price: number; }
export type DrawingToolType = "rectangle" | "trendline" | "fibonacci" | "elliott";

export interface RectangleZone { id: string; toolType: "rectangle"; p1: DomainPoint; p2: DomainPoint; createdAt: number; }
export interface Trendline { id: string; toolType: "trendline"; p1: DomainPoint; p2: DomainPoint; createdAt: number; }
export interface FibonacciRetracement {
  id: string; toolType: "fibonacci"; p1: DomainPoint; p2: DomainPoint;
  levels: { ratio: number; price: number }[]; createdAt: number;
}
export interface ElliottWaveMarking {
  id: string; toolType: "elliott";
  points: DomainPoint[]; // 6 diem: 0(goc)-1-2-3-4-5
  labels: string[];
  violations: string[]; // rong = khong vi pham quy tac cung nao
  createdAt: number;
}
export type DrawnPrimitive = RectangleZone | Trendline | FibonacciRetracement | ElliottWaveMarking;

const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
const FIB_EXTENSION_RATIOS = [1.272, 1.618, 2.618];
const ELLIOTT_POINT_COUNT = 6;
const ELLIOTT_LABELS = ["0", "1", "2", "3", "4", "5"];

function buildFibLevels(p1: DomainPoint, p2: DomainPoint, includeExtension: boolean) {
  const high = Math.max(p1.price, p2.price);
  const low = Math.min(p1.price, p2.price);
  const ratios = includeExtension ? [...FIB_RATIOS, ...FIB_EXTENSION_RATIOS] : FIB_RATIOS;
  return ratios.map((ratio) => ({ ratio, price: high - (high - low) * ratio }));
}

// Kiem tra 3 quy tac cung cua Elliott Wave - khong AI doan, chi kiem chung
// hinh hoc thuan tuy tren 6 diem nguoi dung tu ve.
function validateElliottRules(points: DomainPoint[]): string[] {
  const violations: string[] = [];
  if (points.length < ELLIOTT_POINT_COUNT) return violations;

  const [p0, p1, p2, p3, p4, p5] = points;
  const isUptrend = p1.price > p0.price;

  // Quy tac 1: Song 2 khong hoi qua 100% Song 1
  const rule1Ok = isUptrend ? p2.price > p0.price : p2.price < p0.price;
  if (!rule1Ok) violations.push("Song 2 hoi qua 100% Song 1 - vi pham quy tac Elliott co ban.");

  // Quy tac 2: Song 3 khong bao gio la song ngan nhat trong 3 song day (1,3,5)
  const wave1Len = Math.abs(p1.price - p0.price);
  const wave3Len = Math.abs(p3.price - p2.price);
  const wave5Len = Math.abs(p5.price - p4.price);
  if (wave3Len < wave1Len && wave3Len < wave5Len) {
    violations.push("Song 3 la song ngan nhat trong 3 song day (1,3,5) - vi pham quy tac Elliott.");
  }

  // Quy tac 3: Song 4 khong choi lan vung gia Song 1
  const rule3Ok = isUptrend ? p4.price > p1.price : p4.price < p1.price;
  if (!rule3Ok) violations.push("Song 4 choi lan vung gia Song 1 - vi pham quy tac Elliott.");

  return violations;
}

interface DrawingEvents extends Record<string, unknown> {
  "primitive:created": DrawnPrimitive;
  "primitive:draft-updated": { toolType: DrawingToolType; p1: DomainPoint; p2: DomainPoint } | null;
  "primitive:deleted": { id: string };
  "elliott:draft-updated": DomainPoint[];
}

export class DrawingManager {
  private primitives: DrawnPrimitive[] = [];
  private draftStart: DomainPoint | null = null;
  private draftTool: DrawingToolType | null = null;
  private fibExtensionMode = false;
  private elliottDraft: DomainPoint[] = [];
  private emitter = new EventEmitter<DrawingEvents>();
  private idCounter = 0;

  on<K extends keyof DrawingEvents>(event: K, handler: (payload: DrawingEvents[K]) => void) {
    return this.emitter.on(event, handler);
  }

  setFibExtensionMode(on: boolean): void { this.fibExtensionMode = on; }

  // ===== Cac tool 2-diem cu (rectangle/trendline/fibonacci) - GIU NGUYEN =====
  startDraw(tool: DrawingToolType, point: DomainPoint): void {
    if (tool === "elliott") { this.addElliottPoint(point); return; }
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
    } else if (this.draftTool === "fibonacci") {
      primitive = {
        id, toolType: "fibonacci", p1: this.draftStart, p2: endPoint,
        levels: buildFibLevels(this.draftStart, endPoint, this.fibExtensionMode), createdAt: Date.now(),
      };
    } else {
      return null;
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

  // ===== Elliott Wave - click nhieu lan de them diem, khac han co che keo-tha =====
  addElliottPoint(point: DomainPoint): void {
    this.elliottDraft = [...this.elliottDraft, point];
    this.emitter.emit("elliott:draft-updated", this.elliottDraft);

    if (this.elliottDraft.length >= ELLIOTT_POINT_COUNT) {
      const id = `prim-${++this.idCounter}-${Date.now()}`;
      const points = this.elliottDraft.slice(0, ELLIOTT_POINT_COUNT);
      const violations = validateElliottRules(points);
      const marking: ElliottWaveMarking = {
        id, toolType: "elliott", points, labels: ELLIOTT_LABELS, violations, createdAt: Date.now(),
      };
      this.primitives.push(marking);
      this.elliottDraft = [];
      this.emitter.emit("elliott:draft-updated", []);
      this.emitter.emit("primitive:created", marking);
    }
  }

  cancelElliottDraft(): void {
    this.elliottDraft = [];
    this.emitter.emit("elliott:draft-updated", []);
  }

  getElliottDraft(): DomainPoint[] { return this.elliottDraft; }

  deletePrimitive(id: string): void { this.primitives = this.primitives.filter((p) => p.id !== id); this.emitter.emit("primitive:deleted", { id }); }
  getPrimitives(): DrawnPrimitive[] { return this.primitives; }
  clearAll(): void {
    const ids = this.primitives.map((p) => p.id);
    this.primitives = [];
    this.elliottDraft = [];
    ids.forEach((id) => this.emitter.emit("primitive:deleted", { id }));
  }
}
