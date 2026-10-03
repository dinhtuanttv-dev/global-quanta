"use client";
import { RefreshCw, GitMerge } from "lucide-react";
import { useConvergenceFilter } from "../../../hooks/useConvergenceFilter";
import type { ConvergenceResult } from "../../../lib/ta-command-center/detectors/convergenceEngine";
import { WYCKOFF_PHASE_LABEL } from "../../../lib/ta-command-center/detectors/wyckoffDetector";
import ProvenanceBadge from "./ProvenanceBadge";


interface Props { onSelectTicker: (ticker: string) => void; }

export default function ConvergenceFilterPanel({ onSelectTicker }: Props) {
  const { results, universeSource, totalUniverse, isLoading, refresh } = useConvergenceFilter();

  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(6,182,212,0.25)" }} className="rounded-xl p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold text-slate-300 uppercase flex items-center gap-1.5">
          <GitMerge className="w-3 h-3 text-cyan-400" /> Bộ lọc Hợp lưu (Wyckoff · SMC · FVG · Effort)
        </p>
        <div className="flex items-center gap-2">
          <ProvenanceBadge kind="INFERRED" className="" />
          <button onClick={() => refresh()} className="text-slate-400 hover:text-slate-200">
            <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <p className="text-[9px] text-slate-500 leading-relaxed">
        Wyckoff là suy luận từ mẫu hình giá/khối lượng, không phải dòng tiền tổ chức thực tế.
        Công thức: Wyckoff 30% + Order Block 30% + FVG 20% + Effort (volume) 20% — trọng số cố định, chưa kiểm định.
      </p>

      {isLoading && !results.length && (
        <div className="flex items-center gap-2 text-[10px] text-slate-400 py-4 justify-center">
          <RefreshCw className="w-3 h-3 animate-spin" /> Đang quét hợp lưu (Wyckoff · SMC · FVG)…
        </div>
      )}

      {!isLoading && results.length === 0 && (
        <p className="text-[10px] text-slate-500 italic py-3 text-center">Không có mã nào đạt điều kiện lọc thị trường.</p>
      )}

      {results.length > 0 && (
        <>
          <p className="text-[9px] text-slate-500">
            Universe: {universeSource === "VN30_VN100" ? "VN30+VN100" : "61 mã dự phòng"} · Đạt điều kiện: {results.length}/{totalUniverse}
          </p>
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-left text-[10px] border-collapse">
              <thead>
                <tr className="border-b border-slate-800/60 text-slate-500 uppercase">
                  <th className="pb-1.5">Mã</th>
                  <th className="pb-1.5">Wyckoff</th>
                  <th className="pb-1.5">SMC</th>
                  <th className="pb-1.5">FVG</th>
                  <th className="pb-1.5">Effort</th>
                  <th className="pb-1.5 text-right">Điểm</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/30">
                {results.slice(0, 20).map((r: ConvergenceResult) => (
                  <tr key={r.ticker} onClick={() => onSelectTicker(r.ticker)} className="hover:bg-slate-800/30 cursor-pointer transition">
                    <td className="py-1.5">
                      <span className="font-black text-amber-400">{r.ticker}</span>
                      <span className="block text-[8px] text-slate-600">{r.sector}</span>
                    </td>
                    <td className="py-1.5 text-violet-300">{WYCKOFF_PHASE_LABEL[r.wyckoffPhase] ?? r.wyckoffPhase}</td>
                    <td className="py-1.5 text-slate-300">
                      {r.smcStatus === "fresh_testing" ? "Trong OB" : r.smcStatus === "old_tested" ? "Ngoài OB" : "—"}
                    </td>
                    <td className="py-1.5 text-slate-300">
                      {r.fvgStatus === "near_unfilled" ? "Gần (≤3%)" : r.fvgStatus === "far_or_partial" ? "Xa" : "—"}
                    </td>
                    <td className="py-1.5 text-slate-300">
                      {r.volumeStatus === "high" ? ">2× TB20" : r.volumeStatus === "medium" ? "≥1.2×" : "Thấp"}
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
