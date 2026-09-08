import TrustScoreBadge from "./TrustScoreBadge";
import type { CatalystCard as CatalystCardType } from "../../../types/catalyst";

const HORIZON_LABEL: Record<string, string> = { short: "Ngan han", medium: "Trung han", long: "Dai han" };
const PRICE_IN_LABEL: Record<string, string> = {
  not_reflected: "Chua phan anh vao gia", partially_reflected: "Da phan anh 1 phan", reflected: "Da phan anh du",
};

// Nguong 55% lay theo TAI-LIEU-NANG-CAP-CHAT-XUC-TAC.md - duoi nguong nay
// ty le thang gan bang tung dong xu (50%), can canh bao ro rang thay vi
// chim trong text phu.
function winRateColor(winRate: number): { bg: string; text: string } {
  if (winRate < 55) return { bg: "rgba(251,191,36,0.15)", text: "#fbbf24" };
  return { bg: "rgba(148,163,184,0.12)", text: "var(--text-secondary)" };
}

export default function CatalystCardRow({ card }: { card: CatalystCardType }) {
  const isBenefit = card.direction === "benefit";
  const wr = winRateColor(card.historicalWinRate);

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
      <div style={{ display: "flex", gap: 8, fontSize: 9.5, color: "var(--text-tertiary)", flexWrap: "wrap", alignItems: "center" }}>
        <span>{HORIZON_LABEL[card.horizon] ?? card.horizon}</span>
        <span>{PRICE_IN_LABEL[card.priceInStatus] ?? card.priceInStatus}</span>
        <span>Xac nhan cheo: {card.corroborationCount} nguon</span>
        <span style={{
          background: wr.bg, color: wr.text, fontWeight: 700, padding: "1px 6px", borderRadius: 8,
        }}>
          Ty le thang: {card.historicalWinRate}%
        </span>
      </div>
    </div>
  );
}
