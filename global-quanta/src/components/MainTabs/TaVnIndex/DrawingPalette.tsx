"use client";
import { TrendingUp, Square, Activity, Waves, Clock3, Sparkles } from "lucide-react";
import type { DrawingToolType } from "../../../lib/ta-command-center/DrawingManager";

interface Props {
  activeTool: DrawingToolType | null;
  onSelectTool: (tool: DrawingToolType | null) => void;
  elliottEnabled: boolean;
  fibExtensionMode: boolean;
  onToggleFibExtension: () => void;
  // ĐÃ THÊM — Nâng cấp Elliott: gợi ý 6 điểm ứng viên bằng Zigzag pivot
  // thay vì bắt người dùng tự click từ đầu (xem zigzagSuggest.ts).
  onSuggestElliott: () => void;
}

export default function DrawingPalette({ activeTool, onSelectTool, fibExtensionMode, onToggleFibExtension, onSuggestElliott }: Props) {
  const tools: { id: DrawingToolType; icon: typeof Square; label: string }[] = [
    { id: "trendline", icon: TrendingUp, label: "Trendline" },
    { id: "rectangle", icon: Square, label: "Zone" },
    { id: "fibonacci", icon: Activity, label: fibExtensionMode ? "Fibonacci (co Extension)" : "Fibonacci" },
    { id: "fibTimeZone", icon: Clock3, label: "Fibonacci Time Zones (1 click)" },
    { id: "elliott", icon: Waves, label: "Elliott Wave (6 diem)" },
  ];

  return (
    <div style={{ background: "rgba(14,22,38,0.9)", border: "1px solid rgba(148,163,184,0.15)" }}
      className="absolute top-3 left-3 z-10 flex flex-col gap-1 p-1.5 rounded-lg">
      {tools.map((t) => {
        const Icon = t.icon;
        const isActive = activeTool === t.id;
        return (
          <button key={t.id} title={t.label} onClick={() => onSelectTool(isActive ? null : t.id)}
            style={isActive ? { background: "rgba(245,158,11,0.2)", color: "#fbbf24" } : { color: "#94a3b8" }}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-700/40 transition">
            <Icon className="w-3.5 h-3.5" />
          </button>
        );
      })}
      <div style={{ height: 1, background: "rgba(148,163,184,0.15)" }} className="my-0.5" />
      <button
        title={fibExtensionMode ? "Fib Extension: BAT (127.2/161.8/261.8%)" : "Fib Extension: TAT"}
        onClick={onToggleFibExtension}
        style={fibExtensionMode ? { background: "rgba(167,139,250,0.2)", color: "#a78bfa" } : { color: "#64748b" }}
        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-700/40 transition text-[9px] font-bold">
        Ext
      </button>
      <button
        title="AI gợi ý 6 điểm Elliott bằng Zigzag pivot — có thể xóa/vẽ lại nếu không đồng ý"
        onClick={onSuggestElliott}
        style={{ color: "#38bdf8" }}
        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-700/40 transition">
        <Sparkles className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

