"use client";
import { TrendingUp, Square, Activity } from "lucide-react";
import type { DrawingToolType } from "../../../lib/ta-command-center/DrawingManager";

interface Props { activeTool: DrawingToolType | null; onSelectTool: (tool: DrawingToolType | null) => void; }

export default function DrawingPalette({ activeTool, onSelectTool }: Props) {
  const tools: { id: DrawingToolType; icon: typeof Square; label: string }[] = [
    { id: "trendline", icon: TrendingUp, label: "Trendline" },
    { id: "rectangle", icon: Square, label: "Zone" },
    { id: "fibonacci", icon: Activity, label: "Fibonacci" },
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
    </div>
  );
}
