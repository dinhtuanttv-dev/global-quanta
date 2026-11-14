// Màu chữ cho ô nhiệt (nền đổi theo số liệu): chọn chữ tối hoặc sáng theo độ sáng tương đối của nền để tương phản luôn ≥ 4,5:1 (WCAG AA).
// Nền trong suốt (rgba, ô chưa có số) nằm trên nền tối của thẻ -> chữ sáng.
const DARK = "#000000", LIGHT = "#ffffff";
const lin = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
export function heatInk(bg: string): string {
  const m = /^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/.exec(bg.trim());
  if (!m) return LIGHT;
  const L = 0.2126 * lin(+m[1]) + 0.7152 * lin(+m[2]) + 0.0722 * lin(+m[3]);
  // Tương phản với chữ trắng là 1,05/(L+0,05); với chữ đen là (L+0,05)/0,05 -> cắt nhau ở L ≈ 0,179, tại đó cả hai đều ≈ 4,58:1.
  return L > 0.179 ? DARK : LIGHT;
}
