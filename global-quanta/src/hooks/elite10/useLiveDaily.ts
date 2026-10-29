import { useEffect, useRef, useState } from "react";
import { isMarketGatewayEnabled, subscribeMarket, type IndexSnapshot, type MarketQuote, type StreamStatus } from "../../services/marketDataClient";

/**
 * N3 — luồng giá trực tiếp cho NẾN NGÀY hôm nay của mã đang xem + VN-Index (một EventSource riêng, chỉ khi `enabled`).
 * Gộp bản tin theo nhịp 1 giây (khớp lệnh dồn dập không làm vẽ lại liên tục).
 */
export function useLiveDaily(ticker: string | null, enabled: boolean) {
  const [state, setState] = useState<{ quote: MarketQuote | null; index: IndexSnapshot | null; status: StreamStatus | null }>({ quote: null, index: null, status: null });
  const pending = useRef<{ quote?: MarketQuote; index?: IndexSnapshot; status?: StreamStatus }>({});
  useEffect(() => {
    setState({ quote: null, index: null, status: null });
    if (!enabled || !ticker || !/^[A-Z][A-Z0-9]{2}$/.test(ticker) || !isMarketGatewayEnabled() || typeof EventSource === "undefined") return;
    const stop = subscribeMarket({
      symbols: [ticker], indices: ["VNINDEX"],
      onQuote: (q) => { if (q.symbol === ticker) pending.current.quote = q; },
      onIndex: (s) => { if (s.code === "VNINDEX") pending.current.index = s; },
      onStatus: (s) => { pending.current.status = s; },
    });
    const timer = window.setInterval(() => {
      const p = pending.current;
      if (!p.quote && !p.index && !p.status) return;
      pending.current = {};
      setState((s) => ({ quote: p.quote ?? s.quote, index: p.index ?? s.index, status: p.status ?? s.status }));
    }, 1000);
    return () => { stop(); window.clearInterval(timer); };
  }, [ticker, enabled]);
  const live = state.status ? !["CLOSED", "BREAK"].includes(String(state.status.session)) : false;
  return { ...state, sessionLive: live };
}
