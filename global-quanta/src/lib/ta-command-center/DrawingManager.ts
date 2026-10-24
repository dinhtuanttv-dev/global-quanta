import { EventEmitter } from "./EventEmitter";

export interface DomainPoint { date: string; price: number; }
export type DrawingToolType = "rectangle" | "trendline" | "fibonacci" | "elliott" | "fibTimeZone";

/** Super Chart SC3: thuộc tính quản lý đối tượng (danh sách đối tượng) — tuỳ chọn, lưu cùng hình vẽ. */
export interface PrimitiveMeta { name?: string; hidden?: boolean; locked?: boolean }
export interface RectangleZone extends PrimitiveMeta { id: string; toolType: "rectangle"; p1: DomainPoint; p2: DomainPoint; createdAt: number; }
export interface Trendline extends PrimitiveMeta { id: string; toolType: "trendline"; p1: DomainPoint; p2: DomainPoint; createdAt: number; }
export interface FibonacciRetracement extends PrimitiveMeta {
  id: string; toolType: "fibonacci"; p1: DomainPoint; p2: DomainPoint;
  levels: { ratio: number; price: number }[]; createdAt: number;
}
export interface ElliottWaveMarking extends PrimitiveMeta {
  id: string; toolType: "elliott";
  points: DomainPoint[]; labels: string[]; violations: string[]; createdAt: number;
}
export interface FibTimeZoneMarking extends PrimitiveMeta {
  id: string; toolType: "fibTimeZone"; anchor: DomainPoint; createdAt: number;
}
export type DrawnPrimitive = RectangleZone | Trendline | FibonacciRetracement | ElliottWaveMarking | FibTimeZoneMarking;

// ĐÃ SỬA: export 2 hằng số này để TVChartPanel.tsx dùng lại đúng công
// thức khi vẽ preview lưới Fibonacci lúc đang kéo chuột — tránh viết
// trùng lặp 1 bộ số khác có thể lệch với bản chính thức khi finishDraw().
export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
export const FIB_EXTENSION_RATIOS = [1.272, 1.618, 2.618];
const ELLIOTT_POINT_COUNT = 6;
const ELLIOTT_LABELS = ["0", "1", "2", "3", "4", "5"];

export const FIB_TIME_SEQUENCE = [1, 2, 3, 5, 8, 13, 21, 34, 55, 89];

/**
 * Mức Fibonacci Retracement: 0% tại điểm KẾT THÚC (p2), 100% tại điểm BẮT ĐẦU (p1) — chuẩn TradingView.
 * Kéo đáy→đỉnh (sóng tăng): 23,6% nằm ngay dưới đỉnh. Kéo đỉnh→đáy (sóng giảm): 23,6% nằm ngay trên đáy.
 * (Bản cũ luôn đặt 0% ở giá cao nhất -> sai với sóng giảm.) Mức mở rộng > 100% nằm vượt điểm bắt đầu.
 */
export function buildFibLevels(p1: DomainPoint, p2: DomainPoint, includeExtension: boolean) {
  const ratios = includeExtension ? [...FIB_RATIOS, ...FIB_EXTENSION_RATIOS] : FIB_RATIOS;
  return ratios.map((ratio) => ({ ratio, price: p2.price + (p1.price - p2.price) * ratio }));
}

function validateElliottRules(points: DomainPoint[]): string[] {
  const violations: string[] = [];
  if (points.length < ELLIOTT_POINT_COUNT) return violations;
  const [p0, p1, p2, p3, p4, p5] = points;
  const isUptrend = p1.price > p0.price;

  const rule1Ok = isUptrend ? p2.price > p0.price : p2.price < p0.price;
  if (!rule1Ok) violations.push("Sóng 2 hồi quá 100% sóng 1 — vi phạm quy tắc Elliott cơ bản.");

  const wave1Len = Math.abs(p1.price - p0.price);
  const wave3Len = Math.abs(p3.price - p2.price);
  const wave5Len = Math.abs(p5.price - p4.price);
  if (wave3Len < wave1Len && wave3Len < wave5Len) {
    violations.push("Sóng 3 ngắn nhất trong 3 sóng đẩy (1, 3, 5) — vi phạm quy tắc Elliott.");
  }

  const rule3Ok = isUptrend ? p4.price > p1.price : p4.price < p1.price;
  if (!rule3Ok) violations.push("Sóng 4 chồng lấn vùng giá sóng 1 — vi phạm quy tắc Elliott.");

  return violations;
}

