import type { TopBeneficiaryRow } from "../../../hooks/useTopBeneficiaries";

export default function TopBeneficiariesPanel({ rows }: { rows: TopBeneficiaryRow[] }) {
  if (rows.length === 0) return null;

  const maxScore = Math.max(...rows.map((r) => r.compositeScore), 1);

  return (
    <div style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", marginTop: 16 }}>
      <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
        <p style={{ fontSize: 12, fontWeight: 700, margin: 0 }}>TOP CO PHIEU HUONG LOI NHIEU NHAT</p>
        <p style={{ fontSize: 9.5, color: "var(--text-tertiary)", margin: "2px 0 0" }}>
          Tong hop diem tu tat ca tin tuc dang tac dong tich cuc len tung ma
        </p>
      </div>
      {rows.map((r) => (
        <div key={r.ticker} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
          borderBottom: "1px solid rgba(148,163,184,0.08)",
        }}>
          <span style={{
            width: 18, fontSize: 11, fontWeight: 700, textAlign: "center",
            color: r.rank <= 3 ? "var(--gold-bright)" : "var(--text-tertiary)",
          }}>{r.rank}</span>
          <span style={{ width: 48, fontSize: 12.5, fontWeight: 700 }}>{r.ticker}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontSize: 10.5, color: "var(--text-secondary)", margin: 0,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{r.topDriver}</p>
            <p style={{ fontSize: 9, color: "var(--text-tertiary)", margin: "2px 0 0" }}>
              {r.catalystCount} tin tac dong
            </p>
          </div>
          <div style={{ width: 70, textAlign: "right", flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--positive)" }}>{r.compositeScore}</span>
            <div style={{ width: 70, height: 3, borderRadius: 2, background: "var(--bg-surface)", marginTop: 4, overflow: "hidden" }}>
              <div style={{
                width: `${(r.compositeScore / maxScore) * 100}%`, height: "100%",
                background: "linear-gradient(90deg, #16a34a, #22c55e)", borderRadius: 2,
              }} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
