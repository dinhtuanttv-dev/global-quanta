import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { fetchLivePrices } from './MainTabs/SieuQuetAI/livePriceApi';
import { subscribeSsiMarketQuotes } from '../services/api';
import { isMarketGatewayEnabled, subscribeMarket } from '../services/marketDataClient';
import { allWatchlistTickers, migrateLegacyWatchlist, useWatchlists } from '../hooks/useWatchlists';

/**
 * Thành phần chạy ngầm ở cấp ứng dụng (thay phần việc nền của cột "Danh sách mã" cũ):
 *   - nạp danh sách mã cũ một lần và chuyển sang ★ Danh mục (giữ ghi chú, ghim);
 *   - giữ luồng giá thời gian thực cho Radar / Action Center (và danh sách cũ);
 *   - báo trạng thái nguồn giá cho đèn trên thanh trên.
 * Không hiển thị gì.
 */
export default function MarketFeed() {
  const watchlist = useAppStore((s) => s.watchlist);
  const loadWatchlist = useAppStore((s) => s.loadWatchlist);
  const updateLivePrices = useAppStore((s) => s.updateLivePrices);
  const updateRadarPrices = useAppStore((s) => s.updateRadarPrices);
  const setFeed = useAppStore((s) => s.setFeed);
  const setLivePrices = useAppStore((s) => s.setLivePrices);
  const { lists } = useWatchlists();
  const listSymbols = useMemo(() => allWatchlistTickers(lists).sort().join(','), [lists]);
  const radarCore = useAppStore((s) => s.radarCore);
  const radarRing = useAppStore((s) => s.radarRing);
  const legacyConnected = useAppStore((s) => s.feed.legacySsiConnected);
  const gatewayMode = isMarketGatewayEnabled();

  const loaded = useRef(false);
  useEffect(() => {
    void loadWatchlist().then(() => { loaded.current = true; });
  }, [loadWatchlist]);

  // Chuyển danh sách cũ sang ★ Danh mục (chỉ một lần cho mỗi trình duyệt).
  useEffect(() => {
    if (loaded.current && watchlist.length) migrateLegacyWatchlist(watchlist);
  }, [watchlist]);

  const watchlistRef = useRef(watchlist);
  useEffect(() => { watchlistRef.current = watchlist; }, [watchlist]);

  const watchlistSymbols = useMemo(() => watchlist.map((s) => s.ticker).join(','), [watchlist]);
  const radarSymbols = useMemo(
    () => [...new Set([...radarCore, ...radarRing].map((n) => n.ticker))].sort().join(','),
    [radarCore, radarRing],
  );

  // Không có Gateway: poll giá dự phòng khi SSI FastConnect chưa kết nối (như cột cũ).
  const pollLivePrices = useCallback(async () => {
    if (legacyConnected) return;
    const tickers = watchlistRef.current.map((s) => s.ticker);
    if (!tickers.length) return;
    try {
      const prices = await fetchLivePrices(tickers);
      const priceMap: Record<string, { price: number; changePct: number | null }> = {};
      for (const [ticker, info] of Object.entries(prices)) if (info.price !== null) priceMap[ticker] = { price: info.price, changePct: info.changePct };
      updateLivePrices(priceMap);
    } catch (err) {
      console.warn('[MarketFeed] Không lấy được giá dự phòng:', err);
    }
  }, [legacyConnected, updateLivePrices]);

  useEffect(() => {
    if (gatewayMode || !watchlist.length) return;
    void pollLivePrices();
    const interval = setInterval(pollLivePrices, 60_000);
    return () => clearInterval(interval);
  }, [gatewayMode, watchlist.length, pollLivePrices]);

  useEffect(() => {
    const symbols = [...new Set([...watchlistSymbols.split(','), ...radarSymbols.split(','), ...listSymbols.split(',')].filter(Boolean))].slice(0, 300);
    if (!symbols.length) return;
    // Gộp tick, ghi vào store tối đa mỗi giây (tránh vẽ lại Radar / danh sách theo từng tick).
    let pending: Record<string, { price: number; changePct: number | null }> = {};
    const timer = setInterval(() => {
      if (!Object.keys(pending).length) return;
      const batch = pending;
      pending = {};
      updateLivePrices(batch);
      updateRadarPrices(batch);
      setLivePrices(batch);
    }, 1000);
    let stop: () => void;
    if (gatewayMode) {
      stop = subscribeMarket({
        symbols,
        onQuote: (quote) => {
          if (!quote.price || quote.price <= 0) return;
          pending[quote.symbol] = { price: quote.price, changePct: quote.changePct };
        },
        onStatus: (status) => setFeed({ gatewayStatus: status, connectionLost: false }),
        onError: () => setFeed({ connectionLost: true }),
      });
    } else {
      stop = subscribeSsiMarketQuotes(
        symbols,
        (rawQuote) => {
          const content = (rawQuote as { Content?: { Symbol?: string; LastPrice?: number; EstMatchedPrice?: number; RatioChange?: number } })?.Content;
          const ticker = content?.Symbol?.toUpperCase();
          const price = Number(content?.LastPrice || content?.EstMatchedPrice || 0);
          if (!ticker || !Number.isFinite(price) || price <= 0) return;
          pending[ticker] = { price, changePct: Number.isFinite(content?.RatioChange) ? content!.RatioChange! : null };
        },
        (connected: boolean) => setFeed({ legacySsiConnected: connected }),
      );
    }
    return () => {
      clearInterval(timer);
      setFeed(gatewayMode ? { gatewayStatus: null } : { legacySsiConnected: false });
      stop();
    };
  }, [gatewayMode, watchlistSymbols, radarSymbols, listSymbols, updateLivePrices, updateRadarPrices, setLivePrices, setFeed]);

  return null;
}