interface DrawingEvents extends Record<string, unknown> {
  "primitive:created": DrawnPrimitive;
  "primitive:draft-updated": { toolType: DrawingToolType; p1: DomainPoint; p2: DomainPoint } | null;
  "primitive:deleted": { id: string };
  "elliott:draft-updated": DomainPoint[];
  "fibExtension:changed": boolean;
  "primitives:replaced": DrawnPrimitive[];
  "history:changed": { canUndo: boolean; canRedo: boolean };
}

/** Số bước hoàn tác tối đa (anh duyệt, lựa chọn 7). */
export const HISTORY_LIMIT = 50;
export type PrimitivePatch = Partial<Pick<RectangleZone, "p1" | "p2" | "name" | "hidden" | "locked">> & { anchor?: DomainPoint; points?: DomainPoint[] };

const TOOL_TYPES = new Set(["rectangle", "trendline", "fibonacci", "elliott", "fibTimeZone"]);
const isPoint = (p: unknown): p is DomainPoint =>
  !!p && typeof (p as DomainPoint).date === "string" && /^\d{4}-\d{2}-\d{2}/.test((p as DomainPoint).date) && Number.isFinite((p as DomainPoint).price);

/** Kiểm tra hình vẽ đã lưu (localStorage/đám mây) trước khi nạp — bỏ phần tử sai dạng. */
export function sanitizePrimitives(raw: unknown): DrawnPrimitive[] {
  if (!Array.isArray(raw)) return [];
  const clean = (p: DrawnPrimitive): DrawnPrimitive => {
    const { name, hidden, locked, ...rest } = p as DrawnPrimitive & PrimitiveMeta;
    return { ...rest, ...(typeof name === "string" && name.trim() ? { name: name.trim().slice(0, 40) } : {}), ...(hidden === true ? { hidden } : {}), ...(locked === true ? { locked } : {}) } as DrawnPrimitive;
  };
  return raw.filter((p): p is DrawnPrimitive => {
    if (!p || typeof p !== "object" || !TOOL_TYPES.has((p as DrawnPrimitive).toolType) || typeof (p as DrawnPrimitive).id !== "string") return false;
    const x = p as DrawnPrimitive;
    if (x.toolType === "elliott") return Array.isArray(x.points) && x.points.length === 6 && x.points.every(isPoint);
    if (x.toolType === "fibTimeZone") return isPoint(x.anchor);
    if (x.toolType === "fibonacci" && !Array.isArray(x.levels)) return false;
    return isPoint(x.p1) && isPoint(x.p2);
  }).slice(0, 100).map(clean);
}

/** Dời một điểm `dBars` nến (theo danh sách ngày của khung đang xem) và `dPrice` giá — dùng khi kéo cả hình. */
export function shiftPoint(p: DomainPoint, dBars: number, dPrice: number, dates: string[]): DomainPoint {
  const i = dates.indexOf(p.date);
  const j = i < 0 ? -1 : Math.max(0, Math.min(dates.length - 1, i + dBars));
  return { date: j < 0 ? p.date : dates[j], price: p.price + dPrice };
}

/** Dời toàn bộ hình (mọi điểm neo). */
export function shiftPrimitive(p: DrawnPrimitive, dBars: number, dPrice: number, dates: string[]): PrimitivePatch {
  if (p.toolType === "fibTimeZone") return { anchor: shiftPoint(p.anchor, dBars, dPrice, dates) };
  if (p.toolType === "elliott") return { points: p.points.map((x) => shiftPoint(x, dBars, dPrice, dates)) };
  return { p1: shiftPoint(p.p1, dBars, dPrice, dates), p2: shiftPoint(p.p2, dBars, dPrice, dates) };
}

