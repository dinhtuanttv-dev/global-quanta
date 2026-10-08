"use client";
import { Zap } from "lucide-react";
import type { LayerState, LayerKey } from "../../../lib/ta-command-center/LayerManager";

// Thứ tự = thứ tự hiển thị. Tất cả mặc định TẮT (LayerManager.DEFAULT_LAYER_STATE).
const LABELS: Record<LayerKey, string> = {
  volume: "Khối lượng", rsi: "RSI 14", vprofile: "Volume Profile", avwap: "Anchored VWAP", smc: "SMC", vsa: "VSA", wyckoff: "Wyckoff", corporate: "Sự kiện quyền",
  trendline: "Trendline", demandzone: "Demand Zone", elliott: "Elliott",
};

interface Props { state: LayerState; onToggle: (key: LayerKey) => void; onToggleMaster: (on: boolean) => void; }

export default function LayerToggleBar({ state, onToggle, onToggleMaster }: Props) {
  const keys = Object.keys(LABELS) as LayerKey[];
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      {keys.map((key) => (
        <button key={key} onClick={() => onToggle(key)} aria-pressed={state[key]} data-layer={key}
          style={state[key]
            ? { background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.35)", color: "#38bdf8" }
            : { background: "rgba(2,6,15,0.5)", border: "1px solid rgba(148,163,184,0.12)", color: "#64748b" }}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition">
          <span className="w-6 h-3.5 rounded-full relative transition"
            style={{ background: state[key] ? "#38bdf8" : "rgba(100,116,139,0.4)" }}>
            <span className="absolute top-[1px] w-3 h-3 rounded-full bg-white transition-all"
              style={{ left: state[key] ? "13px" : "1px" }} />
          </span>
          {LABELS[key]}
        </button>
      ))}
      <button onClick={() => onToggleMaster(!state.aiDetectionMaster)} aria-pressed={state.aiDetectionMaster}
        title="Đối chiếu hình vẽ tay / mẫu hình với SMC · VSA · Wyckoff (điểm theo luật, không phải mô hình AI)"
        style={state.aiDetectionMaster
          ? { background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.4)", color: "#34d399" }
          : { background: "rgba(2,6,15,0.5)", border: "1px solid rgba(148,163,184,0.12)", color: "#64748b" }}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black ml-auto transition">
        <Zap className="w-3 h-3" /> Confluence Engine
      </button>
    </div>
  );
}
