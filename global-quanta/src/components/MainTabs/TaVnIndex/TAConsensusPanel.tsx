"use client";
import { Crown, CheckCircle2 } from "lucide-react";
import { useTAConsensus } from "../../../hooks/useTAConsensus";
import type { TAConsensusLabel } from "../../../lib/ta-command-center/golden-filter/taConsensus";

const LABEL_STYLE: Record<TAConsensusLabel, { text: string; color: string; bg: string }> = {
  "Elite Convergence": { text: "Elite Convergence", color: "#34d399", bg: "rgba(16,185,129,0.12)" },
  "Golden Intersection": { text: "Golden Intersection", color: "#38bdf8", bg: "rgba(56,189,248,0.1)" },
  "Convergence Only": { text: "Convergence Only", color: "#a78bfa", bg: "rgba(167,139,250,0.1)" },
  "Pattern Only": { text: "Pattern Only", color: "#fbbf24", bg: "rgba(251,191,36,0.08)" },
};

export default function TAConsensusPanel({ onSelectTicker }: { onSelectTicker: (ticker: string) => void }) {
  const { results, intersectionCount, goldenCount, convergenceCount, isLoading } = useTAConsensus();

  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(245,158,11,0.3)" }} className="rounded-xl p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-amber-300 uppercase flex items-center gap-1.5">
          <Crown className="w-3 h-3" /> Dong Thuan TA — Top 20
        </p>
        <span className="text-[9px] text-slate-500">
          Golden: {goldenCount} · Hop luu: {convergenceCount} · Giao: {intersectionCount}
        </span>
      </div>

      {isLoading && results.length === 0 && (
        <p className="text-[10px] text-slate-400 py-3 text-center">Dang tong hop du lieu tu 2 nguon...</p>
      )}

      {!isLoading && results.length === 0 && (
        <p className="text-[10px] text-slate-500 italic py-3 text-center">Chua co du lieu tu Golden Filter hoac Bo loc Hop luu.</p>
      )}

      {results.length > 0 && (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-left text-[10px] border-collapse">
            <thead>
              <tr className="border-b border-slate-800/60 text-slate-500 uppercase">
                <th className="pb-1.5">Ma</th>
                <th className="pb-1.5">Nhan</th>
                <th className="pb-1.5 text-center">GF</th>
                <th className="pb-1.5 text-center">Hop luu</th>
                <th className="pb-1.5 text-right">Diem</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/30">
              {results.map((r) => {
                const style = LABEL_STYLE[r.label];
                return (
                  <tr key={r.ticker} onClick={() => onSelectTicker(r.ticker)} className="hover:bg-slate-800/30 cursor-pointer transition">
                    <td className="py-1.5">
                      <span className="font-black text-amber-400">{r.ticker}</span>
                      {r.inGoldenFilter && r.inConvergenceFilter && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 inline ml-1" />}
                    </td>
                    <td className="py-1.5">
                      <span style={{ color: style.color, background: style.bg }} className="text-[8px] px-1.5 py-0.5 rounded-full font-bold">
                        {style.text}
                      </span>
                    </td>
                    <td className="py-1.5 text-center text-slate-300">{r.goldenScore ?? "-"}</td>
                    <td className="py-1.5 text-center text-slate-300">{r.convergenceScore ?? "-"}</td>
                    <td className="py-1.5 text-right font-mono font-bold text-slate-100">{r.taConsensusScore}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
