import TrustScoreBadge from "./TrustScoreBadge";
import type { CatalystCard as CatalystCardType } from "../../../types/catalyst";

const HORIZON_LABEL: Record<string, string> = { short: "Ngan han", medium: "Trung han", long: "Dai han" };
const PRICE_IN_LABEL: Record<string, string> = {
  not_reflected: "Chua phan anh vao gia", partially_reflected: "Da phan anh 1 phan", reflected: "Da phan anh du",
};

export default function CatalystCardRow({ card }: { card: CatalystCardType }) {
  const isBenefit = card.direction === "benefit";
  return (
    <div style={{
      display: "flex", flexDirection: "column", gap: 3, padding: "8px 10px",
      borderLeft: `2px solid ${isBenefit ? "var(--positive)" : "var(--negative)"}`,
      background: "var(--bg-surface)", borderRadius: 6, marginBottom: 6,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700, fontSize: 12.5 }}>{card.ticker}</span>
        <span style={{ fontSize: 10, color: isBenefit ? "var(--positive)" : "var(--negative)", fontWeight: 600 }}>
          {isBenefit ? "Tich cuc" : "Tieu cuc"}
        </span>
        <TrustScoreBadge trustScore={card.trustScore} />
        {card.isConflicted && (
          <span style={{ fontSize: 9, color: "#fbbf24", fontWeight: 700 }}>⚠ Mau thuan tin hieu</span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 700 }}>{card.compositeScore}</span>
      </div>
      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: 0 }}>{card.sourceTitle}</p>
      <div style={{ display: "flex", gap: 10, fontSize: 9.5, color: "var(--text-tertiary)", flexWrap: "wrap" }}>
        <span>{HORIZON_LABEL[card.horizon] ?? card.horizon}</span>
        <span>{PRICE_IN_LABEL[card.priceInStatus] ?? card.priceInStatus}</span>
        <span>Xac nhan cheo: {card.corroborationCount} nguon</span>
        <span>Ty le thang lich su: {card.historicalWinRate}%</span>
      </div>
    </div>
  );
}
