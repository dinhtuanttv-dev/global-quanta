import { useState } from "react";
import { useAppStore } from "../../../store/useAppStore";

interface Props { ticker: string; onChange: (ticker: string) => void; }

export default function TickerSelector({ ticker, onChange }: Props) {
  const watchlist = useAppStore((s) => s.watchlist);
  const [query, setQuery] = useState("");

  const matches = query
    ? watchlist.filter((s) => s.ticker.toLowerCase().includes(query.toLowerCase())).slice(0, 6)
    : [];

  return (
    <div className="ta-ticker-selector">
      <span className="ta-ticker-current">{ticker}</span>
      <input
        className="ta-ticker-input"
        placeholder="Doi ma khac..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {matches.length > 0 && (
        <div className="ta-ticker-suggest">
          {matches.map((s) => (
            <div key={s.ticker} className="ta-ticker-suggest-item"
              onClick={() => { onChange(s.ticker); setQuery(""); }}>
              {s.ticker} <span className="ta-ticker-suggest-sector">{s.sector}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
