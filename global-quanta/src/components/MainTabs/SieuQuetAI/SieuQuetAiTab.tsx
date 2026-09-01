/**
 * SieuQuetAiTab.tsx - V11.0 Enhanced
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import CommandCenterBar from "./CommandCenterBar";
import Tang1Table from "./Tang1Table";
import MarketStatusIndicator, { calculateMarketRegime } from "./MarketStatusIndicator";
import StockDetailModal, { type StockDetailData } from "./StockDetailModal";
import { fetchTang1 } from "../../../services/tang1Api";
import { useLivePrices } from "./useLivePrices";
import { generateMockConfluence } from "./ConfluenceScore";
import { generateMockPattern } from "./PatternBadge";
import { generateMockRSRating } from "./RSRating";
import type { Scenario, Tang1ApiResponse } from "../../../types/tang1";

export default function SieuQuetAiTab() {
  const [scenario, setScenario] = useState<Scenario>("growth");
  const [data, setData] = useState<Tang1ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"default" | "scenario">("default");
  const [showLivePrice, setShowLivePrice] = useState(false);
  const [showV11, setShowV11] = useState(false);
  const [selectedStock, setSelectedStock] = useState<StockDetailData | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTang1(scenario)
      .then((res) => { if (!cancelled) setData(res); })
      .catch((err) => { if (!cancelled) setError(String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [scenario]);

  const tickers = useMemo(() => {
    if (!data) return [];
    const rows = viewMode === "scenario" ? data.tang1WithScenario : data.tang1Result;
    return rows.map(r => r.ticker);
  }, [data, viewMode]);

  const { prices: livePrices } = useLivePrices(
    showLivePrice ? tickers : [],
    { autoRefresh: true, refreshInterval: 60000 }
  );

  const marketStatus = useMemo(() => ({
    regime: calculateMarketRegime(0.5, [
      { symbol: 'SPX', changePct: 0.8 },
      { symbol: 'NDX', changePct: 1.2 },
    ]),
    vnIndex: 1285.5,
    vnIndexChange: 0.5,
    globalStrength: 65,
    sentiment: 58,
    lastUpdated: new Date(),
  }), []);

  const handleRowClick = useCallback((ticker: string) => {
    const row = data?.tang1Result.find(r => r.ticker === ticker);
    if (!row) return;

    const confluence = generateMockConfluence(ticker);
    const pattern = generateMockPattern();
    const rsRating = generateMockRSRating(ticker);
    const price = livePrices[ticker];

    setSelectedStock({
      ticker: row.ticker,
      sector: row.sector,
      livePrice: price,
      confluence,
      pattern,
      rsRating,
      goldenFilter: rsRating.isElite && pattern !== null,
      entryPrice: price?.price ?? 0,
      targetPrice: price?.price ? price.price * 1.15 : 0,
      stopLoss: price?.price ? price.price * 0.95 : 0,
      positionSize: Math.round(100 / (rsRating.rsRating / 20)),
      riskReward: 1.5,
    });
    setModalOpen(true);
  }, [data, livePrices]);

  const confluenceData = useMemo(() => {
    if (!showV11) return {};
    return Object.fromEntries(tickers.map(t => [t, generateMockConfluence(t)]));
  }, [tickers, showV11]);

  const patternData = useMemo(() => {
    if (!showV11) return {};
    return Object.fromEntries(tickers.map(t => [t, generateMockPattern()]));
  }, [tickers, showV11]);

  const rsData = useMemo(() => {
    if (!showV11) return {};
    return Object.fromEntries(tickers.map(t => [t, generateMockRSRating(t)]));
  }, [tickers, showV11]);

  return (
    <div className="sieu-quet-ai-tab">
      <CommandCenterBar scenario={scenario} onScenarioChange={setScenario} />

      {showV11 && <MarketStatusIndicator data={marketStatus} />}

      <div className="t1-toolbar">
        <span className="t1-toolbar-title">TANG 1: SIEU QUET AI - TOP 20</span>
        <div className="t1-toolbar-actions">
          <button
            type="button"
            className={`t1-v11-toggle ${showV11 ? "active" : ""}`}
            onClick={() => setShowV11(v => !v)}
          >
            V11.0 {showV11 ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            className={`t1-live-toggle ${showLivePrice ? "active" : ""}`}
            onClick={() => setShowLivePrice(v => !v)}
          >
            Live {showLivePrice ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            className={`t1-view-toggle ${viewMode === "scenario" ? "active" : ""}`}
            onClick={() => setViewMode((v) => (v === "default" ? "scenario" : "default"))}
          >
            {viewMode === "scenario" ? "Dang xem theo kich ban" : "Xem theo kich ban"}
          </button>
        </div>
      </div>

      {loading && <div className="t1-state-msg">Dang tai du lieu Tang 1...</div>}
      {error && <div className="t1-state-msg t1-error">Khong tai duoc: {error}</div>}

      {!loading && !error && data && (
        <Tang1Table
          rows={viewMode === "scenario" ? data.tang1WithScenario : data.tang1Result}
          showScenarioScore={viewMode === "scenario"}
          livePrices={showLivePrice ? livePrices : {}}
          showLivePrice={showLivePrice}
          showV11={showV11}
          onRowClick={handleRowClick}
          confluenceData={confluenceData}
          patternData={patternData}
          rsData={rsData}
        />
      )}

      <StockDetailModal
        stock={selectedStock || { ticker: '', sector: '' }}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}

