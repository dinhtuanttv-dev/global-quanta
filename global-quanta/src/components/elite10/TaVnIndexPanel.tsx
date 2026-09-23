import type { TaVnIndexResponse, Timeframe } from '../../types/taVnIndex';
import type { ApiError } from '../../hooks/ta-vn-index/useTaVnIndex';
import { ControlBar } from './ta-vn-index/ControlBar';
import { TickerWatchlist } from './ta-vn-index/TickerWatchlist';
import { ConflictBanner } from './ta-vn-index/ConflictBanner';
import { MockDataBanner } from './ta-vn-index/MockDataBanner';
import { MainChart } from './ta-vn-index/MainChart';
import { useChartOverlay } from '../../hooks/elite10/useChartOverlay';
import { useConfluenceEngine } from '../../hooks/elite10/useConfluenceEngine';
import { useUniverseRank } from '../../hooks/elite10/useUniverseRank';
import { useAiInsight } from '../../hooks/elite10/useAiInsight';
import { useCycleDetail } from '../../hooks/elite10/useCycleDetail';
import { useSmcDetector } from '../../hooks/elite10/useSmcDetector';
import { AdxPanel } from './ta-vn-index/AdxPanel';
import { WyckoffElliottGrid } from './ta-vn-index/WyckoffElliottGrid';
import { IndicatorStrip } from './ta-vn-index/IndicatorStrip';
import { PatternScannerPanel } from './ta-vn-index/PatternScannerPanel';
import { EventVolatilityTable } from './ta-vn-index/EventVolatilityTable';
import { ConfluencePanel } from './ta-vn-index/ConfluencePanel';
import { ConfluenceWaterfall } from './ta-vn-index/ConfluenceWaterfall';
import { ConfluenceCaseMatrix } from './ta-vn-index/ConfluenceCaseMatrix';
import { AiDeepInsightPanel } from './ta-vn-index/AiDeepInsightPanel';
import { CycleEnginePanel } from './ta-vn-index/CycleEnginePanel';

interface TaVnIndexPanelProps {
  ticker: string;
  data: TaVnIndexResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error?: ApiError;
  isEmpty: boolean;
  onRetry: () => void;
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  onSelectTicker: (ticker: string) => void;
  overlays: Record<string, boolean>;
  onToggleOverlay: (key: string) => void;
}

