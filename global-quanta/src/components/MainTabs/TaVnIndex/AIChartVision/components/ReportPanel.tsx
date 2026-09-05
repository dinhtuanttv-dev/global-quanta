/**
 * ReportPanel - Hiển thị đầy đủ Consensus + Macro + Quant + Risk + AI Synthesis
 */

import { useState } from "react";
import type { ReportPanelProps } from "../types";

export default function ReportPanel({ scanResult }: ReportPanelProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!scanResult) return;
    navigator.clipboard.writeText(JSON.stringify(scanResult, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!scanResult) {
    return (
      <div className="aicv-card">
        <p style={{ fontSize: 15, fontWeight: 500, margin: "0 0 4px" }}>
          Báo cáo tổng hợp
        </p>
        <p style={{ fontSize: 12, color: "var(--aicv-text-muted)" }}>
          Chưa có dữ liệu — hãy chạy quét ở Bảng điều khiển.
        </p>
      </div>
    );
  }

  const v = scanResult.consensus_verdict;
  const completeness = scanResult.data_completeness_flag;

  return (
    <div>
      {/* ============== HEADER + CONSENSUS ============== */}
      <div className="aicv-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 500, margin: "0 0 4px" }}>
              Báo cáo tổng hợp - {scanResult.target}
            </p>
            <p style={{ fontSize: 12, color: "var(--aicv-text-muted)", margin: 0 }}>
              Data: {completeness} | {new Date(scanResult.scan_timestamp).toLocaleString("vi-VN")}
            </p>
          </div>
          <button onClick={handleCopy} className="aicv-button" style={{ fontSize: 12, padding: "5px 10px" }}>
            Sao chép JSON
          </button>
        </div>

        <div className="aicv-success" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, color: "var(--aicv-success-text)", margin: "0 0 4px", fontWeight: 500 }}>
            CONSENSUS VERDICT
          </p>
          <p style={{ fontSize: 15, color: "var(--aicv-success-text)", margin: "0 0 8px", fontWeight: 500 }}>
            {v.final_bias}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <div>
              <p style={{ fontSize: 11, color: "var(--aicv-text-secondary)", margin: 0 }}>Confidence</p>
              <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{v.confidence_tier}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "var(--aicv-text-secondary)", margin: 0 }}>Bayesian</p>
              <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{v.confidence_score_bayesian.toFixed(2)}</p>
            </div>
            <div>
              <p style={{ fontSize: 11, color: "var(--aicv-text-secondary)", margin: 0 }}>Invalidation</p>
              <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{v.invalidation_level}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ============== AI SYNTHESIS ============== */}
      <div className="aicv-card">
        <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 4px" }}>AI Synthesis</p>
        <p style={{ fontSize: 11, color: "var(--aicv-text-muted)", margin: "0 0 12px" }}>
          Models: {scanResult.ai_synthesis.models_used.join(" + ")}
          {v.synthesis_disagreement && " (Disagreement)"}
        </p>

        <p style={{ fontSize: 12, fontWeight: 500, margin: "0 0 4px" }}>Main Thesis</p>
        <p style={{ fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" }}>
          {scanResult.ai_synthesis.main_thesis}
        </p>

        <div style={{ borderTop: "0.5px solid var(--aicv-border)", paddingTop: 12 }}>
          <p style={{ fontSize: 11, color: "var(--aicv-text-muted)", margin: "0 0 4px", fontWeight: 500 }}>
            ACTIONABLE INSIGHT
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, fontWeight: 500 }}>
            {scanResult.actionable_insight}
          </p>
        </div>
      </div>

      {copied && (
        <p style={{ fontSize: 12, color: "var(--aicv-success-text)", textAlign: "center", marginTop: 12 }}>
          Đã sao chép JSON
        </p>
      )}
    </div>
  );
}