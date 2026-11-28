// TA-T6a (28/11/2026, docs/ta-tradingview §T6a) — BỘ CÔNG CỤ VẼ chuẩn TradingView dưới dạng MỘT loại hình chung "shape":
// mỗi hình = kiểu (kind) + danh sách điểm neo (ngày, giá) + chữ (tuỳ chọn). Thêm công cụ mới (T6b) chỉ cần thêm một kiểu vào SHAPE_SPEC
// + cách vẽ / cách bấm chọn ở đây — không đổi cơ chế vẽ, chọn, kéo, hoàn tác, lưu theo tài khoản.
// Hàm thuần (không DOM): dựng scene + kiểm thử độc lập.
import type { DomainPoint } from "../DrawingManager";
import type { SceneItem } from "../chart/scene";
import { LABEL_PRIORITY } from "../chart/scene";
import { viPrice } from "../chart/viFormat";

export type ShapeKind =
  | "hline" | "hray" | "ray" | "extended" | "channel"          // Đường
  | "priceRange" | "dateRange" | "measure"                       // Đo
  | "long" | "short"                                             // Dự báo vị thế
  | "text" | "arrow";                                            // Chú thích

export type ShapeGroup = "lines" | "measure" | "position" | "annotate";
/** clicks = số cú bấm để tạo hình; stored = số điểm lưu (vị thế Mua / Bán: 2 cú bấm, lưu 3 điểm — điểm dừng tự đặt R:R 2). */
export const SHAPE_SPEC: Record<ShapeKind, { name: string; group: ShapeGroup; clicks: number; stored: number; hint: string }> = {
  hline: { name: "Đường ngang", group: "lines", clicks: 1, stored: 1, hint: "bấm một điểm" },
  hray: { name: "Tia ngang", group: "lines", clicks: 1, stored: 1, hint: "bấm điểm bắt đầu" },
  ray: { name: "Tia", group: "lines", clicks: 2, stored: 2, hint: "bấm 2 điểm" },
  extended: { name: "Đường mở rộng", group: "lines", clicks: 2, stored: 2, hint: "bấm 2 điểm" },
  channel: { name: "Kênh song song", group: "lines", clicks: 3, stored: 3, hint: "bấm 2 điểm đường gốc, điểm 3 = bề rộng kênh" },
  priceRange: { name: "Đo khoảng giá", group: "measure", clicks: 2, stored: 2, hint: "bấm 2 điểm" },
  dateRange: { name: "Đo khoảng thời gian", group: "measure", clicks: 2, stored: 2, hint: "bấm 2 điểm" },
  measure: { name: "Đo giá + thời gian", group: "measure", clicks: 2, stored: 2, hint: "bấm 2 điểm" },
  long: { name: "Vị thế Mua", group: "position", clicks: 2, stored: 3, hint: "bấm giá vào lệnh rồi giá mục tiêu (điểm dừng tự đặt, kéo để chỉnh)" },
  short: { name: "Vị thế Bán", group: "position", clicks: 2, stored: 3, hint: "bấm giá vào lệnh rồi giá mục tiêu (điểm dừng tự đặt, kéo để chỉnh)" },
  text: { name: "Chữ", group: "annotate", clicks: 1, stored: 1, hint: "bấm nơi đặt chữ" },
  arrow: { name: "Mũi tên", group: "annotate", clicks: 2, stored: 2, hint: "bấm điểm đầu rồi điểm mũi tên" },
};
export const SHAPE_KINDS = Object.keys(SHAPE_SPEC) as ShapeKind[];
export const SHAPE_GROUPS: { id: ShapeGroup; label: string }[] = [
  { id: "lines", label: "Đường" }, { id: "measure", label: "Đo" }, { id: "position", label: "Dự báo vị thế" }, { id: "annotate", label: "Chữ & mũi tên" },
];

/** Màu hình vẽ mặc định (đường TradingView) + màu lời / lỗ (tăng / giảm của dự án). */
const LINE = "#2962FF";
const UP = "#34d399", DOWN = "#fb7185";
const a = (hex: string, alpha: number) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`; };

/** Hoàn thiện điểm khi đủ số cú bấm: vị thế Mua / Bán thêm điểm dừng đối xứng một nửa (R:R = 2). */
export function completeShapePoints(kind: ShapeKind, clicks: DomainPoint[]): DomainPoint[] {
  if ((kind === "long" || kind === "short") && clicks.length >= 2) {
    const [entry, target] = clicks;
    return [entry, target, { date: target.date, price: entry.price - (target.price - entry.price) / 2 }];
  }
  return clicks.slice(0, SHAPE_SPEC[kind].stored);
}

export interface ShapeCtx { bars: readonly { date: string }[]; digits?: 0 | 2 }
const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const signed = (v: number, d: 0 | 2) => `${v >= 0 ? "+" : "−"}${viPrice(Math.abs(v), d)}`;
/** Chỉ số nến của một ngày (nến chính nó, hoặc nến gần nhất trước đó). */
function barIndex(bars: readonly { date: string }[], date: string): number {
  let lo = 0, hi = bars.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (bars[m].date <= date) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}
const sp = (p: DomainPoint) => ({ t: p.date, price: p.price });

/** Dựng phần tử scene cho một hình (đủ điểm) — dùng cho cả hình đã vẽ và bản nháp (có `draft` = nét đứt). */
export function shapeScene(kind: ShapeKind, pts: DomainPoint[], text: string | undefined, ctx: ShapeCtx, draft = false): SceneItem[] {
  const d = ctx.digits ?? 2, dash = draft ? [4, 3] : undefined, user = LABEL_PRIORITY.user;
  const out: SceneItem[] = [];
  const [p0, p1, p2] = pts;
  if (!p0) return out;
  const first = ctx.bars[0]?.date ?? p0.date, last = ctx.bars[ctx.bars.length - 1]?.date ?? p0.date;
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

/** Kết quả chạm: điểm neo thứ `index` (sửa) hoặc thân (dời). null = không chạm. */
export function shapeHit(kind: ShapeKind, pts: DomainPoint[], text: string | undefined, at: Px, project: (p: DomainPoint) => Px | null, tol: number):
  { part: "pt"; index: number; dist: number } | { part: "body"; dist: number } | null {
  const P = pts.map(project);
  if (P.some((x) => !x)) return null;
  const Q = P as Px[];
  let bestI = -1, bestD = Infinity;
  Q.forEach((q, i) => { const dd = dist(at, q); if (dd < bestD) { bestD = dd; bestI = i; } });
  if (bestD <= tol * 1.5) return { part: "pt", index: bestI, dist: bestD };
  const [a0, a1, a2] = Q;
  let d = Infinity;
  switch (kind) {
    case "hline": d = Math.abs(at.y - a0.y); break;
    case "hray": d = at.x >= a0.x - tol ? Math.abs(at.y - a0.y) : Infinity; break;
    case "ray": d = a1 ? distSeg(at, a0, far(a0, a1)) : Infinity; break;
    case "extended": d = a1 ? distSeg(at, far(a1, a0), far(a0, a1)) : Infinity; break;
    case "arrow": d = a1 ? distSeg(at, a0, a1) : Infinity; break;
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
