"use client";
import { TrendingUp, Square, Activity, Clock3 } from "lucide-react";
import type { DrawingToolType } from "../../../lib/ta-command-center/DrawingManager";

interface Props {
  activeTool: DrawingToolType | null;
  onSelectTool: (tool: DrawingToolType | null) => void;
  elliottEnabled: boolean;
  fibExtensionMode: boolean;
  onToggleFibExtension: () => void;
}
// EP4 (24/10/2026): công cụ vẽ Elliott 0–5 và nút "Gợi ý" đã bỏ — thay bằng "Chỉnh tay cách đếm" trong bảng Elliott Pro
// (hình Elliott đã vẽ trước đây vẫn hiển thị, chỉ đọc, qua lớp "Elliott (vẽ tay)").

export default function DrawingPalette({ activeTool, onSelectTool, fibExtensionMode, onToggleFibExtension }: Props) {
  const tools: { id: DrawingToolType; icon: typeof Square; label: string }[] = [
    { id: "trendline", icon: TrendingUp, label: "Trendline" },
    { id: "rectangle", icon: Square, label: "Zone" },
    { id: "fibonacci", icon: Activity, label: fibExtensionMode ? "Fibonacci (có Extension)" : "Fibonacci" },
    { id: "fibTimeZone", icon: Clock3, label: "Fibonacci Time Zones (1 click)" },
  ];

  return (
    <div style={{ background: "rgba(14,22,38,0.9)", border: "1px solid rgba(148,163,184,0.15)" }}
      className="absolute top-3 left-3 z-10 flex flex-col gap-1 p-1.5 rounded-lg">
      {tools.map((t) => {
        const Icon = t.icon;
        const isActive = activeTool === t.id;
        return (
          <button key={t.id} title={t.label} aria-label={t.label} aria-pressed={isActive} data-tool={t.id} onClick={() => onSelectTool(isActive ? null : t.id)}
            style={isActive ? { background: "rgba(245,158,11,0.2)", color: "#fbbf24" } : { color: "#94a3b8" }}
            className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-700/40 transition">
            <Icon className="w-3.5 h-3.5" />
          </button>
        );
      })}
      <div style={{ height: 1, background: "rgba(148,163,184,0.15)" }} className="my-0.5" />
      <button
        title={fibExtensionMode ? "Fib Extension: BẬT (127.2/161.8/261.8%)" : "Fib Extension: TẮT"}
        onClick={onToggleFibExtension} data-testid="fib-ext" aria-pressed={fibExtensionMode}
        style={fibExtensionMode ? { background: "rgba(167,139,250,0.2)", color: "#a78bfa" } : { color: "#64748b" }}
        className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-slate-700/40 transition text-[9px] font-bold">
        Ext
      </button>
    </div>
  );
}

