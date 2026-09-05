interface Props {
  trustScore: number;
}

export default function TrustScoreBadge({ trustScore }: Props) {
  let color = "var(--text-tertiary)";
  let bg = "rgba(100,116,139,0.1)";
  if (trustScore >= 70) { color = "var(--positive)"; bg = "rgba(52,211,153,0.12)"; }
  else if (trustScore >= 40) { color = "#fbbf24"; bg = "rgba(251,191,36,0.1)"; }
  else { color = "var(--negative)"; bg = "rgba(248,113,113,0.1)"; }

  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, padding: "1px 6px", borderRadius: 10,
      color, background: bg, whiteSpace: "nowrap",
    }} title="Diem tin cay - tinh tu do lap lai nguon tin va lich su chinh xac">
      Tin cay {trustScore}
    </span>
  );
}
