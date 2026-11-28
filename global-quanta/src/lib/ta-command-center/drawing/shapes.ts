// TA-T6a (28/11/2026, docs/ta-tradingview §T6a) — BỘ CÔNG CỤ VẼ chuẩn TradingView dưới dạng MỘT loại hình chung "shape":
// mỗi hình = kiểu (kind) + danh sách điểm neo (ngày, giá) + chữ (tuỳ chọn). Thêm công cụ mới chỉ cần thêm một kiểu vào SHAPE_SPEC
// + cách vẽ / cách bấm chọn ở đây — không đổi cơ chế vẽ, chọn, kéo, hoàn tác, lưu theo tài khoản.
// TA-T6b (28/11): thêm mẫu hình giá (XABCD, Cypher, Vai-đầu-vai, ABCD, Tam giác, Three drives), sóng Elliott (5 kiểu),
// chu kỳ (đường chu kỳ, chu kỳ thời gian, đường sin), cọ vẽ / bút dạ quang (kéo tay), mũi tên (4 kiểu), hình học (9 kiểu).
// Hàm thuần (không DOM): dựng scene + kiểm thử độc lập.
import type { DomainPoint } from "../DrawingManager";
import type { SceneItem } from "../chart/scene";
import { LABEL_PRIORITY } from "../chart/scene";
import { viPrice } from "../chart/viFormat";
import {
  controlThrough, cycleXs, distPolyline, distPt, insidePolygon, rotRectCorners, sampleCubic, sampleQuad, sineY, type XY,
} from "./geometry";

export type ShapeKind =
  | "hline" | "hray" | "ray" | "extended" | "channel"                                   // Đường
  | "xabcd" | "cypher" | "headShoulders" | "abcd" | "trianglePattern" | "threeDrives"   // Mẫu hình giá
  | "impulse" | "correction" | "triangleE" | "wxy" | "wxyxz"                            // Sóng Elliott
  | "cyclicLines" | "timeCycles" | "sineLine"                                            // Chu kỳ
  | "long" | "short"                                                                     // Dự báo vị thế
  | "priceRange" | "dateRange" | "measure"                                               // Đo
  | "brush" | "highlighter"                                                              // Cọ vẽ
  | "text"                                                                               // Chữ
  | "arrowMarker" | "arrow" | "arrowUp" | "arrowDown"                                    // Mũi tên
  | "rotatedRect" | "path" | "circle" | "ellipse" | "polyline" | "triangleShape" | "arc" | "curve" | "doubleCurve"; // Hình học

export type ShapeGroup = "lines" | "patterns" | "elliott" | "cycles" | "position" | "measure" | "brushes" | "annotate" | "arrows" | "geometry";
/**
 * clicks = số cú bấm để tạo hình (mode "multi": số điểm TỐI THIỂU, bấm đúp / Enter để xong; mode "drag": kéo tay, nhả chuột là xong);
 * stored = số điểm lưu (vị thế Mua / Bán: 2 cú bấm, lưu 3 điểm — điểm dừng tự đặt R:R 2; multi / drag: tối đa MAX_SHAPE_POINTS).
 * labels = nhãn các điểm (mẫu hình, Elliott) — bản nháp hiện dần từng nhãn khi bấm.
 */
