// Hình học RRG 4D: phép chiếu phẳng và 3D, thang trục, dấu vừa vào Cải thiện, đặt nhãn tránh chồng lấn. Hàm thuần để kiểm thử được.
import type { Quadrant } from "../../../../lib/locnganh/types";

export type ViewMode = "flat" | "3d";
export type Rotation = { yaw: number; pitch: number; zoom: number };
export type Point3 = { x: number; y: number; z: number };
export type Plot = { cx: number; cy: number; sx: number; sy: number };

export const FRESH_WEEKS = 2;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Vùng vẽ của chế độ phẳng, chừa lề cho nhãn trục. k: số đơn vị logic trên một px màn hình. */
export function flatPlot(W: number, H: number, k: number): Plot {
  const left = 54 * k, right = 16 * k, top = 16 * k, bottom = 42 * k;
  return { cx: left + (W - left - right) / 2, cy: top + (H - top - bottom) / 2, sx: (W - left - right) / 2, sy: (H - top - bottom) / 2 };
}

/** Phẳng: chiếu thẳng X/Y, không phối cảnh, vị trí giữ đúng phía so với trục. 3D: camera xoay có phối cảnh, Z tạo chiều sâu. */
/** Hệ số để khối 3D ở góc nhìn mặc định nằm trọn trong khung 1000×600. */
export const FIT_3D = 0.7;

export function projectPoint(point: Point3, rotation: Rotation, mode: ViewMode, plot: Plot, center: { x: number; y: number }) {
  if (mode === "flat") return { x: plot.cx + point.x * plot.sx, y: plot.cy - point.y * plot.sy, depth: 0 };
  const cy = Math.cos(rotation.yaw), sy = Math.sin(rotation.yaw), cp = Math.cos(rotation.pitch), sp = Math.sin(rotation.pitch);
  const x1 = point.x * cy - point.z * sy, z1 = point.x * sy + point.z * cy;
  const y2 = point.y * cp - z1 * sp, z2 = point.y * sp + z1 * cp;
  const perspective = 4 / (4 + z2);
  return { x: center.x + x1 * 220 * rotation.zoom * perspective, y: center.y - y2 * 190 * rotation.zoom * perspective, depth: z2 };
}

/** Bước vạch trục đẹp (1, 2, 5 × 10ⁿ) cho khoảng ±domain. */
export function niceStep(domain: number, target = 3): number {
  const raw = domain / target, p = 10 ** Math.floor(Math.log10(raw)), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

/** Miền trục theo các tuần đang xem, chừa 12% để điểm không dính mép; sàn 1,5 khi dữ liệu phẳng. */
export function domainOf(values: number[]): number {
  return Math.max(1.5, ...values.map((v) => Math.abs(v) * 1.12));
}

/** Ngành vừa vào Cải thiện trong FRESH_WEEKS tuần tính đến điểm cuối, chỉ dùng dữ liệu đến tuần đó nên đúng khi phát lại. */
export function isFreshImproving(path: { week: string; quadrant: Quadrant }[]): boolean {
  const end = path[path.length - 1];
  if (end?.quadrant !== "IMPROVING") return false;
  for (let i = path.length - 2; i >= 0; i--) {
    if (path[i].quadrant !== "IMPROVING") return (Date.parse(end.week) - Date.parse(path[i + 1].week)) / (7 * 86_400_000) <= FRESH_WEEKS;
  }
  return false;
}

export type Box = { left: number; top: number; right: number; bottom: number };
/** r: bán kính chấm kể cả vòng đánh dấu, nhãn không được đè lên. */
export type LabelItem = { id: string; x: number; y: number; w: number; h: number; priority: number; r?: number };
const overlap = (a: Box, b: Box, pad: number) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left) + pad) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) + pad);

/**
 * Đặt nhãn: mỗi nhãn thử 108 vị trí quanh điểm, ưu tiên hướng ra xa tâm và gần điểm, chọn vị trí ít chồng nhất.
 * Luôn trả vị trí cho mọi nhãn; nhãn ưu tiên cao được chọn trước. Không ẩn tên ngành.
 */
export function placeLabels(items: LabelItem[], obstacles: Box[], bounds: { W: number; H: number }, center: { x: number; y: number }, k = 1): Map<string, Box> {
  const out = new Map<string, Box>();
  const taken = [...obstacles];
  const dots: Box[] = items.map((p) => { const r = p.r ?? 7 * k; return { left: p.x - r, top: p.y - r, right: p.x + r, bottom: p.y + r }; });
  const radii = [9, 16, 24, 38, 56, 80, 110, 150, 200].map((r) => r * k);
  for (const it of [...items].sort((a, b) => b.priority - a.priority || Math.hypot(b.x - center.x, b.y - center.y) - Math.hypot(a.x - center.x, a.y - center.y))) {
    const outward = Math.atan2(it.y - center.y, it.x - center.x);
    let best: Box | null = null, bestScore = Infinity;
    for (const r of radii) for (let i = 0; i < 12; i++) {
      const offset = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * (Math.PI / 6), a = outward + offset, c = Math.cos(a), s = Math.sin(a);
      const cx = it.x + c * (r + (it.w / 2) * Math.abs(c)), cy = it.y + s * (r + (it.h / 2) * Math.abs(s));
      const left = clamp(cx - it.w / 2, 2 * k, bounds.W - it.w - 2 * k), top = clamp(cy - it.h / 2, 2 * k, bounds.H - it.h - 2 * k);
      const box = { left, top, right: left + it.w, bottom: top + it.h };
      let hit = 0;
      for (const t of taken) hit += overlap(box, t, 2 * k);
      for (const d of dots) hit += overlap(box, d, 0);
      const score = hit * 50 + r + Math.abs(offset) * 6 * k;
      if (score < bestScore) { bestScore = score; best = box; }
    }
    out.set(it.id, best as Box);
    taken.push(best as Box);
  }
  return out;
}
