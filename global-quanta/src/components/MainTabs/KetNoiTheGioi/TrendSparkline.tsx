const T = {
  positive: "var(--positive, #34d399)",
  negative: "var(--negative, #f87171)",
  textTertiary: "var(--text-tertiary, #64748b)",
};

const WIDTH = 64;
const HEIGHT = 20;

// Sparkline SVG toi gian, khong dung thu vien ngoai - danh cho du lieu it
// diem (3-6 thang) nen khong can chart phuc tap. An toan voi mang rong/1
// phan tu (khong crash), chi hien thi khi co >=2 diem.
export default function TrendSparkline({ values }: { values: number[] | null | undefined }) {
  if (!Array.isArray(values) || values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const trendUp = values[values.length - 1] >= values[0];
  const color = trendUp ? T.positive : T.negative;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * WIDTH;
      const y = HEIGHT - ((v - min) / range) * HEIGHT;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Xu hướng vài kỳ gần nhất">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
