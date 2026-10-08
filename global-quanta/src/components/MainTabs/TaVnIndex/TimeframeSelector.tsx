"use client";
import type { Timeframe } from "../../../lib/ta-command-center/TimeframeController";

interface Props {
  current: Timeframe;
  onChange: (tf: Timeframe) => void;
  /** Đang tải nến phút (lần đầu chọn khung intraday). */
  loadingIntraday?: boolean;
  intradayError?: string | null;
  intradaySessions?: number;
}

// Khung intraday gộp từ nến 1 phút SSI (20 phiên gần nhất); D/W/M từ chuỗi ngày điều chỉnh (~3 năm).
const INTRADAY: Timeframe[] = ["1m", "5m", "15m", "1H"];
const SWING: Timeframe[] = ["D", "W", "M"];

export default function TimeframeSelector({ current, onChange, loadingIntraday = false, intradayError = null, intradaySessions = 0 }: Props) {
  const btn = (tf: Timeframe) => (
    <button key={tf} type="button" onClick={() => onChange(tf)} aria-pressed={current === tf} data-tf={tf}
      style={current === tf
        ? { background: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.4)", color: "#22d3ee" }
        : { background: "rgba(2,6,15,0.5)", border: "1px solid rgba(148,163,184,0.15)", color: "#94a3b8" }}
      className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold font-mono transition">
      {tf}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-3" role="group" aria-label="Khung thời gian">
      {INTRADAY.map(btn)}
      <span className="w-px h-5 bg-white/10 mx-1" aria-hidden />
      {SWING.map(btn)}
      <span className="text-[9px] text-slate-500 ml-1" data-testid="tf-note">
        {loadingIntraday ? "Đang tải nến phút SSI…"
          : intradayError ? <span className="text-amber-400">⚠ {intradayError}</span>
          : INTRADAY.includes(current) ? `Nến phút SSI · ${intradaySessions} phiên gần nhất · giờ VN`
          : "W/M gộp từ nến D điều chỉnh"}
      </span>
    </div>
  );
}
