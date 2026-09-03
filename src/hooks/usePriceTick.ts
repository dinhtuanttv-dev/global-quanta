import { useEffect, useRef, useState } from 'react';
import { priceTickEngine } from '../services/priceTickEngine';
import { normalizeTicker } from '../utils/normalizeTicker';

type TickerOrBasePrice = string | null | number;
type UsePriceTickOptions = {
  ticker?: string;    // Khi có → dùng priceTickEngine
  active?: boolean;   // Mặc định true
};

/**
 * usePriceTick — subscription tới price tick engine hoặc fallback local.
 *
 * OVERLOAD SIGNATURES (backward compatible):
 *
 *   // Cách 1: Giữ nguyên signature cũ (4 callers: WatchlistRow + 3 TopBar/Insight)
 *   usePriceTick(basePrice: number, active?: boolean): number
 *
 *   // Cách 2: Khi có ticker → dùng priceTickEngine singleton
 *   usePriceTick(ticker: string, options?: UsePriceTickOptions): number
 *   // Hoặc
 *   usePriceTick(ticker: string, basePrice: number, active?: boolean): number
 *
 *   // Cách 3: ticker có thể là null (chưa chọn mã) → fallback local interval với basePrice
 *   usePriceTick(ticker: null, basePrice: number, active?: boolean): number
 */
export function usePriceTick(basePrice: number, active?: boolean): number;
export function usePriceTick(ticker: null, basePrice: number, active?: boolean): number;
export function usePriceTick(ticker: string, options?: UsePriceTickOptions): number;
export function usePriceTick(ticker: string, basePrice: number, active?: boolean): number;
export function usePriceTick(ticker: string | null, basePrice: number, active?: boolean): number;
export function usePriceTick(
  tickerOrBaseOrPrice: TickerOrBasePrice,
  baseOrActive?: TickerOrBasePrice | boolean | UsePriceTickOptions,
  active?: boolean,
): number {
  // ── XỬ LÝ OVERLOAD ──────────────────────────────────────────────────────
  let ticker: string | undefined;
  let basePrice: number = 0; // default, có thể được gán lại
  let isActive: boolean = true;

  if (typeof tickerOrBaseOrPrice === 'string') {
    // usePriceTick(ticker, options?) hoặc usePriceTick(ticker, basePrice, active?)
    ticker = tickerOrBaseOrPrice;
    if (typeof baseOrActive === 'boolean') {
      // usePriceTick(ticker, active) — giả định basePrice = ticker đầu tiên có giá
      isActive = baseOrActive;
      basePrice = 0; // sẽ được engine cung cấp giá thực
    } else if (baseOrActive && typeof baseOrActive === 'object') {
      // usePriceTick(ticker, { basePrice, active })
      const opts = baseOrActive as UsePriceTickOptions;
      basePrice = opts.ticker ? 0 : (opts as any).basePrice ?? 0;
      isActive = opts.active ?? true;
    } else if (typeof baseOrActive === 'number') {
      // usePriceTick(ticker, basePrice, active?)
      basePrice = baseOrActive;
      isActive = active ?? true;
    }
  } else if (tickerOrBaseOrPrice === null) {
    // usePriceTick(null, basePrice, active?) — ticker chưa sẵn sàng → fallback local
    ticker = undefined;
    if (typeof baseOrActive === 'number') {
      basePrice = baseOrActive;
      isActive = active ?? true;
    }
  } else {
    // usePriceTick(basePrice, active?) — signature cũ
    basePrice = tickerOrBaseOrPrice;
    if (typeof baseOrActive === 'boolean') {
      isActive = baseOrActive;
    }
  }

  // ── STATE ───────────────────────────────────────────────────────────────
  const [price, setPrice] = useState(basePrice);
  const baseRef = useRef(basePrice);

  // Effect #1: reset price khi basePrice đổi (stock reload trong Sidebar)
  useEffect(() => {
    baseRef.current = basePrice;
    if (basePrice !== null) {
      setPrice(basePrice);
    }
  }, [basePrice]);

  // Effect #2: subscribe/unsubscribe tới priceTickEngine hoặc fallback interval
  useEffect(() => {
    if (!isActive) return;

    if (ticker) {
      // ── DÙNG ENGINE (tối ưu cho nhiều mã) ────────────────────────
      const normalized = normalizeTicker(ticker);
      // Register TRƯỚC với basePrice để engine biết giá khởi điểm
      priceTickEngine.register(normalized, basePrice);
      const initialPrice = priceTickEngine.getPrice(normalized);
      if (initialPrice !== undefined) {
        setPrice(initialPrice);
      } else {
        baseRef.current = basePrice;
      }

      // Subscribe tới updates
      const unsubscribe = priceTickEngine.subscribe(normalized, (newPrice) => {
        setPrice(newPrice);
      });

      return () => {
        unsubscribe();
        priceTickEngine.unregister(normalized);
      };
    } else {
      // ── FALLBACK: interval local (trước khi migrate hết caller) ───
      const id = setInterval(() => {
        const jitter = (Math.random() - 0.5) * baseRef.current * 0.0006;
        setPrice((p) => Math.max(0, p + jitter));
      }, 2500);
      return () => clearInterval(id);
    }
  }, [isActive, ticker]);

  return price;
}
