"use client";
import { ListChecks } from "lucide-react";
import type { SignalLogEntry } from "../../../lib/ta-command-center/AIEngine";
import ProvenanceBadge from "./ProvenanceBadge";

// Nhật ký hợp lưu: điểm = luật cộng dồn (40 + OB + VSA + Wyckoff − số lần test), KHÔNG phải xác suất đã kiểm định.
export default function AISignalLogPanel({ log, engineOn }: { log: SignalLogEntry[]; engineOn: boolean }) {
  return (
    <div style={{ background: "rgba(2,6,15,0.6)", border: "1px solid rgba(148,163,184,0.1)" }} className="rounded-xl p-3" data-testid="signal-log">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1">
        <ListChecks className="w-3 h-3" /> Confluence Log ({log.length})
        <span className={`ml-auto font-mono text-[8.5px] ${engineOn ? "text-emerald-400" : "text-slate-500"}`}>
          {engineOn ? "● ENGINE ON" : "○ ENGINE OFF"}
        </span>
      </p>
      {log.length === 0 ? (
        <p className="text-[10px] text-slate-500 italic py-2">
          {engineOn
            ? "Vẽ Zone / Trendline / Fibonacci hoặc chọn một mẫu hình ở Pattern Scanner để đối chiếu với SMC · VSA · Wyckoff."
            : "Confluence Engine đang tắt — bật nút \"Confluence Engine\" trên thanh lớp để đối chiếu hình vẽ với SMC · VSA · Wyckoff."}
        </p>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {log.map((entry) => (
            <div key={entry.id}
              style={{ background: "rgba(14,22,38,0.7)", border: "1px solid rgba(148,163,184,0.08)" }}
              className="rounded-lg p-2 flex items-start justify-between gap-2">
              <p className="text-[10px] text-slate-300 leading-relaxed">{entry.message}</p>
              <span className="flex flex-col items-end gap-1 shrink-0">
                <ProvenanceBadge kind={entry.dataQuality} className="" />
                {entry.confidence !== null && (
                  <span className="text-[9px] font-mono text-amber-400" title="Điểm luật, không phải xác suất">{entry.confidence}/99</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
