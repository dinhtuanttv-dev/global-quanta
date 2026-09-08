import type { EmergingSourceSummary } from "../../../types/catalyst";

export default function EmergingSourceRow({ source }: { source: EmergingSourceSummary }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "8px 10px", background: "var(--bg-surface)", borderRadius: 8, marginBottom: 6,
      borderLeft: "2px solid var(--gold-bright)",
    }}>
      <div>
        <span style={{ fontSize: 12, fontWeight: 600 }}>{source.title}</span>
        <div style={{ fontSize: 9.5, color: "var(--text-tertiary)", marginTop: 2 }}>
          {source.category} · Xac nhan cheo: {source.corroborationCount} nguon
        </div>
      </div>
      <span style={{ fontSize: 10, color: "var(--text-secondary)" }}>
        Anh huong {source.affectedTargetCount} ma
      </span>
    </div>
  );
}
