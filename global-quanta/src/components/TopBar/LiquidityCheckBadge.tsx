import type { LiquidityData } from '../../types';

interface Props {
  data: LiquidityData;
}

export default function LiquidityCheckBadge({ data }: Props) {
  const pct = data.deviationPct;
  const isAlert = Math.abs(pct) >= data.alertThresholdPct;
  const isHot = pct > 0;
  const cls = `liq-badge ${isHot ? 'hot' : pct < 0 ? 'cold' : 'normal'} ${isAlert ? 'alert' : ''}`;
  const arrow = pct >= 0 ? '▲' : '▼';

  return (
    <div
      className="liq-check"
      title="So sánh thanh khoản luỹ kế đến 10:30 hôm nay với trung bình luỹ kế đến 10:30 của 5 phiên gần nhất"
    >
      <span className="liq-label">TK 10:30</span>
      <span className="liq-val num">{data.todayValueAt1030Ty.toLocaleString('vi-VN')} tỷ</span>
      <span className={cls}>
        {arrow} {pct >= 0 ? '+' : ''}{pct.toFixed(0)}% so TB5P
      </span>
    </div>
  );
}
