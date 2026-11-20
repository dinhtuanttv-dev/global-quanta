// G1/L2 (19/11/2026) — màu chữ trên nền dữ liệu (ô bản đồ nhiệt, nhãn tư thế). Chỉ giao diện: không đổi màu nền (mã hoá dữ liệu),
// chỉ chọn chữ sáng hoặc tối sao cho tương phản cao hơn (WCAG). Trước đây luôn chữ trắng: 2,32:1 trên xanh lá đậm vừa.
// đen tuyền: ô màu vùng giữa thang (VD −2,1) đạt 4,66:1 thay vì 4,31:1.
// trắng tuyền (20/11/2026): với #f8fafc, z = −2,01 chỉ đạt 4,48:1 (bắt được trên production); #ffffff -> thấp nhất toàn thang 4,59:1.
const LIGHT = "#ffffff", DARK = "#000000";

function rgbOf(color: string): [number, number, number] | null {
  const m = color.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = color.match(/^#([0-9a-f]{6})$/i);
  if (h) return [0, 2, 4].map((i) => parseInt(h[1].slice(i, i + 2), 16)) as [number, number, number];
  return null;
}
export function luminance([r, g, b]: [number, number, number]): number {
  const f = (x: number) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrastRatio(a: string, b: string): number {
  const x = rgbOf(a), y = rgbOf(b);
  if (!x || !y) return 1;
  const l1 = luminance(x), l2 = luminance(y);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
/** Chữ sáng hay tối trên nền đặc `bg` — chọn bên có tương phản cao hơn. Nền không đọc được -> chữ sáng (nền tối của app). */
export function inkOn(bg: string): string {
  if (!rgbOf(bg)) return LIGHT;
  return contrastRatio(LIGHT, bg) >= contrastRatio(DARK, bg) ? LIGHT : DARK;
}

/** Nhãn ngữ nghĩa nền nhạt + chữ màu (03_HE_THONG_THIET_KE mục 4): tương phản ≥ 8:1 trên nền khối. */
export const TONE_CHIP = {
  up: { background: "rgba(16,185,129,0.15)", color: "#6EE7B7" },
  down: { background: "rgba(244,63,94,0.15)", color: "#FDA4AF" },
  neutral: { background: "rgba(148,163,184,0.25)", color: "#CBD5E1" },
  none: { background: "rgba(148,163,184,0.12)", color: "#94A3B8" },
} as const;
