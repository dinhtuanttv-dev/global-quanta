import { useEffect, useRef, useState } from "react";
import { isMarketGatewayEnabled, subscribeMarket, type IndexSnapshot, type MarketQuote, type StreamStatus } from "../../services/marketDataClient";

/** Giá khớp trực tiếp (SSI) cho nhiều mã + VN-Index, gộp nhịp 1 giây; chỉ mở kết nối khi `enabled`. */
export function useLiveQuotes(tickers: string[], enabled: boolean) {
  const key = [...new Set(tickers.filter((t) => /^[A-Z][A-Z0-9]{2}$/.test(t)))].sort().join(",");
  const [state, setState] = useState<{ quotes: Record<string, MarketQuote>; index: IndexSnapshot | null; status: StreamStatus | null }>({ quotes: {}, index: null, status: null });
  const pending = useRef<{ quotes: Record<string, MarketQuote>; index?: IndexSnapshot; status?: StreamStatus }>({ quotes: {} });
  useEffect(() => {
    if (!enabled || !key || !isMarketGatewayEnabled() || typeof EventSource === "undefined") return;
    const syms = key.split(",");
    const stop = subscribeMarket({
      symbols: syms, indices: ["VNINDEX"],
      onQuote: (q) => { if (syms.includes(q.symbol)) pending.current.quotes[q.symbol] = q; },
      onIndex: (s) => { if (s.code === "VNINDEX") pending.current.index = s; },
      onStatus: (s) => { pending.current.status = s; },
    });
    const timer = window.setInterval(() => {
      const p = pending.current;
      if (!Object.keys(p.quotes).length && !p.index && !p.status) return;
      pending.current = { quotes: {} };
      setState((s) => ({ quotes: { ...s.quotes, ...p.quotes }, index: p.index ?? s.index, status: p.status ?? s.status }));
    }, 1000);
    return () => { stop(); window.clearInterval(timer); };
  }, [key, enabled]);
  const sessionLive = state.status ? !["CLOSED", "BREAK"].includes(String(state.status.session)) : false;
  return { ...state, sessionLive };
}
