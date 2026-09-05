import { useState } from "react";
import { useLiquidity1030Real } from "../../hooks/useLiquidity1030Real";

function formatVolume(v: number): string {
  return `${(v / 1_000_000).toFixed(1)}tr CP`;
}

const SIGNAL_LABEL: Record<string, string> = {
  extreme: "BẤT THƯỜNG",
  elevated: "TĂNG CAO",
  normal: "BÌNH THƯỜNG",
};

export default function LiquidityCheckBadge() {
  const { data, loading } = useLiquidity1030Real();
  const [open, setOpen] = useState(false);

  if (loading && !data) {
    return <div className="liq-check liq-skel"><div className="liq-skel-bar" /></div>;
  }
  if (!data) return null;

  const { today, history, stats } = data;
  const isAlert = stats.signal !== "normal";
  const cls = `liq-badge ${stats.deviationPct > 0 ? "hot" : "cold"} ${isAlert ? "alert" : ""}`;
  const arrow = stats.deviationPct >= 0 ? "▲" : "▼";
  const maxVol = Math.max(today.cumulativeVolumeAt1030, ...history.map((h) => h.cumulativeVolumeAt1030));

  return (
    <div className="liq-check liq-check-clickable" onClick={() => setOpen((v) => !v)}>
      <span className="liq-label">TK 10:30</span>
      <span className="liq-val num">{formatVolume(today.cumulativeVolumeAt1030)}</span>
      <span className={cls}>
        {arrow} {stats.deviationPct >= 0 ? "+" : ""}{stats.deviationPct.toFixed(0)}% so TB5P
      </span>

      {open && (
        <div className="liq-panel" onClick={(e) => e.stopPropagation()}>
          <div className="liq-panel-title">
            PHÂN TÍCH THANH KHOẢN LŨY KẾ 10:30
            <button className="liq-panel-close" onClick={() => setOpen(false)}>×</button>
          </div>

          <div className="liq-panel-chart">
            {history.map((h) => (
              <div className="liq-bar-col" key={h.date}>
                <div className="liq-bar-track">
                  <div
                    className="liq-bar-fill liq-bar-history"
                    style={{ height: `${(h.cumulativeVolumeAt1030 / maxVol) * 100}%` }}
                  />
                </div>
                <span className="liq-bar-label">{h.date.slice(5)}</span>
              </div>
            ))}
            <div className="liq-bar-col liq-bar-today">
              <div className="liq-bar-track">
                <div
                  className={`liq-bar-fill ${stats.deviationPct >= 0 ? "liq-bar-up" : "liq-bar-down"}`}
                  style={{ height: `${(today.cumulativeVolumeAt1030 / maxVol) * 100}%` }}
                />
              </div>
              <span className="liq-bar-label liq-bar-label-today">Hôm nay</span>
            </div>
          </div>

          <div className="liq-panel-stats">
            <div className="liq-stat-row">
              <span>Hôm nay</span>
              <span className="num">{formatVolume(today.cumulativeVolumeAt1030)}</span>
            </div>
            <div className="liq-stat-row">
              <span>TB 5 phiên</span>
              <span className="num">{formatVolume(stats.mean)}</span>
            </div>
            <div className="liq-stat-row">
              <span>Độ lệch chuẩn (σ)</span>
              <span className="num">{formatVolume(stats.stdev)}</span>
            </div>
            <div className="liq-stat-row liq-stat-highlight">
              <span>Z-Score</span>
              <span className={`num ${stats.zScore >= 0 ? "up" : "down"}`}>{stats.zScore.toFixed(2)}σ</span>
            </div>
          </div>

          <div className={`liq-panel-signal liq-signal-${stats.signal}`}>
            {SIGNAL_LABEL[stats.signal]}
          </div>

          <div className="liq-panel-note">
            Phương pháp: so sánh khối lượng khớp lệnh lũy kế từ 09:00–10:30 hôm nay với
            trung bình và độ lệch chuẩn của 5 phiên liền trước (Z-score thống kê). |Z| &gt; 2:
            bất thường mạnh, |Z| &gt; 1: tăng/giảm đáng chú ý.
          </div>
        </div>
      )}
    </div>
  );
}
