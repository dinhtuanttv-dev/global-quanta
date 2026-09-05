/**
 * PreviewPanel - Hiển thị Macro Layer + Tactical Layer
 */

import { useState, useMemo } from "react";
import type { PreviewPanelProps } from "../types";

export default function PreviewPanel({ scanResult, timeframes }: PreviewPanelProps) {
  const availableTfs = timeframes && timeframes.length > 0 ? timeframes : ["1h", "4h", "1d"];
  const [activeTf, setActiveTf] = useState(availableTfs[0]);

  // Map timeframe key for tactical_layer (backend dùng "daily" thay vì "1d")
  const tfKey = useMemo(() => {
    if (!scanResult) return activeTf;
    if (activeTf === "1d" && scanResult.tactical_layer.daily) return "daily";
    if (activeTf === "4h" && scanResult.tactical_layer["4h"]) return "4h";
    if (activeTf === "1h" && scanResult.tactical_layer["1h"]) return "1h";
    if (activeTf === "15m" && scanResult.tactical_layer["15m"]) return "15m";
    return activeTf;
  }, [activeTf, scanResult]);

  const block = scanResult?.tactical_layer?.[tfKey as keyof typeof scanResult.tactical_layer];

  return (
    <div className="aicv-card">
      <p style={{ fontSize: 15, fontWeight: 500, margin: "0 0 4px" }}>
        Xem biểu đồ
      </p>
      <p style={{ fontSize: 12, color: "var(--aicv-text-muted)", margin: "0 0 16px" }}>
        Ảnh chụp theo từng khung đã quét
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        {availableTfs.map((tf) => (
          <button
            key={tf}
            onClick={() => setActiveTf(tf)}
            className={`aicv-button ${tf === activeTf ? "aicv-button-accent" : ""}`}
            style={{ fontSize: 12, padding: "5px 10px" }}
          >
            {tf}
          </button>
        ))}
      </div>

      <div
        style={{
          position: "relative",
          aspectRatio: "16/9",
          background: "var(--aicv-surface-1)",
          borderRadius: 8,
          border: "0.5px solid var(--aicv-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {!scanResult ? (
          <span style={{ fontSize: 12, color: "var(--aicv-text-muted)" }}>
            Chưa có dữ liệu — hãy chạy quét ở Bảng điều khiển
          </span>
        ) : (
          <>
            <div
              style={{
                position: "absolute",
                top: 8,
                left: 8,
                background: "var(--aicv-surface-2)",
                border: "0.5px solid var(--aicv-border)",
                borderRadius: 6,
                padding: "3px 8px",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {activeTf}
            </div>
            <div style={{ fontSize: 13, color: "var(--aicv-text-secondary)", padding: "0 24px", textAlign: "center" }}>
              {block
                ? `${block.trend} — hỗ trợ ${block.support} / kháng cự ${block.resistance}`
                : "Không có dữ liệu cho khung này"}
            </div>
          </>
        )}
      </div>

      {/* Macro Layer - hiển thị khi có data */}
      {scanResult?.macro_layer && (
        <div className="aicv-warning" style={{ marginTop: 12 }}>
          <p style={{ fontSize: 11, color: "var(--aicv-warning-text)", margin: "0 0 4px", fontWeight: 500 }}>
            MACRO LAYER
          </p>
          <p style={{ fontSize: 12, margin: "0 0 2px" }}>
            <strong>Monthly:</strong> {scanResult.macro_layer.monthly.market_cycle_phase} — {scanResult.macro_layer.monthly.major_structure}
          </p>
          <p style={{ fontSize: 12, margin: 0 }}>
            <strong>Weekly:</strong> {scanResult.macro_layer.weekly.structural_bias} | POC: {scanResult.macro_layer.weekly.volume_profile_poc}
          </p>
        </div>
      )}

      <p style={{ fontSize: 12, color: "var(--aicv-text-muted)", marginTop: 12 }}>
        {scanResult
          ? `Target: ${scanResult.target} | Cập nhật lúc ${new Date(scanResult.scan_timestamp).toLocaleTimeString("vi-VN")}`
          : ""}
      </p>
    </div>
  );
}