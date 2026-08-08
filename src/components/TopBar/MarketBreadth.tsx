interface Props {
  advancers: number;
  decliners: number;
}

export default function MarketBreadth({ advancers, decliners }: Props) {
  const total = advancers + decliners || 1;
  const advPct = (advancers / total) * 100;

  return (
    <div className="breadth">
      <span className="breadth-label">Độ rộng</span>
      <div className="breadth-bar">
        <span style={{ width: `${advPct}%` }} />
        <span style={{ width: `${100 - advPct}%` }} />
      </div>
      <span className="breadth-label num">{advancers}▲ / {decliners}▼</span>
    </div>
  );
}
