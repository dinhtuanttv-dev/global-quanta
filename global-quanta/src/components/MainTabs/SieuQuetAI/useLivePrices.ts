/**
 * useLivePrices.ts
 * Custom hook rieng cho Live Prices - KHONG lien quan den logic khac
 * Tu dong refresh moi 60 giay
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchLivePrices, type LivePriceResponse } from './livePriceApi';

interface UseLivePricesOptions {
  /** Refresh interval in milliseconds (default: 60000 = 1 minute) */
  refreshInterval?: number;
  /** Enable auto-refresh (default: true) */
  autoRefresh?: boolean;
}

interface UseLivePricesResult {
  /** Live price data keyed by ticker */
  prices: LivePriceResponse;
  /** Loading state */
  loading: boolean;
  /** Error state */
  error: Error | null;
  /** Last update timestamp */
  lastUpdated: Date | null;
  /** Manual refresh function */
  refresh: () => Promise<void>;
  /** Whether data is stale (older than refreshInterval * 2) */
  isStale: boolean;
}

/**
 * Hook de fetch va cache live prices
 * Tach biet hoan toan voi cac logic khac trong app
 */
export function useLivePrices(
  tickers: string[],
  options: UseLivePricesOptions = {}
): UseLivePricesResult {
  const {
    refreshInterval = 60000, // 1 minute default
    autoRefresh = true,
  } = options;

  const [prices, setPrices] = useState<LivePriceResponse>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  const fetchPrices = useCallback(async () => {
    if (tickers.length === 0) {
      setPrices({});
      setLoading(false);
      return;
    }

    try {
      const result = await fetchLivePrices(tickers);
      if (isMountedRef.current) {
        setPrices(result);
        setLastUpdated(new Date());
        setError(null);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, [tickers.join(',')]); // Re-run when tickers change

  // Initial fetch
  useEffect(() => {
    isMountedRef.current = true;
    fetchPrices();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchPrices]);

  // Auto refresh
  useEffect(() => {
    if (autoRefresh && tickers.length > 0) {
      intervalRef.current = setInterval(fetchPrices, refreshInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchPrices, autoRefresh, refreshInterval, tickers.length]);

  const isStale = lastUpdated
    ? Date.now() - lastUpdated.getTime() > refreshInterval * 2
    : true;

  return {
    prices,
    loading,
    error,
    lastUpdated,
    refresh: fetchPrices,
    isStale,
  };
}

