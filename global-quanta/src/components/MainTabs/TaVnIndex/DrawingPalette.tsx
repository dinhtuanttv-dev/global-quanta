"use client";
import { TrendingUp, Square, Activity, Waves, Clock3 } from "lucide-react";
import type { DrawingToolType } from "../../../lib/ta-command-center/DrawingManager";

interface Props {
  activeTool: DrawingToolType | null;
  onSelectTool: (tool: DrawingToolType | null) => void;
  elliottEnabled: boolean;
  fibExtensionMode: boolean;
  onToggleFibExtension: () => void;
}

// ĐÃ SỬA — LỖI CŨ: nút vẽ Elliott Wave trước đây CHỈ xuất hiện trong DOM
// khi `elliottEnabled` (= layerState.elliott, toggle HIỂN THỊ trên
// LayerToggleBar) bật — mà toggle này mặc định TẮT (DEFAULT_STATE.elliott:
// false). Người dùng bấm vào vị trí nút Elliott lẽ ra phải có nhưng nút
// không hề tồn tại -> "bấm không thấy hoạt động". Đây là lỗi thiết kế
// không nhất quán: Trendline/Rectangle luôn hiện sẵn công cụ vẽ bất kể
// toggle hiển thị đang bật/tắt (toggle chỉ ẩn/hiện hình ĐÃ vẽ xong, không
// khóa công cụ vẽ). Giờ Elliott áp dụng đúng quy tắc y hệt — luôn hiện
// công cụ vẽ; `elliottEnabled` không còn dùng để gate hiển thị nút nữa
// (tham số này được giữ trong Props để không phá interface, nhưng không
// còn ảnh hưởng tới việc nút có hiện hay không).
export default function DrawingPalette({ activeTool, onSelectTool, fibExtensionMode, onToggleFibExtension }: Props) {
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
    </div>
  );
}
