import type { MoverItem } from "../../../types/catalyst";

function MoverRow({ item, positive }: { item: MoverItem; positive: boolean }) {
  const rankChange = item.prevRank - item.rank;

  return (
    <div style={{
      padding: "8px 6px", borderBottom: "1px solid rgba(148,163,184,0.08)",
    }}>
      {/* Dong 1: rank + ma CK + thay doi hang + diem so - can le 2 dau */}
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ flexShrink: 0, width: 16, fontSize: 10, color: "var(--text-tertiary)", fontWeight: 700 }}>
          #{item.rank}
        </span>
        <span style={{ flexShrink: 0, fontWeight: 700, fontSize: 12 }}>{item.ticker}</span>
        {rankChange !== 0 && (
          <span style={{ flexShrink: 0, fontSize: 9, color: rankChange > 0 ? "var(--positive)" : "var(--negative)" }}>
            {rankChange > 0 ? "▲" : "▼"}{Math.abs(rankChange)}
          </span>
        )}
        <span style={{
          marginLeft: "auto", flexShrink: 0, fontWeight: 700, fontSize: 12,
          color: positive ? "var(--positive)" : "var(--negative)",
        }}>{item.compositeScore}</span>
      </div>

      {/* Dong 2: tieu de tin - rieng 1 dong, du cho ellipsis hoat dong dung */}
      <p style={{
        margin: "3px 0 0", fontSize: 10, color: "var(--text-secondary)", lineHeight: 1.3,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {item.label}
      </p>
    </div>
  );
}

export default function MoversList({ upMovers, downMovers }: { upMovers: MoverItem[]; downMovers: MoverItem[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 8px", minWidth: 0 }}>
        <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--positive)", margin: "0 0 6px", paddingLeft: 4 }}>TANG HANG (tich cuc)</p>
        {upMovers.length === 0 && <p style={{ fontSize: 10, color: "var(--text-tertiary)", paddingLeft: 4 }}>Chua co du lieu</p>}
        {upMovers.map((m) => <MoverRow key={m.ticker + m.rank} item={m} positive />)}
      </div>
      <div style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: "10px 8px", minWidth: 0 }}>
        <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--negative)", margin: "0 0 6px", paddingLeft: 4 }}>GIAM HANG (tieu cuc)</p>
        {downMovers.length === 0 && <p style={{ fontSize: 10, color: "var(--text-tertiary)", paddingLeft: 4 }}>Chua co du lieu</p>}
        {downMovers.map((m) => <MoverRow key={m.ticker + m.rank} item={m} positive={false} />)}
      </div>
    </div>
  );
}
