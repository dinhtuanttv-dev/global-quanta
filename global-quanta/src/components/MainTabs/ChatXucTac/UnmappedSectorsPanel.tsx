import { useUnmappedSectors } from "../../../hooks/useUnmappedSectors";

export default function UnmappedSectorsPanel() {
  const { items, totalUnique, isLoading } = useUnmappedSectors();
  if (isLoading || totalUnique === 0) return null;

  return (
    <div style={{
      background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.25)",
      borderRadius: 8, padding: "8px 10px", marginTop: 16, fontSize: 10.5,
    }}>
      <p style={{ fontWeight: 700, color: "#fbbf24", margin: "0 0 4px" }}>
        ⚠ {totalUnique} nganh chua duoc anh xa (can admin ra soat)
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {items.slice(0, 15).map((it) => (
          <span key={it.rawKey} style={{
            background: "rgba(251,191,36,0.1)", padding: "1px 6px", borderRadius: 4, color: "var(--text-secondary)",
          }}>
            {it.rawKey} ({it.count})
          </span>
        ))}
      </div>
    </div>
  );
}
