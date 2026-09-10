import { useSignalWinRate } from "../../../hooks/useSignalWinRate";

const T = {
  positive: "var(--positive, #34d399)",
  gold: "var(--gold, #f59e0b)",
  negative: "var(--negative, #f87171)",
};

export default function WinRateBadge() {
  const { stat } = useSignalWinRate();
  if (!stat) return null;

  const color = stat.winRatePercent >= 55 ? T.positive : stat.winRatePercent >= 45 ? T.gold : T.negative;

  return (
    <span
      title={`${stat.sampleSize} tín hiệu đã kiểm chứng trong ${stat.windowDays} ngày qua (tính lại ${new Date(stat.lastComputedAt).toLocaleDateString("vi-VN")}) - tỷ lệ mã thực sự cùng chiều với tín hiệu sau đó`}
      className="text-[8px] font-bold px-1.5 py-0.5 rounded"
      style={{ background: `${color}1A`, color }}>
      Tỷ lệ đúng lịch sử: {stat.winRatePercent.toFixed(0)}% ({stat.sampleSize} tín hiệu)
    </span>
  );
}