export class DrawingManager {
  private primitives: DrawnPrimitive[] = [];
  private draftStart: DomainPoint | null = null;
  private draftTool: DrawingToolType | null = null;
  private fibExtensionMode = false;
  private elliottDraft: DomainPoint[] = [];
  private emitter = new EventEmitter<DrawingEvents>();
  private idCounter = 0;
  // SC3: lịch sử ảnh chụp danh sách hình (bất biến -> chụp bằng tham chiếu, không sao chép sâu).
  private past: DrawnPrimitive[][] = [];
  private future: DrawnPrimitive[][] = [];

  private emitHistory(): void { this.emitter.emit("history:changed", { canUndo: this.past.length > 0, canRedo: this.future.length > 0 }); }
  /** Ghi trạng thái hiện tại vào lịch sử TRƯỚC khi thay đổi (tạo / xoá / sửa / xoá tất cả). */
  private record(): void {
    this.past = [...this.past, this.primitives].slice(-HISTORY_LIMIT);
    this.future = [];
    this.emitHistory();
  }
  canUndo(): boolean { return this.past.length > 0; }
  canRedo(): boolean { return this.future.length > 0; }
  undo(): boolean {
    const prev = this.past[this.past.length - 1];
    if (!prev) return false;
    this.past = this.past.slice(0, -1);
    this.future = [this.primitives, ...this.future].slice(0, HISTORY_LIMIT);
    this.primitives = prev;
    this.emitter.emit("primitives:replaced", this.primitives);
    this.emitHistory();
    return true;
  }
  redo(): boolean {
    const next = this.future[0];
    if (!next) return false;
    this.future = this.future.slice(1);
    this.past = [...this.past, this.primitives].slice(-HISTORY_LIMIT);
    this.primitives = next;
    this.emitter.emit("primitives:replaced", this.primitives);
    this.emitHistory();
    return true;
  }
  /** Bắt đầu một thao tác kéo (sửa điểm neo / dời hình): ghi lịch sử MỘT lần, các cập nhật trong lúc kéo không ghi thêm. */
  beginEdit(): void { this.record(); }
  /** Sửa hình: điểm neo (Fibonacci tự tính lại các mức) hoặc thuộc tính tên / ẩn / khoá. Hình bị khoá chỉ đổi được tên / ẩn / khoá. */
  updatePrimitive(id: string, patch: PrimitivePatch, { record = true } = {}): boolean {
    const cur = this.primitives.find((p) => p.id === id);
    if (!cur) return false;
    const geometry = "p1" in patch || "p2" in patch || "anchor" in patch || "points" in patch;
    if (geometry && cur.locked) return false;
    if (record) this.record();
    let next = { ...cur, ...patch } as DrawnPrimitive;
    if (next.toolType === "fibonacci" && geometry) next = { ...next, levels: buildFibLevels(next.p1, next.p2, next.levels.length > FIB_RATIOS.length) };
    if (patch.name !== undefined && !patch.name.trim()) { const { name: _n, ...rest } = next as DrawnPrimitive & PrimitiveMeta; next = rest as DrawnPrimitive; }
    this.primitives = this.primitives.map((p) => (p.id === id ? next : p));
    this.emitter.emit("primitives:replaced", this.primitives);
    return true;
  }

  on<K extends keyof DrawingEvents>(event: K, handler: (payload: DrawingEvents[K]) => void) {
    return this.emitter.on(event, handler);
  }

  setFibExtensionMode(on: boolean): void {
    this.fibExtensionMode = on;
    this.emitter.emit("fibExtension:changed", on);
  }
  getFibExtensionMode(): boolean { return this.fibExtensionMode; }

  startDraw(tool: DrawingToolType, point: DomainPoint): void {
    if (tool === "elliott") { this.addElliottPoint(point); return; }
    if (tool === "fibTimeZone") { this.addFibTimeZone(point); return; }
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

    // ĐÃ SỬA — LỖI GỐC RỄ: .push() sửa trực tiếp mảng cũ, không tạo tham
    // chiếu mới. React (bên TVChartPanel.tsx) so sánh setPrimitives(...)
    // bằng tham chiếu — nhận "giống hệt trước" nên bỏ qua render, dù dữ
    // liệu thật đã đổi. Đây là nguyên nhân khiến hình vẽ mới (Rectangle/
    // Trendline/Fibonacci) không hiện ra cho tới khi 1 state KHÁC (như
    // toggle "AI Detection") vô tình kích hoạt render lại.
    this.record();
    this.primitives = [...this.primitives, primitive];
    this.draftStart = null; this.draftTool = null;
    this.emitter.emit("primitive:draft-updated", null);
    this.emitter.emit("primitive:created", primitive);
    return primitive;
  }

