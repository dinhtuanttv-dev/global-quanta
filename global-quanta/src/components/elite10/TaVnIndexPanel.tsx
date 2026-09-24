import { useState } from 'react';
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
import { useSmcDetector, type TripleBarrierOccurrence } from '../../hooks/elite10/useSmcDetector';
import { AdxPanel } from './ta-vn-index/AdxPanel';
import { WyckoffElliottGrid } from './ta-vn-index/WyckoffElliottGrid';
import { IndicatorStrip } from './ta-vn-index/IndicatorStrip';
import { PatternScannerPanel } from './ta-vn-index/PatternScannerPanel';
import { SmcBacktestPanel } from './ta-vn-index/SmcBacktestPanel';
import { DebateArenaPanel } from './ta-vn-index/DebateArenaPanel';
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

  // MOI (Triple-Barrier tren bieu do, thiet ke 2 lop): state dieu phoi
  // giua SmcBacktestPanel (chon pattern) va MainChart (hien markers +
  // TP/SL cua occurrence dang chon). Dat NGAY SAU cac hook fetch du
  // lieu, TRUOC moi early-return (Rules of Hooks).
  const [selectedPatternKey, setSelectedPatternKey] = useState<string | null>(null);
  const [selectedOccurrenceIndex, setSelectedOccurrenceIndex] = useState<number | null>(null);

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

  // MOI (Triple-Barrier tren bieu do): map patternKey sang dung mang
  // occurrences. Khi CHON pattern moi, TU DONG chon occurrence GAN
  // NHAT (phan tu cuoi mang) lam mac dinh cho Lop 2.
  const tbData = smcReal?.tripleBarrierBacktest;
  const currentOccurrences: TripleBarrierOccurrence[] | null = selectedPatternKey && tbData
    ? ((tbData as unknown as Record<string, { occurrences: TripleBarrierOccurrence[] } | null>)[selectedPatternKey]?.occurrences ?? null)
    : null;

  function handleSelectPattern(key: string) {
    setSelectedPatternKey(key);
    const occs = (tbData as unknown as Record<string, { occurrences: unknown[] } | null> | undefined)?.[key]?.occurrences;
    setSelectedOccurrenceIndex(occs && occs.length > 0 ? occs.length - 1 : null);
  }

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
          tripleBarrierOccurrences={currentOccurrences}
          selectedOccurrenceIndex={selectedOccurrenceIndex}
        />

        {/* MOI (Triple-Barrier Lop 2): thanh dieu huong xem lai cac tin
            hieu cu hon cua pattern dang chon. */}
        {currentOccurrences && currentOccurrences.length > 1 && selectedOccurrenceIndex !== null && (
          <div className="mt-2 flex items-center justify-between rounded-md border border-purple-400/25 bg-purple-500/[0.04] px-3 py-2 text-[10px]">
            <button
              type="button"
              disabled={selectedOccurrenceIndex <= 0}
              onClick={() => setSelectedOccurrenceIndex((i) => (i !== null ? Math.max(0, i - 1) : null))}
              className="rounded bg-white/5 px-2 py-1 font-bold text-slate-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            >
              ◀ Cũ hơn
            </button>
            <span className="text-slate-400">
              Tín hiệu {selectedOccurrenceIndex + 1}/{currentOccurrences.length}
              {(() => {
                const occ = currentOccurrences[selectedOccurrenceIndex];
                if (!occ) return null;
                const resultLabel = occ.barrierHit === 'take_profit' ? 'Chạm chốt lời' : occ.barrierHit === 'stop_loss' ? 'Chạm cắt lỗ' : 'Hết hạn thời gian';
                return (
                  <span className="ml-2">
                    · {occ.signalDate} · <span className={occ.label === 1 ? 'font-bold text-emerald-400' : 'font-bold text-rose-400'}>{resultLabel}</span> ({occ.actualReturnPct >= 0 ? '+' : ''}{occ.actualReturnPct.toFixed(1)}%)
                  </span>
                );
              })()}
            </span>
            <button
              type="button"
              disabled={selectedOccurrenceIndex >= currentOccurrences.length - 1}
              onClick={() => setSelectedOccurrenceIndex((i) => (i !== null ? Math.min(currentOccurrences.length - 1, i + 1) : null))}
              className="rounded bg-white/5 px-2 py-1 font-bold text-slate-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
            >
              Mới hơn ▶
            </button>
          </div>
        )}
        <EventVolatilityTable priceSeries={data.priceSeries} events={resolvedEvents} demandZone={demandZone} />
      </div>

      {/* Vung 2.5 - Chu Ky & Thoi Diem (Time Engine day du) */}
      {cycleDetail && <CycleEnginePanel data={cycleDetail} />}

      <AdxPanel adx={data.adx} computedIndicators={data.computedIndicators} />
      <WyckoffElliottGrid wyckoff={data.wyckoff} elliott={data.elliott} wyckoffReal={smcReal?.wyckoff} />
      <IndicatorStrip smc={data.smc} vsa={data.vsa} rsi={data.rsi} macd={data.macd} computedIndicators={data.computedIndicators} smcReal={smcReal} />
      <PatternScannerPanel entries={data.patternScanner} universeRank={universeRank} />
      <SmcBacktestPanel smcReal={smcReal} selectedPatternKey={selectedPatternKey} onSelectPattern={handleSelectPattern} />

      <DebateArenaPanel ticker={ticker} />

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
