import { useEffect, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { subscribeSsiMarketQuotes } from '../services/api';
import { isMarketGatewayEnabled, subscribeMarket } from '../services/marketDataClient';
import { allWatchlistTickers, useWatchlists } from '../hooks/useWatchlists';

/**
 * Thành phần chạy ngầm ở cấp ứng dụng: giữ luồng giá thời gian thực cho các mã trong ★ Danh mục
 * (ELITE COMMAND RADAR, Action Center) và mã đang chọn; báo trạng thái nguồn giá cho đèn trên thanh trên.
 * Gộp tick, ghi vào store tối đa mỗi giây. Không hiển thị gì.
 */
export default function MarketFeed() {
  const setLivePrices = useAppStore((s) => s.setLivePrices);
  const setFeed = useAppStore((s) => s.setFeed);
  const selectedTicker = useAppStore((s) => s.selectedTicker);
  const { lists } = useWatchlists();
  const symbolsKey = useMemo(
    () => [...new Set([...allWatchlistTickers(lists), ...(selectedTicker ? [selectedTicker] : [])])].sort().slice(0, 300).join(','),
    [lists, selectedTicker],
  );
  const gatewayMode = isMarketGatewayEnabled();

  useEffect(() => {
    if (!symbolsKey) return;
    const symbols = symbolsKey.split(',');
    let pending: Record<string, { price: number; changePct: number | null }> = {};
    const timer = setInterval(() => {
      if (!Object.keys(pending).length) return;
      const batch = pending;
      pending = {};
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
  }, [gatewayMode, symbolsKey, setLivePrices, setFeed]);

  return null;
}
