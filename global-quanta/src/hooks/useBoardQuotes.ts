import { useEffect, useMemo, useRef, useState } from "react";
import { fetchMarketJson, isMarketGatewayEnabled, subscribeMarket, type MarketQuote } from "../services/marketDataClient";

// Bảng giá trực tuyến: giữ NGUYÊN quote (3 bước giá mua/bán, trần/sàn/TC, cao/thấp, tổng KL) cho các mã
// đang hiển thị. Ảnh chụp ban đầu qua REST /api/market/quotes (≤ 200 mã/lần), sau đó cập nhật theo
// stream SSE của Gateway; gộp tick và vẽ lại tối đa mỗi `flushMs`. Ghi nhận hướng thay đổi giá để nháy ô.

export type FlashDir = "up" | "down";
export interface BoardState {
  quotes: Record<string, MarketQuote>;
  /** Mã -> hướng thay đổi giá khớp gần nhất + thời điểm (ms) để nháy ô trong ~1 giây. */
  flash: Record<string, { dir: FlashDir; at: number }>;
}

const SNAPSHOT_BATCH = 150;

export function useBoardQuotes(symbols: string[], { flushMs = 500, enabled = true } = {}) {
  const key = useMemo(() => [...new Set(symbols.map((s) => s.toUpperCase()))].sort().join(","), [symbols]);
  const [state, setState] = useState<BoardState>({ quotes: {}, flash: {} });
  const known = useRef(new Set<string>());
  const [now, setNow] = useState(() => Date.now());

  // Ảnh chụp REST cho mã chưa có dữ liệu.
  useEffect(() => {
    if (!enabled || !key || !isMarketGatewayEnabled()) return;
    const need = key.split(",").filter((s) => !known.current.has(s));
    if (!need.length) return;
    let cancelled = false;
    (async () => {
      for (let i = 0; i < need.length; i += SNAPSHOT_BATCH) {
        const batch = need.slice(i, i + SNAPSHOT_BATCH);
        try {
          const res = await fetchMarketJson<{ quotes: Record<string, MarketQuote> }>("/api/market/quotes", { symbols: batch.join(",") });
          if (cancelled) return;
          for (const s of batch) known.current.add(s);
          setState((prev) => {
            const quotes = { ...prev.quotes };
            // Không ghi đè quote stream mới hơn bằng ảnh chụp.
            for (const [s, q] of Object.entries(res.quotes ?? {})) if (!quotes[s]) quotes[s] = q;
            return { ...prev, quotes };
          });
        } catch { /* bỏ qua: stream vẫn cập nhật */ }
      }
    })();
    return () => { cancelled = true; };
  }, [key, enabled]);

  // Stream SSE: gộp tick, vẽ lại theo nhịp.
  useEffect(() => {
    if (!enabled || !key || !isMarketGatewayEnabled()) return;
    let pending: Record<string, MarketQuote> = {};
    const timer = setInterval(() => {
      setNow(Date.now());
      if (!Object.keys(pending).length) return;
      const batch = pending;
      pending = {};
      setState((prev) => {
        const quotes = { ...prev.quotes };
        const flash = { ...prev.flash };
        const at = Date.now();
        for (const [s, q] of Object.entries(batch)) {
          const old = quotes[s];
          if (old?.price && q.price && q.price !== old.price) flash[s] = { dir: q.price > old.price ? "up" : "down", at };
          quotes[s] = old ? mergeQuote(old, q) : q;
          known.current.add(s);
        }
        return { quotes, flash };
      });
    }, flushMs);
    const stop = subscribeMarket({
      symbols: key.split(","),
      onQuote: (q: MarketQuote) => { pending[q.symbol] = pending[q.symbol] ? mergeQuote(pending[q.symbol], q) : q; },
    });
    return () => { clearInterval(timer); stop(); };
  }, [key, enabled, flushMs]);

  return { ...state, now, enabled: isMarketGatewayEnabled() };
}

/** Bản tin stream có thể thiếu trường (VD chỉ đổi bước giá) -> giữ giá trị cũ cho trường rỗng. */
export function mergeQuote(prev: MarketQuote, next: MarketQuote): MarketQuote {
  const out = { ...prev } as Record<string, unknown>;
  for (const [k, v] of Object.entries(next)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as unknown as MarketQuote;
}
