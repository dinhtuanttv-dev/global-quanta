import type { CatalystCard } from "../../../types/catalyst";

interface CascadeGroup {
  sourceId: string;
  sourceTitle: string;
  direction: "benefit" | "harm" | "none";
  tickers: string[];
}

function groupBySource(cards: CatalystCard[]): CascadeGroup[] {
  const map = new Map<string, CascadeGroup>();
  cards.forEach((c) => {
    const existing = map.get(c.sourceId);
    if (existing) { existing.tickers.push(c.ticker); return; }
    map.set(c.sourceId, { sourceId: c.sourceId, sourceTitle: c.sourceTitle, direction: c.direction, tickers: [c.ticker] });
  });
  return Array.from(map.values());
}

// Gop cac tin LAN TOA co CHUNG 1 nguon thanh 1 dong gon, thay vi lap lai
// nguyen van tieu de cho tung ma (VD 1 tin thep anh huong ca HPG va VGC ->
// hien 1 dong "lan toa toi: VGC" duoi tin goc cua HPG, khong tao the rieng).
export default function CascadeGroupList({ cards }: { cards: CatalystCard[] }) {
  if (cards.length === 0) return null;
  const groups = groupBySource(cards);

  return (
    <div style={{ marginTop: 4 }}>
      <p style={{ fontSize: 9.5, color: "var(--text-tertiary)", margin: "6px 0 4px" }}>Tac dong lan toa (gian tiep)</p>
      {groups.map((g) => (
        <div key={g.sourceId} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "5px 8px",
          background: "var(--bg-surface)", borderRadius: 6, marginBottom: 4, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 10, color: "var(--text-secondary)", flex: 1, minWidth: 120 }}>{g.sourceTitle}</span>
          <span style={{ fontSize: 9, color: "var(--text-tertiary)" }}>→</span>
          {g.tickers.map((t) => (
            <span key={t} style={{
              fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
              background: g.direction === "benefit" ? "rgba(52,211,153,0.12)" : "rgba(248,113,113,0.12)",
              color: g.direction === "benefit" ? "var(--positive)" : "var(--negative)",
            }}>{t}</span>
          ))}
        </div>
      ))}
    </div>
  );
}
