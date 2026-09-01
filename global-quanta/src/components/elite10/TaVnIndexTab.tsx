import { useState } from 'react';
import { useTaVnIndex } from '../../hooks/ta-vn-index/useTaVnIndex';
import { TaVnIndexPanel } from './TaVnIndexPanel';
import { useAppStore } from '../../store/useAppStore';
import type { Timeframe } from '../../types/taVnIndex';

const DEFAULT_TIMEFRAME: Timeframe = 'W';
const DEFAULT_OVERLAYS: Record<string, boolean> = {
  trendline: true,
  demandZone: true,
  smc: true,
  vsa: false,
  wyckoff: false,
  elliott: false,
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
  const ticker = localTicker ?? globalSelectedTicker;

  const [timeframe, setTimeframe] = useState<Timeframe>(DEFAULT_TIMEFRAME);
  const [overlays, setOverlays] = useState<Record<string, boolean>>(DEFAULT_OVERLAYS);

  const { data, isLoading, isError, error, isEmpty, refresh } = useTaVnIndex(ticker, timeframe);

  const toggleOverlay = (key: string) => {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (!ticker) {
    return <div className="py-10 text-center text-xs text-slate-500">Chọn một mã cổ phiếu để xem phân tích kỹ thuật.</div>;
  }

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
