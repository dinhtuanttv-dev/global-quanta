"use client";
import { CheckCircle2 } from "lucide-react";
import type { RsiResult, MacdResult, AdxResult } from "../../../lib/ta-command-center/detectors/technicalOscillators";

const HARD_DATA_BADGE = (
  <span className="ml-auto flex items-center gap-0.5 text-[8px] text-emerald-400">
    <CheckCircle2 className="w-2.5 h-2.5" />HARD_DATA
  </span>
);

function rsiLabel(v: number | null): { text: string; color: string } {
  if (v === null) return { text: "Chua du du lieu", color: "#64748b" };
  if (v >= 70) return { text: "Qua mua", color: "#f87171" };
  if (v <= 30) return { text: "Qua ban", color: "#34d399" };
  return { text: "Trung tinh", color: "#94a3b8" };
}

function macdLabel(histogram: number | null): { text: string; color: string } {
  if (histogram === null) return { text: "Chua du du lieu", color: "#64748b" };
  if (histogram > 0) return { text: "Dong tien tang", color: "#34d399" };
  if (histogram < 0) return { text: "Dong tien giam", color: "#f87171" };
  return { text: "Trung lap", color: "#94a3b8" };
}

const ADX_LABEL: Record<AdxResult["trendStrength"], { text: string; color: string }> = {
  yeu: { text: "Xu huong yeu / sideway", color: "#64748b" },
  trung_binh: { text: "Xu huong trung binh", color: "#94a3b8" },
  manh: { text: "Xu huong manh", color: "#fbbf24" },
  rat_manh: { text: "Xu huong rat manh", color: "#34d399" },
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
        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
          RSI (14) {HARD_DATA_BADGE}
        </p>
        <p className="text-lg font-black" style={{ color: rsiInfo.color }}>
          {rsi.latest !== null ? rsi.latest.toFixed(1) : "-"}
        </p>
        <p className="text-[9px] text-slate-500 mt-1">{rsiInfo.text} · Qua mua &gt;70, qua ban &lt;30</p>
      </div>

      <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
          MACD (12,26,9) {HARD_DATA_BADGE}
        </p>
        <p className="text-lg font-black" style={{ color: macdInfo.color }}>
          {macd.latest.histogram !== null ? macd.latest.histogram.toFixed(2) : "-"}
        </p>
        <p className="text-[9px] text-slate-500 mt-1">
          {macdInfo.text} · MACD {macd.latest.macd?.toFixed(2) ?? "-"} / Signal {macd.latest.signal?.toFixed(2) ?? "-"}
        </p>
      </div>

      <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
          ADX (14) {HARD_DATA_BADGE}
        </p>
        <p className="text-lg font-black" style={{ color: adxInfo.color }}>
          {adx.latest !== null ? adx.latest.toFixed(1) : "-"}
        </p>
        <p className="text-[9px] text-slate-500 mt-1">{adxInfo.text} · &gt;25 manh, &gt;50 rat manh</p>
      </div>
    </div>
  );
}