export interface ShapeSpec { name: string; group: ShapeGroup; clicks: number; stored: number; hint: string; mode?: "multi" | "drag"; labels?: string[] }
export const MAX_SHAPE_POINTS = 400;
const P = (name: string, group: ShapeGroup, clicks: number, hint: string, extra: Partial<ShapeSpec> = {}): ShapeSpec => ({ name, group, clicks, stored: clicks, hint, ...extra });
const nodes = (s: string) => s.split(" ").map((x) => (x === "·" ? "" : x));
export const SHAPE_SPEC: Record<ShapeKind, ShapeSpec> = {
  hline: P("Đường ngang", "lines", 1, "bấm một điểm"),
  hray: P("Tia ngang", "lines", 1, "bấm điểm bắt đầu"),
  ray: P("Tia", "lines", 2, "bấm 2 điểm"),
  extended: P("Đường mở rộng", "lines", 2, "bấm 2 điểm"),
  channel: P("Kênh song song", "lines", 3, "bấm 2 điểm đường gốc, điểm 3 = bề rộng kênh"),
  xabcd: P("Mẫu hình XABCD", "patterns", 5, "bấm lần lượt X, A, B, C, D", { labels: nodes("X A B C D") }),
  cypher: P("Mẫu hình Cypher", "patterns", 5, "bấm lần lượt X, A, B, C, D", { labels: nodes("X A B C D") }),
  headShoulders: P("Vai - đầu - vai", "patterns", 7, "bấm 7 điểm: chân, vai trái, cổ, đầu, cổ, vai phải, chân", { labels: nodes("· Vai_trái · Đầu · Vai_phải ·").map((x) => x.replace("_", " ")) }),
  abcd: P("Mẫu hình ABCD", "patterns", 4, "bấm lần lượt A, B, C, D", { labels: nodes("A B C D") }),
  trianglePattern: P("Mẫu hình tam giác", "patterns", 4, "bấm lần lượt A, B, C, D (đỉnh / đáy xen kẽ)", { labels: nodes("A B C D") }),
  threeDrives: P("Mẫu hình Three drives", "patterns", 7, "bấm 7 điểm: gốc, đỉnh 1, hồi, đỉnh 2, hồi, đỉnh 3, kết thúc", { labels: nodes("0 1 · 2 · 3 ·") }),
  impulse: P("Sóng đẩy Elliott", "elliott", 6, "bấm 6 điểm: 0, 1, 2, 3, 4, 5", { labels: nodes("(0) (1) (2) (3) (4) (5)") }),
  correction: P("Sóng điều chỉnh Elliott", "elliott", 4, "bấm 4 điểm: 0, A, B, C", { labels: nodes("(0) (A) (B) (C)") }),
  triangleE: P("Tam giác Elliott", "elliott", 6, "bấm 6 điểm: 0, A, B, C, D, E", { labels: nodes("(0) (A) (B) (C) (D) (E)") }),
  wxy: P("Điều chỉnh kép Elliott (WXY)", "elliott", 4, "bấm 4 điểm: 0, W, X, Y", { labels: nodes("(0) (W) (X) (Y)") }),
  wxyxz: P("Điều chỉnh ba Elliott (WXYXZ)", "elliott", 6, "bấm 6 điểm: 0, W, X, Y, X, Z", { labels: nodes("(0) (W) (X) (Y) (X) (Z)") }),
  cyclicLines: P("Đường chu kỳ", "cycles", 2, "bấm 2 điểm = một chu kỳ; vạch lặp cách đều"),
  timeCycles: P("Chu kỳ thời gian", "cycles", 2, "bấm 2 điểm = đường kính vòng đầu; các vòng lặp cách đều"),
  sineLine: P("Đường sin", "cycles", 2, "bấm đỉnh (hoặc đáy) rồi cực trị kế tiếp"),
  long: { ...P("Vị thế Mua", "position", 2, "bấm giá vào lệnh rồi giá mục tiêu (điểm dừng tự đặt, kéo để chỉnh)"), stored: 3 },
  short: { ...P("Vị thế Bán", "position", 2, "bấm giá vào lệnh rồi giá mục tiêu (điểm dừng tự đặt, kéo để chỉnh)"), stored: 3 },
  priceRange: P("Đo khoảng giá", "measure", 2, "bấm 2 điểm"),
  dateRange: P("Đo khoảng thời gian", "measure", 2, "bấm 2 điểm"),
  measure: P("Đo giá + thời gian", "measure", 2, "bấm 2 điểm"),
  brush: { ...P("Cọ vẽ", "brushes", 2, "giữ chuột và kéo để vẽ, nhả chuột là xong", { mode: "drag" }), stored: MAX_SHAPE_POINTS },
  highlighter: { ...P("Bút dạ quang", "brushes", 2, "giữ chuột và kéo để tô, nhả chuột là xong", { mode: "drag" }), stored: MAX_SHAPE_POINTS },
  text: P("Chữ", "annotate", 1, "bấm nơi đặt chữ"),
  arrowMarker: P("Dấu mũi tên", "arrows", 2, "bấm điểm đầu rồi điểm mũi tên"),
  arrow: P("Mũi tên", "arrows", 2, "bấm điểm đầu rồi điểm mũi tên"),
  arrowUp: P("Mũi tên lên", "arrows", 1, "bấm nơi đặt dấu"),
  arrowDown: P("Mũi tên xuống", "arrows", 1, "bấm nơi đặt dấu"),
  rotatedRect: P("Hình chữ nhật xoay", "geometry", 3, "bấm 2 điểm một cạnh, điểm 3 = bề rộng"),
  path: { ...P("Đường dẫn", "geometry", 2, "bấm từng điểm; bấm đúp hoặc Enter để xong", { mode: "multi" }), stored: MAX_SHAPE_POINTS },
  circle: P("Hình tròn", "geometry", 2, "bấm tâm rồi điểm trên đường tròn"),
  ellipse: P("Hình elip", "geometry", 2, "bấm 2 góc đối của khung elip"),
  polyline: { ...P("Đường gấp khúc", "geometry", 3, "bấm từng điểm; bấm đúp hoặc Enter để xong (khép kín)", { mode: "multi" }), stored: MAX_SHAPE_POINTS },
  triangleShape: P("Hình tam giác", "geometry", 3, "bấm 3 đỉnh"),
  arc: P("Cung", "geometry", 3, "bấm điểm đầu, điểm cung đi qua, điểm cuối"),
  curve: P("Đường cong", "geometry", 3, "bấm điểm đầu, điểm uốn (điều khiển), điểm cuối"),
  doubleCurve: P("Đường cong kép", "geometry", 4, "bấm điểm đầu, 2 điểm uốn, điểm cuối"),
};
export const SHAPE_KINDS = Object.keys(SHAPE_SPEC) as ShapeKind[];
/** Thứ tự nhóm trên thanh vẽ dọc — giống TradingView (đường, mẫu hình, Elliott, chu kỳ, dự báo, đo, cọ, chữ, mũi tên, hình học). */
export const SHAPE_GROUPS: { id: ShapeGroup; label: string }[] = [
  { id: "lines", label: "Đường" }, { id: "patterns", label: "Mẫu hình giá" }, { id: "elliott", label: "Sóng Elliott" }, { id: "cycles", label: "Chu kỳ" },
  { id: "position", label: "Dự báo vị thế" }, { id: "measure", label: "Đo" }, { id: "brushes", label: "Cọ vẽ" }, { id: "annotate", label: "Chữ" },
  { id: "arrows", label: "Mũi tên" }, { id: "geometry", label: "Hình học" },
];
/** Bản nháp vẽ dần (hiện từng nhãn / đoạn khi bấm) thay vì chỉ nối các điểm. */
export const isProgressive = (k: ShapeKind) => !!SHAPE_SPEC[k].labels || !!SHAPE_SPEC[k].mode;

