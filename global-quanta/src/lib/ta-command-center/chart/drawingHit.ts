// Super Chart SC3 — chọn hình vẽ trên biểu đồ (hàm thuần): điểm con trỏ (px, trong khung chart) -> hình gần nhất + phần bị chạm
// (điểm neo p1 / p2 / anchor để sửa, hoặc thân hình để dời). Toạ độ màn hình lấy qua `project` (ngày, giá) -> px của thư viện,
// nên luôn đúng khi kéo / zoom. Dung sai lớn hơn cho cảm ứng. Hình bị ẩn không chọn được; hình bị khoá chọn được nhưng không sửa.
import type { DomainPoint, DrawnPrimitive } from "../DrawingManager";

export interface Px { x: number; y: number }
export type Project = (p: DomainPoint) => Px | null;
export type HitPart = "p1" | "p2" | "anchor" | "body";
export interface Hit { id: string; part: HitPart; dist: number }

const dist = (a: Px, b: Px) => Math.hypot(a.x - b.x, a.y - b.y);
/** Khoảng cách từ điểm tới đoạn thẳng ab. */
export function distToSegment(p: Px, a: Px, b: Px): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  if (!l2) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function hitOne(p: DrawnPrimitive, at: Px, project: Project, tol: number, height: number): Hit | null {
  if (p.hidden) return null;
  if (p.toolType === "fibTimeZone") {
    const a = project(p.anchor);
    if (!a) return null;
    const d = Math.abs(at.x - a.x);
    return d <= tol && at.y >= 0 && at.y <= height ? { id: p.id, part: dist(at, a) <= tol * 1.5 ? "anchor" : "body", dist: d } : null;
  }
  if (p.toolType === "elliott") {
    const pts = p.points.map(project).filter((x): x is Px => !!x);
    let best = Infinity;
    for (let k = 1; k < pts.length; k++) best = Math.min(best, distToSegment(at, pts[k - 1], pts[k]));
    return best <= tol ? { id: p.id, part: "body", dist: best } : null;
  }
  const a = project(p.p1), b = project(p.p2);
  if (!a || !b) return null;
  const da = dist(at, a), db = dist(at, b);
  const handle = Math.min(da, db) <= tol * 1.5 ? (da <= db ? "p1" : "p2") : null;
  if (p.toolType === "trendline") {
    const d = distToSegment(at, a, b);
    return handle ? { id: p.id, part: handle, dist: Math.min(da, db) } : d <= tol ? { id: p.id, part: "body", dist: d } : null;
  }
  // Zone / Fibonacci: trong hộp p1–p2 (Fibonacci: dải giữa hai điểm, toàn bộ bề ngang giữa hai mốc thời gian).
  const x0 = Math.min(a.x, b.x) - tol, x1 = Math.max(a.x, b.x) + tol, y0 = Math.min(a.y, b.y) - tol, y1 = Math.max(a.y, b.y) + tol;
  if (handle) return { id: p.id, part: handle, dist: Math.min(da, db) };
  return at.x >= x0 && at.x <= x1 && at.y >= y0 && at.y <= y1 ? { id: p.id, part: "body", dist: tol } : null;
}

/** Hình được chạm (ưu tiên điểm neo, rồi gần nhất, rồi hình vẽ sau cùng nằm trên). */
export function hitTest(primitives: DrawnPrimitive[], at: Px, project: Project, { tol = 7, height = Infinity } = {}): Hit | null {
  let best: Hit | null = null;
  for (let i = primitives.length - 1; i >= 0; i--) {
    const h = hitOne(primitives[i], at, project, tol, height);
    if (!h) continue;
    const rank = (x: Hit) => (x.part === "body" ? 1 : 0);
    if (!best || rank(h) < rank(best) || (rank(h) === rank(best) && h.dist < best.dist)) best = h;
  }
  return best;
}

export const TOOL_NAME: Record<DrawnPrimitive["toolType"], string> = {
  trendline: "Trendline", rectangle: "Zone", fibonacci: "Fibonacci", fibTimeZone: "Fibonacci Time Zones", elliott: "Elliott (vẽ tay cũ)",
};
/** Tên hiển thị của hình: tên người dùng đặt, ngược lại "Loại · ngày bắt đầu". */
export function primitiveLabel(p: DrawnPrimitive): string {
  if (p.name) return p.name;
  const d = p.toolType === "fibTimeZone" ? p.anchor.date : p.toolType === "elliott" ? p.points[0]?.date : p.p1.date;
  return `${TOOL_NAME[p.toolType]} · ${String(d ?? "").slice(0, 16).replace("T", " ")}`;
}
