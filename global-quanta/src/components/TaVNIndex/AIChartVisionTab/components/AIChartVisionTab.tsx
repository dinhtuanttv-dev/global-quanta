/**
 * AIChartVisionTab - Main container component
 * Compose: ControlPanel + PreviewPanel + ReportPanel
 */

import { useState } from "react";
import ControlPanel from "./ControlPanel";
import PreviewPanel from "./PreviewPanel";
import ReportPanel from "./ReportPanel";
import { runScan } from "../api";
import type { ScanParams, ScanResult } from "../types";

export default function AIChartVisionTab() {
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
      setRunError(err instanceof Error ? err.message : "Co loi xay ra khi chay pipeline.");
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
          Cau truc noi bo da khung thoi gian
        </p>
      </div>

      {runError && (
        <div className="aicv-danger">
          {runError}
        </div>
      )}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr" }}>
        <ControlPanel onRun={handleRun} isRunning={isRunning} />
        <PreviewPanel scanResult={scanResult} timeframes={timeframes} />
        <ReportPanel scanResult={scanResult} />
      </div>
    </div>
  );
}
