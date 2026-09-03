/**
 * ControlPanel - Input form for AI Chart Vision scan
 */

import { useState } from "react";
import type { ControlPanelProps, AiModel } from "../types";

const TIMEFRAMES = ["15m", "1h", "4h", "1d", "1w", "1M"];

export default function ControlPanel({ onRun, isRunning }: ControlPanelProps) {
  const [symbol, setSymbol] = useState("VNINDEX");
  const [selectedTfs, setSelectedTfs] = useState<Set<string>>(
    new Set(["1h", "4h", "1d"])
  );
  const [aiModel, setAiModel] = useState<AiModel>("gemini-2.5-flash");
  const [error, setError] = useState("");

  const toggleTf = (tf: string) => {
    const next = new Set(selectedTfs);
    if (next.has(tf)) next.delete(tf);
    else next.add(tf);
    setSelectedTfs(next);
  };

  const handleRun = () => {
    if (selectedTfs.size === 0) {
      setError("Chọn ít nhất một khung thời gian trước khi chạy.");
      return;
    }
    if (!symbol.trim()) {
      setError("Nhập symbol trước khi chạy.");
      return;
    }
    setError("");
    onRun({ symbol: symbol.trim(), timeframes: Array.from(selectedTfs), aiModel });
  };

  return (
    <div className="aicv-card">
      <p style={{ fontSize: 15, fontWeight: 500, margin: "0 0 4px" }}>
        Bảng điều khiển quét
      </p>
      <p style={{ fontSize: 12, color: "var(--aicv-text-muted)", margin: "0 0 16px" }}>
        Cấu hình trước khi chạy pipeline
      </p>

      <label className="aicv-label">Symbol</label>
      <input
        type="text"
        className="aicv-input"
        value={symbol}
        onChange={(e) => setSymbol(e.target.value)}
        style={{ marginBottom: 16 }}
        placeholder="VD: VNINDEX, BTCUSD, VNM..."
      />

      <label className="aicv-label">Khung thời gian</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 8 }}>
        {TIMEFRAMES.map((tf) => {
          const active = selectedTfs.has(tf);
          return (
            <button
              key={tf}
              onClick={() => toggleTf(tf)}
              className={`aicv-button ${active ? "aicv-button-accent" : ""}`}
              style={{ fontSize: 13, padding: "8px 0", fontWeight: active ? 500 : 400 }}
            >
              {tf}
            </button>
          );
        })}
      </div>
      <p style={{ fontSize: 12, color: "var(--aicv-text-muted)", margin: "0 0 16px" }}>
        {selectedTfs.size} khung đã chọn
      </p>

      <label className="aicv-label">Model AI (Vision layer)</label>
      <select
        className="aicv-select"
        value={aiModel}
        onChange={(e) => setAiModel(e.target.value as AiModel)}
        style={{ marginBottom: 16 }}
      >
        <option value="gemini-2.5-flash">Gemini 2.5 Flash — tốc độ cao</option>
        <option value="claude-sonnet-4-6">Claude Sonnet — suy luận sâu</option>
      </select>

      <button
        onClick={handleRun}
        disabled={isRunning}
        className="aicv-button aicv-button-accent"
        style={{ width: "100%", fontWeight: 500 }}
      >
        {isRunning ? "Đang quét pipeline..." : "Chạy quét đa khung"}
      </button>

      {error && (
        <p style={{ fontSize: 13, color: "var(--aicv-danger)", margin: "8px 0 0" }}>
          {error}
        </p>
      )}
    </div>
  );
}
