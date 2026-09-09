/**
 * ControlPanel - Input form for AI Chart Vision scan
 *
 * ĐÃ SỬA — Tái cấu trúc TA VN-Index:
 * 1. `symbol` khởi tạo từ `initialSymbol` (mã đang xem ở tab Biểu đồ kỹ
 *    thuật) thay vì hardcode "VNINDEX".
 * 2. Đồng bộ khi `initialSymbol` đổi từ bên ngoài (đổi ở TickerSelector,
 *    hoặc Auto Drill-Down từ tab sàng lọc).
 * 3. Khi trader tự sửa Symbol tại đây, CHỈ đồng bộ ngược lên khi rời ô
 *    (blur) hoặc bấm Enter — KHÔNG đồng bộ mỗi keystroke, để tránh tải
 *    lại dữ liệu giá thật của biểu đồ liên tục khi đang gõ dở (ví dụ gõ
 *    "VNM" sẽ không kích hoạt 3 lần tải lại cho "V", "VN", "VNM").
 */

import { useEffect, useState } from "react";
import type { ControlPanelProps, AiModel } from "../types";

const TIMEFRAMES = ["15m", "1h", "4h", "1d", "1w", "1M"];

export default function ControlPanel({ onRun, isRunning, initialSymbol, onSymbolChange }: ControlPanelProps) {
  const [symbol, setSymbol] = useState(initialSymbol || "VNINDEX");
  const [selectedTfs, setSelectedTfs] = useState<Set<string>>(
    new Set(["1h", "4h", "1d"])
  );
  const [aiModel, setAiModel] = useState<AiModel>("gemini-2.5-flash");
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialSymbol && initialSymbol !== symbol) {
      setSymbol(initialSymbol);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSymbol]);

  const syncSymbolUp = () => {
    if (symbol.trim() && symbol.trim() !== initialSymbol) {
      onSymbolChange?.(symbol.trim());
    }
  };

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
    syncSymbolUp();
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
        onBlur={syncSymbolUp}
        onKeyDown={(e) => {
          if (e.key === "Enter") syncSymbolUp();
        }}
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
