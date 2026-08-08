"use client";
import { useState } from "react";
import { Star, RefreshCw, CheckCircle2, Bot, Sparkles } from "lucide-react";
import { useGoldenFilter } from "../../../hooks/useGoldenFilter";
import { buildAIAnalysisPrompt } from "../../../lib/ta-command-center/golden-filter/intersectAnalysis";

export default function GoldenFilterPanel({ onSelectTicker }: { onSelectTicker: (ticker: string) => void }) {
  const { goldenFilter, top20Tech, intersectResults, intersectionCount, universeSource, isLoading, refresh } = useGoldenFilter();
  const [aiNarrative, setAiNarrative] = useState<string>("");
  const [aiLoading, setAiLoading] = useState(false);

  const handleAskAI = async () => {
    setAiLoading(true); setAiNarrative("");
    try {
      const prompt = buildAIAnalysisPrompt(intersectResults, intersectionCount);
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      setAiNarrative(data.reply ?? "Khong nhan duoc phan hoi tu AI.");
    } catch { setAiNarrative("Loi khi goi AI. Vui long thu lai."); }
    setAiLoading(false);
  };

  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
          <Star className="w-3 h-3 text-amber-400" /> Golden Filter x Top 20 Ky Thuat
        </p>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-slate-500">Universe: {universeSource === "VN30_VN100" ? "VN30+VN100" : "60 ma (du phong)"}</span>
          <button onClick={() => refresh()} className="text-slate-400 hover:text-slate-200">
            <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }} className="rounded-lg p-2">
          <p className="text-[9px] text-slate-500">Golden Filter</p>
          <p className="text-sm font-black text-amber-400">{goldenFilter.length}</p>
        </div>
        <div style={{ background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.2)" }} className="rounded-lg p-2">
          <p className="text-[9px] text-slate-500">Top 20 Ky Thuat</p>
          <p className="text-sm font-black text-sky-400">{top20Tech.length}</p>
        </div>
        <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)" }} className="rounded-lg p-2">
          <p className="text-[9px] text-slate-500">Dong thuan</p>
          <p className="text-sm font-black text-emerald-400">{intersectionCount}</p>
        </div>
      </div>

      <div className="max-h-52 overflow-y-auto">
        <table className="w-full text-left text-[10px] border-collapse">
          <thead>
            <tr className="border-b border-slate-800/60 text-slate-500 uppercase">
              <th className="pb-1.5">Ma</th>
              <th className="pb-1.5 text-center">GF</th>
              <th className="pb-1.5 text-center">T20</th>
              <th className="pb-1.5 text-right">Composite</th>
              <th className="pb-1.5">Khuyen nghi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/30">
            {intersectResults.slice(0, 20).map((r: any, i: number) => (
              <tr key={i} onClick={() => onSelectTicker(r.ticker)} className="hover:bg-slate-800/30 cursor-pointer transition">
                <td className="py-1.5 font-black text-amber-400">
                  {r.ticker}
                  {r.isIntersection && <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400 inline ml-1" />}
                </td>
                <td className="py-1.5 text-center">{r.inGoldenFilter ? <span className="text-emerald-400">v</span> : <span className="text-slate-700">-</span>}</td>
                <td className="py-1.5 text-center">{r.inTop20Tech ? <span className="text-sky-400">v</span> : <span className="text-slate-700">-</span>}</td>
                <td className="py-1.5 text-right font-mono font-bold text-slate-200">{r.compositeRank}</td>
                <td className="py-1.5">
                  <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${
                    r.recommendation === "MUA MANH" ? "bg-emerald-500/10 text-emerald-400" :
                    r.recommendation === "THEO DOI" ? "bg-sky-500/10 text-sky-400" : "bg-slate-500/10 text-slate-400"
                  }`}>{r.recommendation}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-800/60 pt-2">
        <button onClick={handleAskAI} disabled={aiLoading || intersectionCount === 0}
          style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.3)" }}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] font-bold text-purple-300 disabled:opacity-40 transition">
          {aiLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
          {aiLoading ? "AI dang phan tich..." : "Hoi AI dien giai"}
        </button>
        {aiNarrative && (
          <div style={{ background: "rgba(14,22,38,0.7)", border: "1px solid rgba(167,139,250,0.15)" }} className="mt-2 rounded-lg p-2.5 flex items-start gap-2">
            <Bot className="w-3.5 h-3.5 text-purple-400 shrink-0 mt-0.5" />
            <p className="text-[10px] text-slate-300 leading-relaxed">{aiNarrative}</p>
          </div>
        )}
      </div>
    </div>
  );
}
