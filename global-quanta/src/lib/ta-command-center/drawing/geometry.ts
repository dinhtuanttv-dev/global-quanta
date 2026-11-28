// TA-T6b (28/11/2026) — hình học pixel dùng chung cho VẼ (OverlayPrimitive) và BẤM CHỌN (shapes.shapeHit):
// cùng một công thức ở hai nơi -> chỗ bấm luôn khớp chỗ thấy. Hàm thuần, không DOM.
export type XY = [number, number];

/** Hình chữ nhật xoay: cạnh a -> b, điểm c quyết định bề rộng (chiếu lên pháp tuyến của cạnh). Trả 4 góc theo thứ tự vẽ. */
export function rotRectCorners(a: XY, b: XY, c: XY): XY[] {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const w = (c[0] - a[0]) * nx + (c[1] - a[1]) * ny;
  return [a, b, [b[0] + nx * w, b[1] + ny * w], [a[0] + nx * w, a[1] + ny * w]];
}

/** Điểm điều khiển để đường cong bậc 2 ĐI QUA điểm giữa m (tại t = 0,5) — dùng cho cung (Arc). */
export const controlThrough = (a: XY, m: XY, b: XY): XY => [2 * m[0] - (a[0] + b[0]) / 2, 2 * m[1] - (a[1] + b[1]) / 2];

export function sampleQuad(a: XY, c: XY, b: XY, n = 32): XY[] {
  const out: XY[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]); }
  return out;
}
export function sampleCubic(a: XY, c1: XY, c2: XY, b: XY, n = 40): XY[] {
  const out: XY[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * u * a[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * b[0], u * u * u * a[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * b[1]]);
  }
  return out;
}

/** Đường hình sin qua hai cực trị a (đỉnh/đáy) và b (cực trị kế tiếp): nửa chu kỳ = b.x − a.x. */
export function sineY(a: XY, b: XY, x: number): number {
  const sp = b[0] - a[0];
  if (!sp) return a[1];
  const c = (a[1] + b[1]) / 2, A = (b[1] - a[1]) / 2;
  return c - A * Math.cos((Math.PI * (x - a[0])) / sp);
}

/** Vị trí các vạch chu kỳ trong khoảng [0, W] (cách đều b.x − a.x, cả hai phía a); tối đa `cap` vạch. */
export function cycleXs(a: XY, b: XY, W: number, cap = 400): number[] {
  const sp = Math.abs(b[0] - a[0]);
  if (sp < 2) return [a[0]];
  const out: number[] = [];
  for (let n = Math.ceil((0 - a[0]) / sp); a[0] + n * sp <= W && out.length < cap; n++) out.push(a[0] + n * sp);
  return out;
}

export const distPt = (p: XY, q: XY) => Math.hypot(p[0] - q[0], p[1] - q[1]);
export function distSegXY(p: XY, s: XY, e: XY): number {
  const dx = e[0] - s[0], dy = e[1] - s[1], l2 = dx * dx + dy * dy;
  if (!l2) return distPt(p, s);
  const t = Math.max(0, Math.min(1, ((p[0] - s[0]) * dx + (p[1] - s[1]) * dy) / l2));
  return distPt(p, [s[0] + t * dx, s[1] + t * dy]);
}
export function distPolyline(p: XY, pts: XY[], closed = false): number {
  let d = pts.length === 1 ? distPt(p, pts[0]) : Infinity;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, distSegXY(p, pts[i - 1], pts[i]));
  if (closed && pts.length > 2) d = Math.min(d, distSegXY(p, pts[pts.length - 1], pts[0]));
  return d;
}
export function insidePolygon(p: XY, pts: XY[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}
