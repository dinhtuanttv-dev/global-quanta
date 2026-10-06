import { useState } from 'react';
import { useTaVnIndex } from '../../hooks/ta-vn-index/useTaVnIndex';
import { TaVnIndexPanel } from './TaVnIndexPanel';
import { useAppStore } from '../../store/useAppStore';
import type { Timeframe } from '../../types/taVnIndex';

const DEFAULT_TIMEFRAME: Timeframe = 'D';
const DEFAULT_OVERLAYS: Record<string, boolean> = {
  trendline: true,
  demandZone: true,
  smc: true,
  vsa: false,
  wyckoff: false,
  elliott: false,
  sma200: true,
  ema: true,
  bollinger: false,
  // TẤT CẢ NÚT MỚI MẶC ĐỊNH TẮT (false) - CHỈ HIỂN THỊ KHU NGƯỜI DÙNG BẤM
  vwap: false,
  supertrend: false,
  fibonacci: false,
  volumeProfile: false,
  msGarch: false,
  events: false,
  riskFlags: false,
  subPanels: true,
};

/**
 * Container: chỉ quản lý state/hook, KHÔNG chứa markup trình bày (markup ở
 * TaVnIndexPanel). `selectedTicker` khởi tạo từ store toàn cục (đồng bộ với
 * các tab khác đang xem cùng mã), nhưng khi người dùng bấm chọn mã khác
 * TRONG danh sách của riêng tab này (TickerWatchlist), nó chỉ đổi state cục
 * bộ — không ép store toàn cục đổi theo, tránh các tab khác bị nhảy mã
 * ngoài ý muốn người dùng.
 */
export function TaVnIndexTab() {
  const globalSelectedTicker = useAppStore((s) => s.selectedTicker);
  const [localTicker, setLocalTicker] = useState<string | null>(null);
  const DEFAULT_TICKER = 'VNINDEX';
  const ticker = localTicker ?? globalSelectedTicker ?? DEFAULT_TICKER;

  const [timeframe, setTimeframe] = useState<Timeframe>(DEFAULT_TIMEFRAME);
  const [overlays, setOverlays] = useState<Record<string, boolean>>(DEFAULT_OVERLAYS);

  const { data, isLoading, isError, error, isEmpty, refresh } = useTaVnIndex(ticker, timeframe);

  const toggleOverlay = (key: string) => {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <TaVnIndexPanel
      ticker={ticker}
      data={data}
      isLoading={isLoading}
      isError={isError}
      error={error}
      isEmpty={isEmpty}
      onRetry={refresh}
      timeframe={timeframe}
      onTimeframeChange={setTimeframe}
      onSelectTicker={setLocalTicker}
      overlays={overlays}
      onToggleOverlay={toggleOverlay}
    />
  );
}
