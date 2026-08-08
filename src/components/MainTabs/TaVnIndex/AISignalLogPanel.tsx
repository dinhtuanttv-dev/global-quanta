"use client";
import { ListChecks } from "lucide-react";
import type { SignalLogEntry } from "../../../lib/ta-command-center/AIEngine";

export default function AISignalLogPanel({ log }: { log: SignalLogEntry[] }) {
  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3">
      <p className="text-[10px] font-bold text-slate-400 uppercase mb-2 flex items-center gap-1">
        <ListChecks className="w-3 h-3" /> AI Signal Log ({log.length})
      </p>
      {log.length === 0 ? (
        <p className="text-[10px] text-slate-600 italic py-2">
          Bat "AI Detection" roi ve vung/trendline de bat dau ghi log.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {log.map((entry) => (
            <div key={entry.id}
              style={{ background: "rgba(14,22,38,0.7)", border: "1px solid rgba(148,163,184,0.08)" }}
              className="rounded-lg p-2 flex items-start justify-between gap-2">
              <p className="text-[10px] text-slate-300 leading-relaxed">{entry.message}</p>
              {entry.confidence !== null && (
                <span className="text-[9px] font-mono text-amber-400 shrink-0">{entry.confidence}%</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
