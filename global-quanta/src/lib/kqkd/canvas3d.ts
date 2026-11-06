// K5 (06/11/2026) — bộ vẽ 3D trên Canvas 2D dùng chung cho KQKD (cùng cách dựng với RRG 4D / Không gian thời điểm 4D):
// chiếu phối cảnh yaw/pitch, vẽ sau-ra-trước (painter), chữ luôn quay về màn hình. Không thêm thư viện (three.js ~600 KB) —
// cảnh KQKD tối đa vài trăm khối / điểm nên Canvas 2D vẽ một khung < 2 ms.
export type Rot = { yaw: number; pitch: number; zoom: number };
export type P3 = { x: number; y: number; z: number };
export const DEFAULT_ROT: Rot = { yaw: -0.62, pitch: -0.38, zoom: 1 };
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const CAM = 5; // khoảng cách camera (đơn vị cảnh); gần quá -> góc gần bị phóng to, tràn khung
function rawProject(p: P3, r: Rot) {
  const cy = Math.cos(r.yaw), sy = Math.sin(r.yaw), cp = Math.cos(r.pitch), sp = Math.sin(r.pitch);
  const x1 = p.x * cy - p.z * sy, z1 = p.x * sy + p.z * cy;
  const y2 = p.y * cp - z1 * sp, z2 = p.y * sp + z1 * cp;
  const k = CAM / (CAM + z2);
  return { x: x1 * k, y: y2 * k, depth: z2 };
}
const fitMemo = new Map<string, { s: number; ox: number; oy: number }>();
/** Tỷ lệ + tâm để khối [−1,22; 1,22]³ (gồm phần lớn nhãn trục) vừa khung ở góc nhìn mặc định; dùng chung cho mọi góc xoay (không "thở" khi xoay). */
function fit(W: number, H: number) {
  const key = `${W}x${H}`;
  const hit = fitMemo.get(key); if (hit) return hit;
  const c = 1.22; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const x of [-c, c]) for (const y of [-1.05, 1.2]) for (const z of [-c, c]) { const q = rawProject({ x, y, z }, DEFAULT_ROT); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  const s = Math.min((W * 0.96) / (x1 - x0), (H * 0.94) / (y1 - y0));
  const out = { s, ox: W / 2 - ((x0 + x1) / 2) * s, oy: H / 2 + ((y0 + y1) / 2) * s };
  fitMemo.set(key, out);
  return out;
}

export function project(p: P3, r: Rot, W: number, H: number) {
  const q = rawProject(p, r), f = fit(W, H), s = f.s * r.zoom;
  return { x: f.ox + q.x * s, y: f.oy - q.y * s, depth: q.depth };
}

export type Poly = { kind: "poly"; pts: P3[]; fill: string; stroke?: string };
export type Line = { kind: "line"; pts: P3[]; color: string; width?: number; dash?: number[] };
export type Dot = { kind: "dot"; p: P3; r: number; fill: string; stroke?: string; label?: string; id?: string; tip?: string; hidden?: boolean };
export type Text3 = { kind: "text"; p: P3; text: string; color?: string; align?: CanvasTextAlign; size?: number };
export type Drawable = Poly | Line | Dot | Text3;
export type Axis = { label: string; ticks: { v: number; text: string }[] };
export type Scene = { items: Drawable[]; axes: { x: Axis; y: Axis; z: Axis }; floorY?: number };
export type Hit = { x: number; y: number; id?: string; tip?: string };

const depthOf = (d: Drawable, r: Rot, W: number, H: number) => {
  const pts = d.kind === "poly" || d.kind === "line" ? d.pts : [d.p];
  return pts.reduce((s, p) => s + project(p, r, W, H).depth, 0) / pts.length;
};

