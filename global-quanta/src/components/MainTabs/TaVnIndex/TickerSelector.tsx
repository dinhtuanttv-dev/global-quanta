import { useState } from "react";
import { useSieuQuetScanner } from "../../../hooks/useSieuQuetScanner";

interface Props { ticker: string; onChange: (ticker: string) => void; }

export const DEFAULT_TA_SYMBOL = "VNINDEX";
/** Chỉ số luôn chọn được (không nằm trong danh sách cổ phiếu của Siêu Quét). */
export const TA_INDICES = [
  { symbol: "VNINDEX", label: "VN-Index" },
  { symbol: "VN30", label: "VN30" },
  { symbol: "HNXINDEX", label: "HNX" },
] as const;
const SYMBOL_RE = /^[A-Z][A-Z0-9]{2,9}$/;

export default function TickerSelector({ ticker, onChange }: Props) {
  const { items } = useSieuQuetScanner();
  const watchlist = items.map((i) => ({ ticker: i.ticker, sector: i.industry ?? i.sector ?? "" }));
  const [query, setQuery] = useState("");
  const q = query.trim().toUpperCase();

  const matches = q
    ? [
        ...TA_INDICES.filter((x) => x.symbol.includes(q) || x.label.toUpperCase().includes(q)).map((x) => ({ ticker: x.symbol, sector: "Chỉ số" })),
        ...watchlist.filter((s) => s.ticker.includes(q)),
      ].slice(0, 6)
    : [];

  const pick = (symbol: string) => { onChange(symbol); setQuery(""); };

  return (
    <div className="ta-ticker-selector" data-testid="ta-ticker-selector">
      <span className="ta-ticker-current">{ticker}</span>
      <input
        className="ta-ticker-input"
        placeholder="Đổi mã… (Enter)"
        aria-label="Đổi mã hoặc chỉ số"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          const exact = matches.find((m) => m.ticker === q);
          if (exact || SYMBOL_RE.test(q)) pick(exact?.ticker ?? q);
          else if (matches[0]) pick(matches[0].ticker);
        }}
      />
      <div className="flex items-center gap-1 ml-2" role="group" aria-label="Chỉ số">
        {TA_INDICES.map((x) => (
          <button key={x.symbol} type="button" onClick={() => pick(x.symbol)} aria-pressed={ticker === x.symbol}
            className={`px-2 py-1 rounded text-[10px] font-semibold font-mono border transition ${ticker === x.symbol ? "border-cyan-400/50 bg-cyan-500/15 text-cyan-200" : "border-white/10 text-slate-400 hover:text-slate-200"}`}>
            {x.label}
          </button>
        ))}
      </div>
      {matches.length > 0 && (
        <div className="ta-ticker-suggest">
          {matches.map((s) => (
            <div key={s.ticker} className="ta-ticker-suggest-item" onClick={() => pick(s.ticker)}>
              {s.ticker} <span className="ta-ticker-suggest-sector">{s.sector}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
