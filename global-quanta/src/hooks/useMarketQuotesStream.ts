import { useEffect, useMemo, useState } from 'react';
import {
  isMarketGatewayEnabled, subscribeMarket, type MarketQuote, type StreamStatus,
} from '../services/marketDataClient';

export interface LiveQuote {
  price: number;
  changePct: number | null;
  source: string;
  asOf: string | null;
}

/**
 * Giá realtime cho một danh sách mã qua Market Gateway (SSI là nguồn chính).
 * Gộp các tick và cập nhật state tối đa mỗi `flushMs` để bảng lớn (VD 174 mã)
 * không re-render theo từng tick. Khi chưa bật Gateway trả về rỗng.
 */
export function useMarketQuotesStream(symbols: string[], flushMs = 1000) {
  const key = useMemo(() => [...new Set(symbols.map((s) => s.toUpperCase()))].sort().join(','), [symbols]);
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [status, setStatus] = useState<StreamStatus | null>(null);

  useEffect(() => {
    if (!key || !isMarketGatewayEnabled()) return;
    let pending: Record<string, LiveQuote> = {};
    const flush = () => {
      if (!Object.keys(pending).length) return;
      const batch = pending;
      pending = {};
      setQuotes((prev) => ({ ...prev, ...batch }));
    };
    const timer = setInterval(flush, flushMs);
    const stop = subscribeMarket({
      symbols: key.split(','),
      onQuote: (q: MarketQuote) => {
        if (!q.price || q.price <= 0) return;
        pending[q.symbol] = { price: q.price, changePct: q.changePct, source: q.provenance?.source ?? '', asOf: q.provenance?.asOf ?? null };
      },
      onStatus: setStatus,
    });
    return () => {
      clearInterval(timer);
      stop();
    };
  }, [key, flushMs]);

  return { quotes, status, enabled: isMarketGatewayEnabled() };
}