  cancelDraw(): void { this.draftStart = null; this.draftTool = null; this.emitter.emit("primitive:draft-updated", null); }

  addElliottPoint(point: DomainPoint): void {
    this.elliottDraft = [...this.elliottDraft, point];
    this.emitter.emit("elliott:draft-updated", this.elliottDraft);

    if (this.elliottDraft.length >= ELLIOTT_POINT_COUNT) {
      const id = `prim-${++this.idCounter}-${Date.now()}`;
      const points = this.elliottDraft.slice(0, ELLIOTT_POINT_COUNT);
      const violations = validateElliottRules(points);
      const marking: ElliottWaveMarking = { id, toolType: "elliott", points, labels: ELLIOTT_LABELS, violations, createdAt: Date.now() };
      // ĐÃ SỬA — cùng lỗi gốc rễ như finishDraw() ở trên.
      this.record();
      this.primitives = [...this.primitives, marking];
      this.elliottDraft = [];
      this.emitter.emit("elliott:draft-updated", []);
      this.emitter.emit("primitive:created", marking);
    }
  }

  cancelElliottDraft(): void { this.elliottDraft = []; this.emitter.emit("elliott:draft-updated", []); }
  getElliottDraft(): DomainPoint[] { return this.elliottDraft; }

  /** ĐÃ THÊM — tạo ngay 1 ElliottWaveMarking từ 6 điểm cho sẵn (ví dụ từ
   * gợi ý Zigzag), không cần người dùng click từng điểm. Dùng chung logic
   * validate quy tắc Elliott với addElliottPoint() để không lệch hành vi. */
  createElliottFromPoints(points: DomainPoint[]): ElliottWaveMarking | null {
    if (points.length !== ELLIOTT_POINT_COUNT) return null;
    const id = `prim-${++this.idCounter}-${Date.now()}`;
    const violations = validateElliottRules(points);
    const marking: ElliottWaveMarking = { id, toolType: "elliott", points, labels: ELLIOTT_LABELS, violations, createdAt: Date.now() };
    this.record();
    this.primitives = [...this.primitives, marking];
    this.emitter.emit("primitive:created", marking);
    return marking;
  }

  addFibTimeZone(point: DomainPoint): void {
    const id = `prim-${++this.idCounter}-${Date.now()}`;
    const marking: FibTimeZoneMarking = { id, toolType: "fibTimeZone", anchor: point, createdAt: Date.now() };
    // ĐÃ SỬA — cùng lỗi gốc rễ như finishDraw()/addElliottPoint() ở trên.
    this.record();
    this.primitives = [...this.primitives, marking];
    this.emitter.emit("primitive:created", marking);
  }

  /** Nạp hình vẽ đã lưu cho mã đang xem (không phát "primitive:created" -> không ghi nhật ký hợp lưu). */
  replaceAll(list: DrawnPrimitive[]): void {
    this.primitives = sanitizePrimitives(list);
    this.elliottDraft = [];
    // Nạp hình của mã khác: lịch sử hoàn tác là theo mã -> xoá (không hoàn tác "xuyên mã").
    this.past = []; this.future = [];
    this.emitter.emit("primitives:replaced", this.primitives);
    this.emitHistory();
  }

  deletePrimitive(id: string): void {
    if (!this.primitives.some((p) => p.id === id)) return;
    this.record();
    this.primitives = this.primitives.filter((p) => p.id !== id);
    this.emitter.emit("primitive:deleted", { id });
  }
  getPrimitives(): DrawnPrimitive[] { return this.primitives; }
  clearAll(): void {
    const ids = this.primitives.map((p) => p.id);
    if (ids.length) this.record(); // hoàn tác được (SC3: "Xoá tất cả" có xác nhận + hoàn tác)
    this.primitives = [];
    this.elliottDraft = [];
    ids.forEach((id) => this.emitter.emit("primitive:deleted", { id }));
  }
}