/** Vẽ cảnh; trả danh sách điểm có thể rê chuột (toạ độ màn hình). */
export function renderScene(ctx: CanvasRenderingContext2D, scene: Scene, r: Rot, W: number, H: number, opts: { muted?: string; grid?: string; text?: string; font?: string } = {}): Hit[] {
  const muted = opts.muted ?? "rgba(148,163,184,0.75)", grid = opts.grid ?? "rgba(148,163,184,0.16)", text = opts.text ?? "rgba(226,232,240,0.92)";
  const font = opts.font ?? "Inter, system-ui, sans-serif";
  ctx.clearRect(0, 0, W, H);
  const P = (p: P3) => project(p, r, W, H);
  const fy = scene.floorY ?? -1;
  // Sàn lưới + trục.
  ctx.lineWidth = 1; ctx.strokeStyle = grid;
  for (const t of scene.axes.x.ticks) { const a = P({ x: t.v, y: fy, z: -1 }), b = P({ x: t.v, y: fy, z: 1 }); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  for (const t of scene.axes.z.ticks) { const a = P({ x: -1, y: fy, z: t.v }), b = P({ x: 1, y: fy, z: t.v }); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  for (const t of scene.axes.y.ticks) { const a = P({ x: -1, y: t.v, z: -1 }), b = P({ x: 1, y: t.v, z: -1 }), c = P({ x: -1, y: t.v, z: 1 }); ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
  ctx.fillStyle = muted; ctx.font = `10px ${font}`; ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  for (const t of scene.axes.x.ticks) { const p = P({ x: t.v, y: fy, z: 1.14 }); ctx.fillText(t.text, p.x, p.y); }
  ctx.textAlign = "left";
  for (const t of scene.axes.z.ticks) { const p = P({ x: 1.08, y: fy, z: t.v }); ctx.fillText(t.text, p.x, p.y); }
  ctx.textAlign = "right";
  for (const t of scene.axes.y.ticks) { const p = P({ x: -1.06, y: t.v, z: -1 }); ctx.fillText(t.text, p.x, p.y); }
  ctx.fillStyle = text; ctx.font = `600 11px ${font}`;
  { const p = P({ x: 0, y: fy, z: 1.32 }); ctx.textAlign = "center"; ctx.fillText(scene.axes.x.label, p.x, p.y); }
  { const p = P({ x: 1.32, y: fy, z: 0 }); ctx.textAlign = "left"; ctx.fillText(scene.axes.z.label, p.x, p.y); }
  { const p = P({ x: -1, y: 1.14, z: -1 }); ctx.textAlign = "center"; ctx.fillText(scene.axes.y.label, p.x, p.y); }

  const items = scene.items.map((d) => ({ d, depth: depthOf(d, r, W, H) })).sort((a, b) => b.depth - a.depth);
  const hits: Hit[] = [];
  for (const { d } of items) {
    if (d.kind === "poly") {
      ctx.beginPath(); d.pts.forEach((p, i) => { const q = P(p); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); }); ctx.closePath();
      ctx.fillStyle = d.fill; ctx.fill(); if (d.stroke) { ctx.strokeStyle = d.stroke; ctx.lineWidth = 1; ctx.stroke(); }
    } else if (d.kind === "line") {
      ctx.beginPath(); d.pts.forEach((p, i) => { const q = P(p); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      ctx.strokeStyle = d.color; ctx.lineWidth = d.width ?? 2; ctx.setLineDash(d.dash ?? []); ctx.stroke(); ctx.setLineDash([]);
    } else if (d.kind === "dot") {
      const q = P(d.p);
      if (!d.hidden) {
        ctx.beginPath(); ctx.arc(q.x, q.y, d.r, 0, Math.PI * 2); ctx.fillStyle = d.fill; ctx.fill();
        ctx.strokeStyle = d.stroke ?? "rgba(11,15,25,0.9)"; ctx.lineWidth = 2; ctx.stroke();
        if (d.label) { ctx.fillStyle = text; ctx.font = `600 10px ${font}`; ctx.textAlign = "left"; ctx.fillText(d.label, q.x + d.r + 3, q.y); }
      }
      if (d.tip || d.id) hits.push({ x: q.x, y: q.y, id: d.id, tip: d.tip });
    } else {
      const q = P(d.p); ctx.fillStyle = d.color ?? muted; ctx.font = `${d.size ?? 10}px ${font}`; ctx.textAlign = d.align ?? "center"; ctx.fillText(d.text, q.x, q.y);
    }
  }
  return hits;
}

/** Khối hộp (cột 3D) từ đáy y0 tới đỉnh y1 tại tâm (x, z), nửa rộng w: 4 mặt bên + mặt trên. */
export function box(x: number, z: number, w: number, y0: number, y1: number, fill: string, side: string, stroke = "rgba(11,15,25,0.55)"): Poly[] {
  const lo = Math.min(y0, y1), hi = Math.max(y0, y1);
  const c = (dx: number, dz: number, y: number): P3 => ({ x: x + dx * w, y, z: z + dz * w });
  const faces: [number, number][][] = [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]];
  const out: Poly[] = faces.map(([[ax, az], [bx, bz]]) => ({ kind: "poly", pts: [c(ax, az, lo), c(bx, bz, lo), c(bx, bz, hi), c(ax, az, hi)], fill: side, stroke }));
  out.push({ kind: "poly", pts: [c(-1, -1, hi), c(1, -1, hi), c(1, 1, hi), c(-1, 1, hi)], fill, stroke });
  return out;
}

/** Ánh xạ tuyến tính [lo, hi] -> [−1, 1] (giới hạn). */
export const scaler = (lo: number, hi: number) => (v: number) => (hi === lo ? 0 : clamp(((v - lo) / (hi - lo)) * 2 - 1, -1, 1));
/** Mốc tròn đẹp cho trục. */
export function niceTicks(lo: number, hi: number, n = 4): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n, mag = 10 ** Math.floor(Math.log10(raw)), step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(Math.round(v / step) * step);
  return out;
}
/** Màu tuần tự một sắc vàng Quanta (thấp tối -> cao sáng) trên nền tối; âm = hồng. t ∈ [0, 1]. */
export function goldRamp(t: number): string {
  const a = [92, 74, 30], b = [245, 206, 114], k = clamp(t, 0, 1);
  return `rgb(${a.map((x, i) => Math.round(x + (b[i] - x) * k)).join(",")})`;
}
export const shade = (rgb: string, f: number) => rgb.replace(/\d+/g, (x) => String(Math.round(Number(x) * f)));