/** Màu hình vẽ mặc định (đường TradingView) + màu lời / lỗ (tăng / giảm của dự án). */
const LINE = "#2962FF";
const UP = "#34d399", DOWN = "#fb7185";
const HIGHLIGHT = "#FFEB3B";
const a = (hex: string, alpha: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`; };

/** Hoàn thiện điểm khi đủ số cú bấm: vị thế Mua / Bán thêm điểm dừng đối xứng một nửa (R:R = 2). */
export function completeShapePoints(kind: ShapeKind, clicks: DomainPoint[]): DomainPoint[] {
  if ((kind === "long" || kind === "short") && clicks.length >= 2) {
    const [entry, target] = clicks;
    return [entry, target, { date: target.date, price: entry.price - (target.price - entry.price) / 2 }];
  }
  return clicks.slice(0, SHAPE_SPEC[kind].stored);
}

/** Điểm kéo tay / bấm nhiều: bỏ điểm trùng liên tiếp, lấy mẫu đều còn ≤ MAX_SHAPE_POINTS (giữ điểm đầu và cuối). */
export function thinPoints(pts: DomainPoint[], max = MAX_SHAPE_POINTS): DomainPoint[] {
  const dedup = pts.filter((p, i) => i === 0 || p.date !== pts[i - 1].date || p.price !== pts[i - 1].price);
  if (dedup.length <= max) return dedup;
  const out: DomainPoint[] = [];
  for (let i = 0; i < max; i++) out.push(dedup[Math.round((i * (dedup.length - 1)) / (max - 1))]);
  return out;
}

export interface ShapeCtx { bars: readonly { date: string }[]; digits?: 0 | 2 }
const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const signed = (v: number, d: 0 | 2) => `${v >= 0 ? "+" : "−"}${viPrice(Math.abs(v), d)}`;
const ratio = (num: number, den: number) => (den ? Math.abs(num / den) : 0).toLocaleString("vi-VN", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
/** Chỉ số nến của một ngày (nến chính nó, hoặc nến gần nhất trước đó). */
function barIndex(bars: readonly { date: string }[], date: string): number {
  let lo = 0, hi = bars.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (bars[m].date <= date) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}
const sp = (p: DomainPoint) => ({ t: p.date, price: p.price });

/** Đoạn nét đứt nối p -> q kèm tỉ lệ Fibonacci ở giữa (như TradingView: XB, AC, BD, XD). */
function ratioLeg(out: SceneItem[], ctx: ShapeCtx, p: DomainPoint, q: DomainPoint, label: string) {
  out.push({ kind: "segment", a: sp(p), b: sp(q), color: a(LINE, 0.7), width: 1, dash: [4, 3] });
  const i = barIndex(ctx.bars, p.date), j = barIndex(ctx.bars, q.date);
  const mid = ctx.bars[Math.round((i + j) / 2)]?.date ?? q.date;
  out.push({ kind: "text", t: mid, price: (p.price + q.price) / 2, label: { text: label, color: "#c7d2fe", priority: LABEL_PRIORITY.user }, dy: 4 });
}
const leg = (p: DomainPoint | undefined, q: DomainPoint | undefined) => (p && q ? q.price - p.price : 0);

/** Dựng phần tử scene cho một hình (đủ điểm) — dùng cho cả hình đã vẽ và bản nháp (có `draft` = nét đứt). */
export function shapeScene(kind: ShapeKind, pts: DomainPoint[], text: string | undefined, ctx: ShapeCtx, draft = false): SceneItem[] {
  const d = ctx.digits ?? 2, dash = draft ? [4, 3] : undefined, user = LABEL_PRIORITY.user;
  const out: SceneItem[] = [];
  const [p0, p1, p2] = pts;
  if (!p0) return out;
  const first = ctx.bars[0]?.date ?? p0.date, last = ctx.bars[ctx.bars.length - 1]?.date ?? p0.date;
  const spec = SHAPE_SPEC[kind];
  // Mẫu hình giá + sóng Elliott: đường nối các điểm + nhãn điểm (vẽ dần khi bấm).
  if (spec.group === "patterns" || spec.group === "elliott") {
    const S = pts.map(sp);
    if (spec.group === "patterns") {
      // Tô hai tam giác XAB / BCD (XABCD, Cypher) hoặc ba "mái" (vai-đầu-vai), như TradingView.
      const tris = kind === "xabcd" || kind === "cypher" ? [[0, 1, 2], [2, 3, 4]] : kind === "headShoulders" ? [[0, 1, 2], [2, 3, 4], [4, 5, 6]] : [];
      for (const t of tris) if (t.every((i) => S[i])) out.push({ kind: "polygon", points: t.map((i) => S[i]), fill: a(LINE, 0.14) });
      if (kind === "trianglePattern" && pts.length >= 4) out.push({ kind: "polygon", points: [S[0], S[2], S[3], S[1]], fill: a(LINE, 0.1) });
    }
    if (S.length >= 2) out.push({ kind: "poly", points: S, color: LINE, width: 1.5, dash });
    out.push({ kind: "poly", points: S, color: spec.group === "elliott" ? "#93c5fd" : "#c7d2fe", width: 0, nodeLabels: spec.labels!.slice(0, S.length), nodeStyle: "halo" });
    const [X, A, B, C, D] = pts;
    if (kind === "xabcd" || kind === "cypher") {
      if (B) ratioLeg(out, ctx, X, B, ratio(leg(A, B), leg(X, A)));
      if (C) ratioLeg(out, ctx, A, C, ratio(leg(B, C), leg(A, B)));
      if (D && kind === "xabcd") { ratioLeg(out, ctx, B, D, ratio(leg(C, D), leg(B, C))); ratioLeg(out, ctx, X, D, ratio(leg(A, D), leg(X, A))); }
      if (D && kind === "cypher") ratioLeg(out, ctx, X, D, ratio(leg(C, D), leg(X, C)));
    } else if (kind === "abcd" || kind === "threeDrives") {
      for (let k = 2; k < pts.length; k++) ratioLeg(out, ctx, pts[k - 2], pts[k], ratio(leg(pts[k - 1], pts[k]), leg(pts[k - 2], pts[k - 1])));
    } else if (kind === "trianglePattern") {
      if (C) out.push({ kind: "ray", a: sp(A), b: sp(C), color: a(LINE, 0.8), width: 1, dash: [4, 3] });
      if (D) out.push({ kind: "ray", a: sp(B), b: sp(D), color: a(LINE, 0.8), width: 1, dash: [4, 3] });
    } else if (kind === "headShoulders" && pts.length >= 5) {
      out.push({ kind: "ray", a: sp(pts[2]), b: sp(pts[4]), color: "#f59e0b", width: 1.5, dash: draft ? [4, 3] : undefined });
      out.push({ kind: "text", t: pts[4].date, price: pts[4].price, label: { text: "Đường cổ", color: "#f59e0b", priority: user }, dy: 14 });
    }
    return out;
  }
  switch (kind) {
    case "hline":
      out.push({ kind: "hline", t1: first, t2: null, price: p0.price, color: LINE, width: 1, dash });
      out.push({ kind: "text", t: last, price: p0.price, label: { text: viPrice(p0.price, d), color: LINE, priority: user }, dy: -2 });
      break;
    case "hray":
      out.push({ kind: "hline", t1: p0.date, t2: null, price: p0.price, color: LINE, width: 1, dash, label: { text: viPrice(p0.price, d), color: LINE, priority: user } });
      break;
    case "ray": case "extended":
      if (p1) out.push({ kind: "ray", a: sp(p0), b: sp(p1), both: kind === "extended", color: LINE, width: 1.5, dash });
      break;
    case "arrow":
      if (p1) out.push({ kind: "segment", a: sp(p0), b: sp(p1), color: LINE, width: 2, dash, arrow: true });
      break;
    case "arrowMarker":
      if (p1) out.push({ kind: "segment", a: sp(p0), b: sp(p1), color: UP, width: 4, dash, arrow: true });
      if (p1 && text?.trim()) out.push({ kind: "text", t: p0.date, price: p0.price, label: { text: text.trim(), color: "#f8fafc", priority: user }, dy: 14 });
      break;
    case "arrowUp": case "arrowDown":
      out.push({ kind: "glyph", t: p0.date, price: p0.price, dir: kind === "arrowUp" ? "up" : "down", color: kind === "arrowUp" ? UP : DOWN,
        ...(text?.trim() ? { label: { text: text.trim(), color: "#f8fafc", priority: user } } : {}) });
      break;
    case "channel": {
      if (!p1) break;
      out.push({ kind: "segment", a: sp(p0), b: sp(p1), color: LINE, width: 1.5, dash });
      if (!p2) break;
      // Đường song song đi qua điểm 3: dời cả đoạn gốc theo khoảng cách giá tại thời điểm của điểm 3 (cùng độ dốc theo nến).
      const i0 = barIndex(ctx.bars, p0.date), i1 = barIndex(ctx.bars, p1.date), i2 = barIndex(ctx.bars, p2.date);
      const slope = i1 !== i0 ? (p1.price - p0.price) / (i1 - i0) : 0;
      const off = p2.price - (p0.price + slope * (i2 - i0));
      const q0 = { t: p0.date, price: p0.price + off }, q1 = { t: p1.date, price: p1.price + off };
      out.push({ kind: "polygon", points: [sp(p0), sp(p1), q1, q0], fill: a(LINE, 0.08) });
      out.push({ kind: "segment", a: q0, b: q1, color: LINE, width: 1.5, dash });
      out.push({ kind: "segment", a: { t: p0.date, price: p0.price + off / 2 }, b: { t: p1.date, price: p1.price + off / 2 }, color: a(LINE, 0.6), width: 1, dash: [4, 4] });
      break;
    }
    case "cyclicLines": case "timeCycles": case "sineLine":
      if (p1) out.push({ kind: "cycle", a: sp(p0), b: sp(p1), mode: kind === "cyclicLines" ? "lines" : kind === "timeCycles" ? "arcs" : "sine", color: LINE, dash });
      break;
    case "brush": case "highlighter":
      if (pts.length >= 2) out.push({ kind: "pathx", points: pts.map(sp), mode: "open", color: kind === "brush" ? LINE : a(HIGHLIGHT, 0.4), width: kind === "brush" ? 2 : 14, round: true });
      break;
    case "path": case "polyline":
      if (pts.length >= 2) out.push({ kind: "pathx", points: pts.map(sp), mode: kind === "polyline" && !draft ? "closed" : "open", color: LINE, width: 1.5, dash,
        ...(kind === "polyline" && !draft ? { fill: a(LINE, 0.12) } : {}), ...(kind === "path" ? { arrow: true } : {}) });
      break;
    case "triangleShape":
      if (p1) out.push({ kind: "pathx", points: pts.map(sp), mode: p2 ? "closed" : "open", color: LINE, width: 1.5, dash, fill: p2 ? a(LINE, 0.12) : undefined });
      break;
    case "rotatedRect":
      if (p1) out.push(p2 ? { kind: "pathx", points: pts.map(sp), mode: "rotRect", color: LINE, width: 1.5, dash, fill: a(LINE, 0.12) }
        : { kind: "segment", a: sp(p0), b: sp(p1), color: LINE, width: 1.5, dash });
      break;
    case "circle": case "ellipse":
      if (p1) out.push({ kind: "pathx", points: [sp(p0), sp(p1)], mode: kind, color: LINE, width: 1.5, dash, fill: a(LINE, 0.12) });
      break;
    case "arc": case "curve":
      if (p2) out.push({ kind: "pathx", points: pts.map(sp), mode: kind === "arc" ? "arc" : "quad", color: LINE, width: 1.5, dash, ...(kind === "arc" ? { fill: a(LINE, 0.12) } : {}) });
      else if (p1) out.push({ kind: "segment", a: sp(p0), b: sp(p1), color: LINE, width: 1.5, dash: [4, 3] });
      break;
    case "doubleCurve":
      if (pts.length >= 4) out.push({ kind: "pathx", points: pts.map(sp), mode: "cubic", color: LINE, width: 1.5, dash });
      else if (p1) out.push({ kind: "poly", points: pts.map(sp), color: LINE, width: 1, dash: [4, 3] });
      break;
    case "priceRange": case "dateRange": case "measure": {
      if (!p1) break;
      const diff = p1.price - p0.price, up = diff >= 0;
      const n = Math.abs(barIndex(ctx.bars, p1.date) - barIndex(ctx.bars, p0.date));
      const color = kind === "measure" ? (up ? UP : DOWN) : LINE;
      out.push({ kind: "zone", t1: p0.date, t2: p1.date, top: Math.max(p0.price, p1.price), bottom: Math.min(p0.price, p1.price), fill: a(color, 0.12), stroke: a(color, 0.7), dash });
      const parts = kind === "dateRange" ? [`${n} nến`] : kind === "priceRange" ? [`${signed(diff, d)} (${pct(p0.price ? (diff / p0.price) * 100 : 0)})`]
        : [`${signed(diff, d)} (${pct(p0.price ? (diff / p0.price) * 100 : 0)})`, `${n} nến`];
      out.push({ kind: "text", t: p1.date, price: p1.price, label: { text: parts.join(" · "), color, priority: user }, dy: up ? -6 : 14 });
      break;
    }
    case "long": case "short": {
      if (!p1) break;
      const stop = p2 ?? completeShapePoints(kind, [p0, p1])[2];
      const isLong = kind === "long";
      const reward = Math.abs(p1.price - p0.price), risk = Math.abs(stop.price - p0.price);
      out.push({ kind: "zone", t1: p0.date, t2: p1.date, top: Math.max(p0.price, p1.price), bottom: Math.min(p0.price, p1.price), fill: a(UP, 0.16), stroke: a(UP, 0.6), dash });
      out.push({ kind: "zone", t1: p0.date, t2: p1.date, top: Math.max(p0.price, stop.price), bottom: Math.min(p0.price, stop.price), fill: a(DOWN, 0.16), stroke: a(DOWN, 0.6), dash });
      out.push({ kind: "hline", t1: p0.date, t2: p1.date, price: p0.price, color: "#94a3b8", width: 1 });
      const rr = risk > 0 ? reward / risk : 0;
      out.push({ kind: "text", t: p0.date, price: p1.price, label: { text: `${isLong ? "Mua" : "Bán"} · Mục tiêu ${pct(p0.price ? ((p1.price - p0.price) / p0.price) * 100 : 0)}`, color: UP, priority: user }, dy: isLong ? -4 : 14 });
      out.push({ kind: "text", t: p0.date, price: stop.price, label: { text: `Dừng ${pct(p0.price ? ((stop.price - p0.price) / p0.price) * 100 : 0)} · R:R ${rr.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}`, color: DOWN, priority: user }, dy: isLong ? 14 : -4 });
      break;
    }
    case "text":
      out.push({ kind: "text", t: p0.date, price: p0.price, label: { text: (text ?? "").trim() || "Chữ", color: "#f8fafc", priority: user } });
      break;
  }
  return out;
}

// ---- Bấm chọn (toạ độ màn hình qua project của thư viện -> luôn đúng khi kéo / zoom) ----
export interface Px { x: number; y: number }
const dist = (p: Px, q: Px) => Math.hypot(p.x - q.x, p.y - q.y);
function distSeg(p: Px, s: Px, e: Px): number {
  const dx = e.x - s.x, dy = e.y - s.y, l2 = dx * dx + dy * dy;
  if (!l2) return dist(p, s);
  const t = Math.max(0, Math.min(1, ((p.x - s.x) * dx + (p.y - s.y) * dy) / l2));
  return dist(p, { x: s.x + t * dx, y: s.y + t * dy });
}
const far = (s: Px, e: Px, k = 1e5): Px => { const L = dist(s, e) || 1; return { x: s.x + ((e.x - s.x) / L) * k, y: s.y + ((e.y - s.y) / L) * k }; };
const xy = (p: Px): XY => [p.x, p.y];

/** Kết quả chạm: điểm neo thứ `index` (sửa) hoặc thân (dời). null = không chạm. */
export function shapeHit(kind: ShapeKind, pts: DomainPoint[], text: string | undefined, at: Px, project: (p: DomainPoint) => Px | null, tol: number):
  { part: "pt"; index: number; dist: number } | { part: "body"; dist: number } | null {
  const P = pts.map(project);
  if (P.some((x) => !x)) return null;
  const Q = P as Px[];
  const spec = SHAPE_SPEC[kind];
  // Cọ vẽ / bút dạ quang: hàng trăm điểm -> chỉ dời cả nét (không sửa từng điểm).
  if (spec.mode !== "drag") {
    let bestI = -1, bestD = Infinity;
    Q.forEach((q, i) => { const dd = dist(at, q); if (dd < bestD) { bestD = dd; bestI = i; } });
    if (bestD <= tol * 1.5) return { part: "pt", index: bestI, dist: bestD };
  }
  const [a0, a1, a2] = Q;
  const A = xy(at), XYs = Q.map(xy);
  let d = Infinity;
  if (spec.group === "patterns" || spec.group === "elliott") {
    d = distPolyline(A, XYs);
    return d <= tol ? { part: "body", dist: d } : null;
  }
  switch (kind) {
    case "hline": d = Math.abs(at.y - a0.y); break;
    case "hray": d = at.x >= a0.x - tol ? Math.abs(at.y - a0.y) : Infinity; break;
    case "ray": d = a1 ? distSeg(at, a0, far(a0, a1)) : Infinity; break;
    case "extended": d = a1 ? distSeg(at, far(a1, a0), far(a0, a1)) : Infinity; break;
    case "arrow": case "arrowMarker": d = a1 ? distSeg(at, a0, a1) : Infinity; break;
    case "arrowUp": d = at.x >= a0.x - 9 && at.x <= a0.x + 9 && at.y >= a0.y && at.y <= a0.y + 22 ? tol : Infinity; break;
    case "arrowDown": d = at.x >= a0.x - 9 && at.x <= a0.x + 9 && at.y <= a0.y && at.y >= a0.y - 22 ? tol : Infinity; break;
    case "channel": {
      if (!a1) break;
      d = distSeg(at, a0, a1);
      if (a2) {
        const yAt = a1.x !== a0.x ? a0.y + ((a1.y - a0.y) * (a2.x - a0.x)) / (a1.x - a0.x) : a0.y;
        const off = a2.y - yAt;
        d = Math.min(d, distSeg(at, { x: a0.x, y: a0.y + off }, { x: a1.x, y: a1.y + off }));
        const lo = Math.min(a0.y, a1.y, a0.y + off, a1.y + off), hi = Math.max(a0.y, a1.y, a0.y + off, a1.y + off);
        if (at.x >= Math.min(a0.x, a1.x) && at.x <= Math.max(a0.x, a1.x) && at.y >= lo && at.y <= hi) d = Math.min(d, tol);
      }
      break;
    }
    case "cyclicLines": {
      if (!a1) break;
      const s = Math.abs(a1.x - a0.x);
      d = s < 2 ? Math.abs(at.x - a0.x) : Math.min(...cycleXs(xy(a0), xy(a1), at.x + s).map((x) => Math.abs(at.x - x)));
      break;
    }
    case "timeCycles": {
      if (!a1) break;
      const s = Math.abs(a1.x - a0.x);
      if (s < 2) break;
      // Giống hệt cách vẽ: các nửa vòng nối tiếp từ điểm bên trái, trên đường gốc (giá điểm 1).
      const x0 = Math.min(a0.x, a1.x), n = Math.floor((at.x - x0) / s), cx = x0 + (n + 0.5) * s;
      d = n >= 0 && at.y <= a0.y + tol ? Math.abs(distPt(A, [cx, a0.y]) - s / 2) : Infinity;
      break;
    }
    case "sineLine": d = a1 ? Math.abs(at.y - sineY(xy(a0), xy(a1), at.x)) : Infinity; break;
    case "brush": case "path": d = distPolyline(A, XYs); break;
    case "highlighter": d = Math.max(0, distPolyline(A, XYs) - 6); break;
    case "polyline": case "triangleShape": d = XYs.length > 2 && insidePolygon(A, XYs) ? 0 : distPolyline(A, XYs, XYs.length > 2); break;
    case "rotatedRect": {
      if (!a2) { d = a1 ? distSeg(at, a0, a1) : Infinity; break; }
      const C = rotRectCorners(xy(a0), xy(a1), xy(a2));
      d = insidePolygon(A, C) ? 0 : distPolyline(A, C, true);
      break;
    }
    case "circle": { if (!a1) break; const r = dist(a0, a1), c = dist(at, a0); d = c <= r ? 0 : c - r; break; }
    case "ellipse": {
      if (!a1) break;
      const cx = (a0.x + a1.x) / 2, cy = (a0.y + a1.y) / 2, rx = Math.abs(a1.x - a0.x) / 2 || 1, ry = Math.abs(a1.y - a0.y) / 2 || 1;
      const v = ((at.x - cx) / rx) ** 2 + ((at.y - cy) / ry) ** 2;
      d = v <= 1 ? 0 : (Math.sqrt(v) - 1) * Math.min(rx, ry);
      break;
    }
    case "arc": case "curve": {
      if (!a2) break;
      const ctl = kind === "arc" ? controlThrough(xy(a0), xy(a1), xy(a2)) : xy(a1);
      const S = sampleQuad(xy(a0), ctl, xy(a2));
      d = kind === "arc" && insidePolygon(A, S) ? 0 : distPolyline(A, S);
      break;
    }
    case "doubleCurve": d = XYs.length >= 4 ? distPolyline(A, sampleCubic(XYs[0], XYs[1], XYs[2], XYs[3])) : Infinity; break;
    case "text": {
      const w = Math.max(24, ((text ?? "").trim() || "Chữ").length * 7);
      d = at.x >= a0.x - 4 && at.x <= a0.x + w && at.y >= a0.y - 14 && at.y <= a0.y + 4 ? tol : Infinity;
      break;
    }
    default: {
      // Hộp đo / vị thế: trong hộp bao mọi điểm.
      const xs = Q.map((q) => q.x), ys = Q.map((q) => q.y);
      d = at.x >= Math.min(...xs) - tol && at.x <= Math.max(...xs) + tol && at.y >= Math.min(...ys) - tol && at.y <= Math.max(...ys) + tol ? tol : Infinity;
    }
  }
  return d <= tol ? { part: "body", dist: d } : null;
}
