// Mô hình lớp phủ biểu đồ (TA_VNINDEX_UPGRADE_SPEC §2.1.1) — toạ độ MIỀN (ngày, giá), không phải pixel.
// OverlayPrimitive (canvas, LWC v5) đổi sang pixel mỗi khung hình -> tự theo zoom/pan, bị cắt đúng trong vùng giá.
// Thuần TS, không phụ thuộc DOM: dựng + kiểm thử được độc lập.

export const GQ_COLORS = {
  bull: "#00F5A0",     // Neon Mint — dòng tiền mua / Bullish (anh duyệt 03/10/2026)
  bear: "#FF0055",     // Crimson Neon — phân phối / Bearish
  uv: "#A855F7",       // Ultraviolet — Wyckoff, Absorption, Sweep, hệ thống
  amber: "#FFB020",    // Amber — POC/OTE, sự kiện quyền, vùng giá đặc biệt
  cyan: "#22D3EE",     // thông tin trung tính
  text2: "#8A93A8",
} as const;

export const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export interface ScenePoint { t: string; price: number }
export interface SceneLabel { text: string; color: string; priority: number }

export type SceneItem =
  | { kind: "zone"; t1: string; t2: string | null; top: number; bottom: number; fill: string; stroke?: string; dash?: number[]; label?: SceneLabel }
  | { kind: "band"; t1: string; t2: string; fill: string; stroke?: string; dash?: number[]; label?: SceneLabel } // dải dọc toàn chiều cao
  | { kind: "hline"; t1: string; t2: string | null; price: number; color: string; dash?: number[]; width?: number; label?: SceneLabel }
  | { kind: "vline"; t: string; color: string; dash?: number[]; label?: SceneLabel; labelPrice?: number } // nhãn neo vào giá (VD sự kiện Wyckoff)
  | { kind: "segment"; a: ScenePoint; b: ScenePoint; color: string; width?: number; dash?: number[] }
  | { kind: "poly"; points: ScenePoint[]; color: string; width?: number; dash?: number[]; nodeLabels?: string[]; label?: SceneLabel }
  // Volume Profile: histogram ngang neo từ nến t1 tới nến t2 (độ dài thanh = KL/KL max × widthFrac × bề rộng [t1,t2]).
  | { kind: "profile"; t1: string; t2: string; bins: { low: number; high: number; volume: number }[]; maxVolume: number;
      vaLow: number; vaHigh: number; widthFrac: number; color: string; vaColor: string };

export interface Scene { items: SceneItem[] }
export const EMPTY_SCENE: Scene = { items: [] };

/** Ngân sách nhãn: tối đa 12 nhãn trong vùng nhìn thấy (đặc tả §2.1.1). */
export const LABEL_BUDGET = 12;

export interface LabelBox { x: number; y: number; w: number; h: number; text: string; color: string; priority: number }

/**
 * Chọn nhãn để vẽ (hàm thuần): bỏ nhãn ngoài khung, ưu tiên priority cao rồi nhãn bên phải (gần hiện tại),
 * tham lam: bỏ nhãn chồng lên nhãn đã chọn; tối đa `budget`.
 */
export function placeLabels(candidates: LabelBox[], width: number, height: number, budget = LABEL_BUDGET): LabelBox[] {
  const inside = candidates.filter((c) => c.x >= 0 && c.y - c.h >= 0 && c.x + c.w <= width && c.y <= height);
  const sorted = [...inside].sort((a, b) => b.priority - a.priority || b.x - a.x);
  const placed: LabelBox[] = [];
  const overlaps = (a: LabelBox, b: LabelBox) => a.x < b.x + b.w && b.x < a.x + a.w && a.y - a.h < b.y && b.y - b.h < a.y;
  for (const c of sorted) {
    if (placed.length >= budget) break;
    if (placed.some((p) => overlaps(p, c))) continue;
    placed.push(c);
  }
  return placed;
}

/** Thứ tự ưu tiên nhãn (đặc tả §2.1.1): CHoCH > Sweep > OB chưa test > FVG chưa lấp > BOS > khác. */
export const LABEL_PRIORITY = { choch: 90, sweep: 80, obActive: 70, fvgOpen: 60, bos: 50, wyckoff: 45, liquidity: 40, user: 85, other: 10 } as const;
