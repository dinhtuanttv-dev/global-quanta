"use client";
import { RefreshCw, GitMerge, AlertTriangle } from "lucide-react";
import { useConvergenceFilter } from "../../../hooks/useConvergenceFilter";
import type { ConvergenceResult } from "../../../lib/ta-command-center/detectors/convergenceEngine";

const WYCKOFF_LABEL: Record<string, string> = {
  markup: "Markup", spring: "Spring", test: "Test",
  accumulation: "Accumulation", undetermined: "Chua xac dinh",
};

interface Props { onSelectTicker: (ticker: string) => void; }

export default function ConvergenceFilterPanel({ onSelectTicker }: Props) {
  const { results, universeSource, totalUniverse, isLoading, refresh } = useConvergenceFilter();

  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(6,182,212,0.25)" }} className="rounded-xl p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-300 uppercase flex items-center gap-1.5">
          <GitMerge className="w-3 h-3 text-cyan-400" /> Bo Loc Hop Luu Nang Cao (Wyckoff + SMC + FVG)
        </p>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[9px] text-amber-400">
            <AlertTriangle className="w-2.5 h-2.5" /> ESTIMATED
          </span>
          <button onClick={() => refresh()} className="text-slate-400 hover:text-slate-200">
            <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <p className="text-[9px] text-slate-500 leading-relaxed">
        Wyckoff la suy luan tu mau hinh gia/khoi luong, khong phai phan tich dong tien to chuc thuc te.
        Cong thuc: Wyckoff 30% + SMC OB 30% + FVG 20% + Volume 20%.
      </p>

      {isLoading && !results.length && (
        <div className="flex items-center gap-2 text-[10px] text-slate-400 py-4 justify-center">
          <RefreshCw className="w-3 h-3 animate-spin" /> Dang quet hop luu (Wyckoff + SMC + FVG)...
        </div>
      )}

      {!isLoading && results.length === 0 && (
        <p className="text-[10px] text-slate-500 italic py-3 text-center">Khong co ma nao dat dieu kien loc thi truong.</p>
      )}

      {results.length > 0 && (
        <>
          <p className="text-[9px] text-slate-500">
            Universe: {universeSource === "VN30_VN100" ? "VN30+VN100" : "60 ma du phong"} · Dat dieu kien: {results.length}/{totalUniverse}
          </p>
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-left text-[10px] border-collapse">
              <thead>
                <tr className="border-b border-slate-800/60 text-slate-500 uppercase">
                  <th className="pb-1.5">Ma</th>
                  <th className="pb-1.5">Wyckoff</th>
                  <th className="pb-1.5">SMC</th>
                  <th className="pb-1.5">FVG</th>
                  <th className="pb-1.5">Vol</th>
                  <th className="pb-1.5 text-right">Diem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/30">
                {results.slice(0, 20).map((r: ConvergenceResult) => (
                  <tr key={r.ticker} onClick={() => onSelectTicker(r.ticker)} className="hover:bg-slate-800/30 cursor-pointer transition">
                    <td className="py-1.5">
                      <span className="font-black text-amber-400">{r.ticker}</span>
                      <span className="block text-[8px] text-slate-600">{r.sector}</span>
                    </td>
                    <td className="py-1.5 text-cyan-400">{WYCKOFF_LABEL[r.wyckoffPhase]}</td>
                    <td className="py-1.5 text-slate-300">
                      {r.smcStatus === "fresh_testing" ? "Dang test" : r.smcStatus === "old_tested" ? "Da test" : "-"}
                    </td>
                    <td className="py-1.5 text-slate-300">
                      {r.fvgStatus === "near_unfilled" ? "Gan, chua lap" : r.fvgStatus === "far_or_partial" ? "Xa/1 phan" : "-"}
                    </td>
                    <td className="py-1.5 text-slate-300">
                      {r.volumeStatus === "high" ? "Cao" : r.volumeStatus === "medium" ? "TB" : "Thap"}
                    </td>
                    <td className="py-1.5 text-right font-mono font-bold">
                      <span className={r.compositeScore >= 60 ? "text-emerald-400" : r.compositeScore >= 40 ? "text-amber-400" : "text-slate-500"}>
                        {r.compositeScore}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