export function TaVnIndexPanel({
  ticker,
  data,
  isLoading,
  isError,
  error,
  isEmpty,
  onRetry,
  timeframe,
  onTimeframeChange,
  onSelectTicker,
  overlays,
  onToggleOverlay,
}: TaVnIndexPanelProps) {
  const controlBar = (
    <ControlBar
      timeframe={timeframe}
      onTimeframeChange={onTimeframeChange}
      overlays={overlays}
      onToggleOverlay={onToggleOverlay}
    />
  );
  const watchlist = <TickerWatchlist selectedTicker={ticker} onSelectTicker={onSelectTicker} />;
  const { overlay } = useChartOverlay(ticker);
  const { breakdown: confluenceBreakdown } = useConfluenceEngine(ticker);
  const { universeRank } = useUniverseRank(ticker);
  const { insight } = useAiInsight(ticker);
  const { cycleDetail } = useCycleDetail(ticker);
  const { smcReal } = useSmcDetector(ticker);

  // 1. Loading
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 text-slate-200">
        {controlBar}
        <div className="flex flex-col items-center gap-2 py-10">
          <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-white/10 border-t-cyan-400" />
          <p className="text-xs text-slate-400">Đang phân tích kỹ thuật…</p>
        </div>
      </div>
    );
  }

  // 2. Error
  if (isError) {
    return (
      <div className="flex flex-col gap-3 text-slate-200">
        {controlBar}
        <div className="flex flex-col items-center gap-2 py-8 text-center" role="alert">
          <p className="text-sm">Không tải được dữ liệu TA VN-Index.</p>
          <p className="text-xs text-slate-500">{error?.message ?? 'Lỗi không xác định.'}</p>
          <button type="button" onClick={onRetry} className="rounded border border-rose-500 px-3.5 py-1.5 text-xs text-rose-400">
            Thử lại
          </button>
        </div>
      </div>
    );
  }

  // 3. Empty
  if (isEmpty || !data) {
    return (
      <div className="flex flex-col gap-3 text-slate-200">
        {controlBar}
        <div className="py-10 text-center text-xs text-slate-500">Chưa có đủ dữ liệu kỹ thuật cho mã này.</div>
      </div>
    );
  }

  // 4. Data thành công
  const demandZone = data.smc.zones.find((z) => z.kind === 'demand_zone');
  // FIX (ra soat 2026-09-17): dung CHUNG 1 nguon events cho ca MainChart
  // VA EventVolatilityTable - truoc day 2 noi dung mock/that khac nhau,
  // gay khong nhat quan (Chart dung that, bang duoi van hien mock).
  const resolvedEvents = overlay?.events && overlay.events.length > 0 ? overlay.events : data.events;

  return (
    <div className="flex flex-col gap-3 text-slate-200">
      <div className="text-[13px] font-bold tracking-wide text-cyan-300">
        [ TA VN-INDEX ] — {data.ticker} · sau nâng cấp TA Logic Engine
      </div>

      {controlBar}
      <MockDataBanner isMock={data.analysisIsMock ?? false} fallbackReason={data.fallbackReason} />
      <ConflictBanner conflicts={data.conflicts} />

      <div className="rounded-md border border-cyan-400/30 bg-gradient-to-b from-slate-900 to-slate-950 p-3 shadow-[0_0_18px_rgba(34,232,255,0.06)]">
        <div className="mb-2 text-[11px] font-bold tracking-wide text-cyan-300">INTEGRATED CHART &amp; EVENT TIMELINE</div>
        <MainChart
          priceSeries={data.priceSeries}
          zones={data.smc.zones}
          trendline={data.trendline}
          events={resolvedEvents}
          showTrendline={overlays.trendline}
          showDemandZone={overlays.demandZone}
          computedIndicators={data.computedIndicators}
          showSma200={overlays.sma200}
          showEma={overlays.ema}
          showBollinger={overlays.bollinger}
          tradeScenario={overlay?.tradeScenario}
          riskFlags={overlay?.riskFlags}
        />
        <EventVolatilityTable priceSeries={data.priceSeries} events={resolvedEvents} demandZone={demandZone} />
      </div>

      {/* Vung 2.5 - Chu Ky & Thoi Diem (Time Engine day du) */}
      {cycleDetail && <CycleEnginePanel data={cycleDetail} />}

      <AdxPanel adx={data.adx} computedIndicators={data.computedIndicators} />
      <WyckoffElliottGrid wyckoff={data.wyckoff} elliott={data.elliott} />
      <IndicatorStrip smc={data.smc} vsa={data.vsa} rsi={data.rsi} macd={data.macd} computedIndicators={data.computedIndicators} smcReal={smcReal} />
      <PatternScannerPanel entries={data.patternScanner} universeRank={universeRank} />

      {watchlist}

      {/* FIX (ra soat 2026-09-17): uu tien Confluence Engine THAT (6
          pillar da port + test khop 100% Python) - fallback ve mock cu
          (data.confluence, 7 nguon co dinh) CHI KHI chua load xong, de
          khong hien man hinh trong khi cho API. */}
      <ConfluencePanel breakdown={confluenceBreakdown ?? data.confluence} ticker={data.ticker} />

      {/* Vung 3 - Waterfall: giai thich diem so theo tung nguon */}
      {confluenceBreakdown && (
        <ConfluenceWaterfall sources={confluenceBreakdown.sources} score={confluenceBreakdown.overall.value} />
      )}

      {/* Vung 4 - Ma tran doi khang + Vung 5 - AI Deep Insight */}
      {insight && (
        <>
          <ConfluenceCaseMatrix bullCase={insight.bullCase} bearCase={insight.bearCase} />
          <AiDeepInsightPanel tradeScenario={insight.tradeScenario} riskFlags={insight.riskFlags} warnings={insight.warnings} />
        </>
      )}
    </div>
  );
}
