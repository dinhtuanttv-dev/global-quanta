/**
 * ReportPanel - Hiển thị Consensus + Risk + AI Synthesis + Checklist bằng chứng
 *
 * ĐÃ SỬA: `data_completeness_flag` không tồn tại trong response chế độ
 * "structured" (chỉ có ở chế độ vision cũ) — thay bằng
 * `is_historical_data_mock`/`historical_data_source`. Thêm hiển thị
 * `ai_synthesis.checklist` — phần "giải thích tại sao" đã yêu cầu từ đầu,
 * giờ mới thực sự hiển thị được vì API đã trả đúng field này.
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
              Nguồn dữ liệu: {scanResult.is_historical_data_mock ? "Mô phỏng" : "Thật"} ({scanResult.historical_data_source}) |{" "}
              {new Date(scanResult.scan_timestamp).toLocaleString("vi-VN")}
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
              <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>
                {v.invalidation_level === null ? "Chưa xác định" : v.invalidation_level}
              </p>
            </div>
          </div>
          {!v.ensemble_agreement_is_real && (
            <p style={{ fontSize: 10, color: "var(--aicv-text-muted)", marginTop: 8, marginBottom: 0 }}>
              * Chỉ có 1 model AI khả dụng, chưa có đối chiếu chéo thật.
            </p>
          )}
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

        {scanResult.ai_synthesis.conflicting_factors.length > 0 && (
          <>
            <p style={{ fontSize: 12, fontWeight: 500, margin: "0 0 4px" }}>Điểm mâu thuẫn / cần lưu ý</p>
            <ul style={{ fontSize: 12, lineHeight: 1.6, margin: "0 0 12px", paddingLeft: 18 }}>
              {scanResult.ai_synthesis.conflicting_factors.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </>
        )}

        {/* Checklist bằng chứng — trả lời "tại sao AI kết luận như vậy" */}
        {scanResult.ai_synthesis.checklist.length > 0 && (
          <>
            <p style={{ fontSize: 12, fontWeight: 500, margin: "0 0 4px" }}>Checklist bằng chứng</p>
            <div style={{ marginBottom: 12 }}>
              {scanResult.ai_synthesis.checklist.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: item.passed ? "var(--aicv-success-text)" : "var(--aicv-warning-text)" }}>
                    {item.passed ? "✓" : "✕"}
                  </span>
                  <div>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{item.label}: </span>
                    <span style={{ fontSize: 12, color: "var(--aicv-text-secondary)" }}>{item.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ borderTop: "0.5px solid var(--aicv-border)", paddingTop: 12 }}>
          <p style={{ fontSize: 11, color: "var(--aicv-text-muted)", margin: "0 0 4px", fontWeight: 500 }}>
            ACTIONABLE INSIGHT
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0, fontWeight: 500 }}>
            {scanResult.actionable_insight}
          </p>
        </div>
      </div>

      {/* ============== RISK MANAGEMENT ============== */}
      <div className="aicv-card">
        <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 8px" }}>Quản lý rủi ro</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <p style={{ fontSize: 11, color: "var(--aicv-text-muted)", margin: 0 }}>Quy mô vị thế đề xuất</p>
            <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{scanResult.risk_management.suggested_position_size_pct}%</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "var(--aicv-text-muted)", margin: 0 }}>Chế độ thị trường</p>
            <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{scanResult.risk_management.regime}</p>
          </div>
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
