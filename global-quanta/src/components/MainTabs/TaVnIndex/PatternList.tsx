"use client";
import { Search, RefreshCw, CheckCircle2 } from "lucide-react";
import { usePatternScan } from "../../../hooks/usePatternScan";
import type { PatternMatch } from "../../../lib/ta-command-center/types";

interface Props { onSelectPattern: (pattern: PatternMatch) => void; }

export default function PatternList({ onSelectPattern }: Props) {
  const { scanData, isLoading, refresh } = usePatternScan();
  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
          <Search className="w-3 h-3" /> Pattern Scanner
        </p>
        <div className="flex items-center gap-2">
          {scanData && <span className="flex items-center gap-1 text-[9px] text-emerald-400"><CheckCircle2 className="w-2.5 h-2.5" />HARD_DATA</span>}
          <button onClick={() => refresh()} className="text-slate-400 hover:text-slate-200">
            <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {scanData && (
        <div className="flex flex-wrap gap-2 mb-2">
          <span style={{ background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)" }} className="text-[9px] text-sky-400 px-2 py-0.5 rounded-full">Vol &gt; 500.000 CP</span>
          <span style={{ background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)" }} className="text-[9px] text-sky-400 px-2 py-0.5 rounded-full">Gia &gt; MA200</span>
          <span className="text-[9px] text-slate-500 ml-auto">
            Universe: {scanData.universeSource === "VN30_VN100" ? "VN30+VN100" : "60 ma du phong"} · Dat loc: {scanData.eligibleCount}/{scanData.totalUniverse} · Mo hinh: {scanData.matches.length}
          </span>
        </div>
      )}

      {isLoading && !scanData && (
        <div className="flex items-center gap-2 text-[10px] text-slate-400 py-4 justify-center">
          <RefreshCw className="w-3 h-3 animate-spin" /> Dang quet pattern (loc thi truong + nhan dien)...
        </div>
      )}

      {scanData && scanData.matches.length === 0 && (
        <p className="text-[10px] text-slate-500 italic py-3 text-center">Khong co ma nao dang hinh thanh mo hinh du dieu kien.</p>
      )}

      <div className="max-h-48 overflow-y-auto">
        <table className="w-full text-left text-[10px] border-collapse">
          <thead>
            <tr className="border-b border-slate-800/60 text-slate-500 uppercase">
              <th className="pb-1.5">Ma</th>
              <th className="pb-1.5">Mo hinh</th>
              <th className="pb-1.5 text-right">Conf</th>
              <th className="pb-1.5">TT</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/30">
            {scanData?.matches.map((m: PatternMatch, i: number) => (
              <tr key={i} onClick={() => onSelectPattern(m)} className="hover:bg-slate-800/30 cursor-pointer transition">
                <td className="py-1.5">
                  <span className="font-black text-amber-400">{m.ticker}</span>
                  <span className="block text-[8px] font-mono text-slate-600">{m.tag}</span>
                </td>
                <td className="py-1.5 text-slate-300">{m.patternLabel}</td>
                <td className="py-1.5 text-right font-mono">
                  <span className={m.confidenceScore >= 70 ? "text-emerald-400" : "text-amber-400"}>{m.confidenceScore}</span>
                </td>
                <td className="py-1.5">
                  <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${m.status === "confirmed" ? "bg-emerald-500/10 text-emerald-400" : "bg-sky-500/10 text-sky-400"}`}>
                    {m.status === "confirmed" ? "Xac nhan" : "Hinh thanh"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
