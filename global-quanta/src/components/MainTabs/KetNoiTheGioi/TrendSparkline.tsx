const T = {
  positive: "var(--positive, #34d399)",
  negative: "var(--negative, #f87171)",
  textTertiary: "var(--text-tertiary, #64748b)",
};

// Sparkline SVG toi gian, khong dung thu vien ngoai. An toan voi mang rong/1
// phan tu (khong crash), chi hien thi khi co >=2 diem.
// label: mo ta cho trinh doc man hinh (VD "60 phien, 18/07 -> 15/10").
export default function TrendSparkline({ values, width = 64, height = 20, label }: { values: number[] | null | undefined; width?: number; height?: number; label?: string }) {
  if (!Array.isArray(values) || values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const trendUp = values[values.length - 1] >= values[0];
  const color = trendUp ? T.positive : T.negative;
  const pad = 2;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = pad + (height - 2 * pad) - ((v - min) / range) * (height - 2 * pad);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label ?? "Xu hướng vài kỳ gần nhất"}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
