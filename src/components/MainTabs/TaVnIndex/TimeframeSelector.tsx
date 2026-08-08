"use client";
import type { Timeframe } from "../../../lib/ta-command-center/TimeframeController";

interface Props { current: Timeframe; onChange: (tf: Timeframe) => void; }

export default function TimeframeSelector({ current, onChange }: Props) {
  const options: { id: Timeframe | "H4" | "M1"; label: string; enabled: boolean }[] = [
    { id: "D", label: "D", enabled: true },
    { id: "W", label: "W", enabled: true },
    { id: "H4", label: "H4", enabled: false },
    { id: "M1", label: "M1", enabled: false },
  ];
  return (
    <div className="flex items-center gap-2 mb-3">
      {options.map((opt) => (
        <button key={opt.id}
          disabled={!opt.enabled}
          onClick={() => opt.enabled && onChange(opt.id as Timeframe)}
          style={!opt.enabled
            ? { opacity: 0.35, cursor: "not-allowed", background: "rgba(2,6,15,0.5)", border: "1px solid rgba(148,163,184,0.1)" }
            : current === opt.id
            ? { background: "rgba(56,189,248,0.15)", border: "1px solid rgba(56,189,248,0.4)", color: "#38bdf8" }
            : { background: "rgba(2,6,15,0.5)", border: "1px solid rgba(148,163,184,0.15)", color: "#94a3b8" }}
          className="px-3.5 py-1.5 rounded-lg text-[11px] font-bold transition">
          {opt.label}
        </button>
      ))}
      <span className="text-[9px] text-slate-500 ml-1">H4/M1 chờ xác minh dữ liệu intraday</span>
    </div>
  );
}
