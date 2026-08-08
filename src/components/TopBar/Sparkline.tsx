interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: 'positive' | 'negative';
}

/** Atom — không đọc store, chỉ nhận props, tái sử dụng ở nhiều nơi. */
export default function Sparkline({ data, width = 44, height = 18, color = 'positive' }: SparklineProps) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const stroke = color === 'positive' ? 'var(--positive)' : 'var(--negative)';
  return (
    <svg className="spark" viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
