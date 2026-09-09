/**
 * AIChartVisionPanel - Main container component
 * Compose: ControlPanel + PreviewPanel + ReportPanel
 *
 * ĐÃ SỬA — Tái cấu trúc TA VN-Index: nhận `ticker`/`onRequestTickerChange`
 * từ TaVnIndexTab.tsx (đồng bộ mã với tab Biểu đồ kỹ thuật + Auto
 * Drill-Down từ các tab sàng lọc). Cả 2 prop đều optional — nếu component
 * này được dùng độc lập ở nơi khác không truyền prop, hành vi cũ (symbol
 * mặc định "VNINDEX", tự do gõ) vẫn giữ nguyên.
 */

import { useState } from "react";
import ControlPanel from "./components/ControlPanel";
import PreviewPanel from "./components/PreviewPanel";
import ReportPanel from "./components/ReportPanel";
import { runScan } from "./api";
import type { AIChartVisionPanelProps, ScanParams, ScanResult } from "./types";

export default function AIChartVisionPanel({ ticker, onRequestTickerChange }: AIChartVisionPanelProps) {
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [timeframes, setTimeframes] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState("");

  const handleRun = async ({ symbol, timeframes: tfs, aiModel }: ScanParams) => {
    setIsRunning(true);
    setRunError("");
    setTimeframes(tfs);
    try {
      const result = await runScan({ symbol, timeframes: tfs, aiModel });
      setScanResult(result);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Có lỗi xảy ra khi chạy pipeline.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontSize: 16, fontWeight: 500, margin: "0 0 2px" }}>
          AI Chart Vision
        </p>
        <p style={{ fontSize: 13, color: "var(--aicv-text-muted)", margin: 0 }}>
          Cấu trúc nội bộ đa khung thời gian
        </p>
      </div>

      {runError && (
        <div className="aicv-danger">
          {runError}
        </div>
      )}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr" }}>
        <ControlPanel
          onRun={handleRun}
          isRunning={isRunning}
          initialSymbol={ticker}
          onSymbolChange={onRequestTickerChange}
        />
        <PreviewPanel scanResult={scanResult} timeframes={timeframes} />
        <ReportPanel scanResult={scanResult} />
      </div>
    </div>
  );
}
