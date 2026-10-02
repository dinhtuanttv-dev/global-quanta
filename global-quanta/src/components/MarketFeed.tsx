import { useEffect, useMemo } from 'react';
import { useAppStore } from '../store/useAppStore';
import { subscribeSsiMarketQuotes } from '../services/api';
import { isMarketGatewayEnabled, subscribeMarket } from '../services/marketDataClient';
import { allWatchlistTickers, hasLegacyList, useWatchlists, watchlistActions } from '../hooks/useWatchlists';
import { alertActions, alertText, browserNotify, checkAlerts, usePriceAlerts } from '../lib/priceAlerts';

/**
 * Thành phần chạy ngầm ở cấp ứng dụng: giữ luồng giá thời gian thực cho các mã trong ★ Danh mục
 * (ELITE COMMAND RADAR, Action Center), mã đang chọn và mã có ⏰ cảnh báo giá; báo trạng thái nguồn giá cho đèn trên thanh trên.
 * Kiểm tra cảnh báo giá mỗi khi giá cập nhật: chạm -> đánh dấu đã kích hoạt, toast + thông báo trình duyệt.
 * Gộp tick, ghi vào store tối đa mỗi giây. Không hiển thị gì.
 */
export default function MarketFeed() {
  const setLivePrices = useAppStore((s) => s.setLivePrices);
  const setFeed = useAppStore((s) => s.setFeed);
  const selectedTicker = useAppStore((s) => s.selectedTicker);
  const { lists } = useWatchlists();
  const alerts = usePriceAlerts();
  const alertTickers = useMemo(() => [...new Set(alerts.filter((a) => !a.triggeredAt).map((a) => a.ticker))].sort().join(','), [alerts]);
  const symbolsKey = useMemo(
    () => [...new Set([...allWatchlistTickers(lists), ...(selectedTicker ? [selectedTicker] : []), ...(alertTickers ? alertTickers.split(',') : [])])]
      .sort().slice(0, 300).join(','),
    [lists, selectedTicker, alertTickers],
  );
  const livePrices = useAppStore((s) => s.livePrices);
  const showToast = useAppStore((s) => s.showToast);

  useEffect(() => {
    const hits = checkAlerts(alerts, livePrices);
    if (!hits.length) return;
    alertActions.markTriggered(hits.map((h) => ({ id: h.alert.id, price: h.price })));
    const text = hits.map((h) => alertText(h.alert, h.price)).join(' · ');
    showToast(`⏰ Cảnh báo giá: ${text}`);
    for (const h of hits) browserNotify(`⏰ ${h.alert.ticker} chạm mức cảnh báo`, alertText(h.alert, h.price), h.alert.id);
  }, [alerts, livePrices, showToast]);
  const gatewayMode = isMarketGatewayEnabled();

  // Đã bỏ "Danh sách mã (cũ)" (14 mã mẫu chuyển từ cột trái cũ): xoá khỏi trình duyệt khi mở trang.
  useEffect(() => { if (hasLegacyList(lists)) watchlistActions.removeLegacy(); }, [lists]);

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
