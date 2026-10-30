import type { ScoreExplanation } from "../../../types/financialEngineering";

interface Props { explanation: ScoreExplanation; }

// A.7 (Phase 1) - giai thich ngon ngu tu nhien + breakdown trong so, rule-based.
export default function ScoreExplanationPanel({ explanation }: Props) {
  return (
    <div style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", borderRadius: 8, padding: 10 }}>
      <p style={{ fontSize: 11.5, color: "var(--text-primary)", margin: "0 0 10px", lineHeight: 1.5 }}>
        {explanation.narrativeVi}
      </p>
      {explanation.topContributors.map((c) => (
        <div key={c.factor} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 3 }}>
            <span style={{ color: "var(--text-secondary)" }}>{c.factor}</span>
            <span style={{ color: "var(--text-tertiary)" }}>{Math.round(c.weight * 100)}%</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: "var(--bg-surface-2)", overflow: "hidden", marginBottom: 4 }}>
            <div style={{
              width: `${c.weight * 100}%`, height: "100%",
              background: c.direction === "positive" ? "var(--positive)" : "var(--negative)",
            }} />
          </div>
          <p style={{ fontSize: 9.5, color: "var(--text-tertiary)", margin: 0 }}>{c.detail}</p>
        </div>
      ))}
    </div>
  );
}
