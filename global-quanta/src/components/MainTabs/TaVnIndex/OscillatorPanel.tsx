"use client";
import type { RsiResult, MacdResult, AdxResult } from "../../../lib/ta-command-center/detectors/technicalOscillators";

import ProvenanceBadge from "./ProvenanceBadge";

// Chỉ báo tính bằng công thức chuẩn Wilder/EMA từ giá đóng cửa -> DERIVED (không phải dữ liệu sàn thô).
const HARD_DATA_BADGE = <ProvenanceBadge kind="DERIVED" />;

function rsiLabel(v: number | null): { text: string; color: string } {
  if (v === null) return { text: "Chưa đủ dữ liệu", color: "#64748b" };
  if (v >= 70) return { text: "Overbought", color: "#f43f5e" };
  if (v <= 30) return { text: "Oversold", color: "#34d399" };
  return { text: "Neutral", color: "#94a3b8" };
}

function macdLabel(histogram: number | null): { text: string; color: string } {
  if (histogram === null) return { text: "Chưa đủ dữ liệu", color: "#64748b" };
  if (histogram > 0) return { text: "Momentum ▲ (histogram > 0)", color: "#34d399" };
  if (histogram < 0) return { text: "Momentum ▼ (histogram < 0)", color: "#f43f5e" };
  return { text: "Neutral", color: "#94a3b8" };
}

const ADX_LABEL: Record<AdxResult["trendStrength"], { text: string; color: string }> = {
  yeu: { text: "Trend yếu / range-bound", color: "#64748b" },
  trung_binh: { text: "Trend trung bình", color: "#94a3b8" },
  manh: { text: "Trend mạnh", color: "#fbbf24" },
  rat_manh: { text: "Trend rất mạnh", color: "#34d399" },
};

interface Props {
  rsi: RsiResult;
  macd: MacdResult;
  adx: AdxResult;
}

export default function OscillatorPanel({ rsi, macd, adx }: Props) {
  const rsiInfo = rsiLabel(rsi.latest);
  const macdInfo = macdLabel(macd.latest.histogram);
  const adxInfo = ADX_LABEL[adx.trendStrength];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
      <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
          RSI (14) {HARD_DATA_BADGE}
        </p>
        <p className="text-lg font-bold font-mono" style={{ color: rsiInfo.color }}>
          {rsi.latest !== null ? rsi.latest.toFixed(1) : "-"}
        </p>
        <p className="text-[9px] text-slate-500 mt-1">{rsiInfo.text} · ngưỡng 70 / 30</p>
      </div>

      <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
          MACD (12,26,9) {HARD_DATA_BADGE}
        </p>
        <p className="text-lg font-bold font-mono" style={{ color: macdInfo.color }}>
          {macd.latest.histogram !== null ? macd.latest.histogram.toFixed(2) : "-"}
        </p>
        <p className="text-[9px] text-slate-500 mt-1">
          {macdInfo.text} · MACD {macd.latest.macd?.toFixed(2) ?? "-"} / Signal {macd.latest.signal?.toFixed(2) ?? "-"}
        </p>
      </div>

      <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
          ADX (14) {HARD_DATA_BADGE}
        </p>
        <p className="text-lg font-bold font-mono" style={{ color: adxInfo.color }}>
          {adx.latest !== null ? adx.latest.toFixed(1) : "-"}
        </p>
        <p className="text-[9px] text-slate-500 mt-1">{adxInfo.text} · &gt;25 mạnh, &gt;50 rất mạnh</p>
      </div>
    </div>
  );
}
