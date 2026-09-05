import type { MoverItem } from "../../../types/catalyst";

function MoverRow({ item, positive }: { item: MoverItem; positive: boolean }) {
  const rankChange = item.prevRank - item.rank;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", fontSize: 11 }}>
      <span style={{ width: 16, color: "var(--text-tertiary)", fontWeight: 700 }}>#{item.rank}</span>
      <span style={{ fontWeight: 700, width: 44 }}>{item.ticker}</span>
      <span style={{ flex: 1, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {item.label}
      </span>
      {rankChange !== 0 && (
        <span style={{ fontSize: 9.5, color: rankChange > 0 ? "var(--positive)" : "var(--negative)" }}>
          {rankChange > 0 ? "▲" : "▼"}{Math.abs(rankChange)}
        </span>
      )}
      <span style={{ fontWeight: 700, color: positive ? "var(--positive)" : "var(--negative)" }}>{item.compositeScore}</span>
    </div>
  );
}

export default function MoversList({ upMovers, downMovers }: { upMovers: MoverItem[]; downMovers: MoverItem[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <div style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
        <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--positive)", margin: "0 0 4px" }}>TANG HANG (tich cuc)</p>
        {upMovers.length === 0 && <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Chua co du lieu</p>}
        {upMovers.map((m) => <MoverRow key={m.ticker + m.rank} item={m} positive />)}
      </div>
      <div style={{ background: "var(--bg-surface-2)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }}>
        <p style={{ fontSize: 10.5, fontWeight: 700, color: "var(--negative)", margin: "0 0 4px" }}>GIAM HANG (tieu cuc)</p>
        {downMovers.length === 0 && <p style={{ fontSize: 10, color: "var(--text-tertiary)" }}>Chua co du lieu</p>}
        {downMovers.map((m) => <MoverRow key={m.ticker + m.rank} item={m} positive={false} />)}
      </div>
    </div>
  );
}
