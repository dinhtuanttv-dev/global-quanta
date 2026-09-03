/**
 * ReportPanel - Hien thi day du Consensus + Macro + Quant + Risk + AI Synthesis
 */

import { useState } from "react";
import type { ReportPanelProps } from "../types";

const TF_ORDER = [
  { key: "daily" as const, label: "1d" },
  { key: "4h" as const, label: "4h" },
  { key: "1h" as const, label: "1h" },
  { key: "15m" as const, label: "15m" },
];



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
          Bao cao tong hop
        </p>
        <p style={{ fontSize: 12, color: "var(--aicv-text-muted)" }}>
          Chua co du lieu - hay chay quet o Bang dieu khien.
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
              Bao cao tong hop - {scanResult.target}
            </p>
            <p style={{ fontSize: 12, color: "var(--aicv-text-muted)", margin: 0 }}>
              Data: {completeness} | {new Date(scanResult.scan_timestamp).toLocaleString("vi-VN")}
            </p>
          </div>
          <button onClick={handleCopy} className="aicv-button" style={{ fontSize: 12, padding: "5px 10px" }}>
            Sao chep JSON
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

        <p style={{ fontSize: 13, color: "var(--aicv-text-secondary)", margin: "0 0 8px", fontWeight: 500 }}>
          Chi tiet theo khung
        </p>
              <p style={{ fontSize: 11, color: "var(--aicv-text-secondary)", margin: 0 }}>Invalidation</p>
              <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{v.invalidation_level}</p>
            </div>

        <p style={{ fontSize: 13, color: "var(--aicv-text-secondary)", margin: "0 0 8px", fontWeight: 500 }}>
          Chi tiet theo khung
        </p>
        <div>
          {TF_ORDER.map(({ key, label }, i) => {
            const row = scanResult.tactical_layer[key];
            if (!row) return null;
            return (
              <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < TF_ORDER.length - 1 ? "0.5px solid var(--aicv-border)" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, background: "var(--aicv-surface-1)", borderRadius: 6, padding: "2px 6px" }}>{label}</span>
                  <span style={{ fontSize: 13 }}>{row.trend}</span>
                </div>
                <span style={{ fontSize: 12, color: "var(--aicv-text-secondary)" }}>{row.signal}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ============== MACRO LAYER ============== */}
      <div className="aicv-card">
        <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px" }}>Macro Layer</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, color: "var(--aicv-text-muted)", margin: "0 0 4px", fontWeight: 500 }}>MONTHLY</p>
            <p style={{ fontSize: 13, margin: "0 0 4px" }}>
              <strong>Phase:</strong> {scanResult.macro_layer.monthly.market_cycle_phase}
            </p>
            <p style={{ fontSize: 12, color: "var(--aicv-text-secondary)", margin: "0 0 4px" }}>
              {scanResult.macro_layer.monthly.major_structure}
            </p>
            <p style={{ fontSize: 12, margin: 0 }}>
              S: {scanResult.macro_layer.monthly.key_monthly_level.support} | R: {scanResult.macro_layer.monthly.key_monthly_level.resistance}
            </p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "var(--aicv-text-muted)", margin: "0 0 4px", fontWeight: 500 }}>WEEKLY</p>
            <p style={{ fontSize: 13, margin: "0 0 4px" }}>
              <strong>Bias:</strong> {scanResult.macro_layer.weekly.structural_bias}
            </p>
            <p style={{ fontSize: 12, color: "var(--aicv-text-secondary)", margin: "0 0 4px" }}>
              {scanResult.macro_layer.weekly.weekly_momentum}
            </p>
            <p style={{ fontSize: 12, margin: 0 }}>
              POC: {scanResult.macro_layer.weekly.volume_profile_poc}
            </p>
          </div>

      {/* ============== QUANT + RISK ============== */}
      <div className="aicv-card">
        <p style={{ fontSize: 14, fontWeight: 500, margin: "0 0 12px" }}>Quant Layer & Risk Management</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <p style={{ fontSize: 11, color: "var(--aicv-text-muted)", margin: "0 0 4px", fontWeight: 500 }}>ORDER FLOW</p>
            <p style={{ fontSize: 13, margin: "0 0 8px" }}>{scanResult.quant_layer.order_flow_bias}</p>
            <p style={{ fontSize: 11, color: "var(--aicv-text-muted)", margin: "0 0 4px", fontWeight: 500 }}>CORRELATION</p>
            <p style={{ fontSize: 13, margin: 0 }}>{scanResult.quant_layer.correlation_flag}</p>
          </div>
          <div>
            <p style={{ fontSize: 11, color: "var(--aicv-text-muted)", margin: "0 0 4px", fontWeight: 500 }}>POSITION SIZE</p>
            <p style={{ fontSize: 15, fontWeight: 500, margin: "0 0 8px" }}>
              {scanResult.risk_management.suggested_position_size_pct}% tai khoan
            </p>
            <p style={{ fontSize: 11, color: "var(--aicv-text-muted)", margin: "0 0 4px", fontWeight: 500 }}>REGIME</p>
            <p style={{ fontSize: 13, margin: 0 }}>{scanResult.risk_management.regime}</p>
          </div>
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

        <p style={{ fontSize: 12, fontWeight: 500, margin: "0 0 4px" }}>Supporting Evidence</p>
        <ul style={{ fontSize: 12, margin: "0 0 12px", paddingLeft: 20 }}>
          {scanResult.ai_synthesis.supporting_evidence_fields.map((f, i) => (
            <li key={i} style={{ marginBottom: 2 }}>{f}</li>
          ))}
        </ul>

        {scanResult.ai_synthesis.conflicting_factors.length > 0 && (
          <>
            <p style={{ fontSize: 12, fontWeight: 500, margin: "0 0 4px", color: "var(--aicv-warning-text)" }}>
              Conflicting Factors
            </p>
            <ul style={{ fontSize: 12, margin: "0 0 12px", paddingLeft: 20 }}>
              {scanResult.ai_synthesis.conflicting_factors.map((f, i) => (
                <li key={i} style={{ marginBottom: 2 }}>{f}</li>
              ))}
            </ul>
          </>
        )}

        <p style={{ fontSize: 12, fontWeight: 500, margin: "0 0 4px" }}>Narrative</p>
        <p style={{ fontSize: 13, lineHeight: 1.6, margin: "0 0 12px" }}>
          {scanResult.ai_synthesis.ai_synthesis_narrative}
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
          Da sao chep JSON
        </p>
      )}
    </div>
  );
}