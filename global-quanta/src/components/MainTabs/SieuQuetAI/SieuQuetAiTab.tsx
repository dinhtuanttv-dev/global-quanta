import { useEffect, useState, useCallback, useRef } from "react";
import CommandCenterBar from "./CommandCenterBar";
import Tang1Table from "./Tang1Table";
import { fetchTang1 } from "../../../services/tang1Api";
import { fetchLivePrices } from "../../../services/livePriceService";
import type { Scenario, Tang1ApiResponse } from "../../../types/tang1";
import type { LivePriceResult } from "../../../services/livePriceService";

import type { LivePriceResponse } from "./livePriceApi";
type LivePriceMap = LivePriceResponse;

export default function SieuQuetAiTab() {
  const [scenario, setScenario] = useState<Scenario>("growth");
  const [data, setData] = useState<Tang1ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"default" | "scenario">("default");
  
  const [livePrices, setLivePrices] = useState<LivePriceMap>({});
  const [livePricesLoading, setLivePricesLoading] = useState(false);
  
  // FIX: Use ref to avoid useCallback dependency on data
  const dataRef = useRef<Tang1ApiResponse | null>(null);
  useEffect(() => { dataRef.current = data; }, [data]);

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

  // FIX: useCallback with ref instead of data dependency
  const fetchPrices = useCallback(async () => {
    const currentData = dataRef.current;
    if (!currentData?.tang1Result?.length) return;
    
    const tickers = currentData.tang1Result.map(s => s.ticker);
    setLivePricesLoading(true);
    try {
      const prices: LivePriceResult = await fetchLivePrices(tickers);
      const priceMap: LivePriceMap = {};
      for (const [ticker, info] of Object.entries(prices)) {
        priceMap[ticker] = {
          ticker,
          price: info.price,
          change: info.change,
          changePct: info.changePct,
          previousClose: null,
          timestamp: new Date(),
        };
      }
      setLivePrices(priceMap);
    } catch (err) {
      console.warn("[SieuQuetAiTab] Failed to fetch live prices:", err);
    } finally {
      setLivePricesLoading(false);
    }
  }, []); // FIX: Empty deps, use ref instead

  useEffect(() => {
    if (!data) return;
    fetchPrices();
    const interval = setInterval(fetchPrices, 60_000);
    return () => clearInterval(interval);
  }, [data, fetchPrices]);

  return (
    <div className="sieu-quet-ai-tab">
      <CommandCenterBar scenario={scenario} onScenarioChange={setScenario} />

      <div className="t1-toolbar">
        <span className="t1-toolbar-title">TANG 1: SIEU QUET AI - TOP 20 THEO FA &amp; EPS GROWTH</span>
        <button
          type="button"
          className={`t1-view-toggle ${viewMode === "scenario" ? "active" : ""}`}
          onClick={() => setViewMode((v) => (v === "default" ? "scenario" : "default"))}
        >
          {viewMode === "scenario" ? "Dang xem theo kich ban" : "Xem theo kich ban"}
        </button>
        {livePricesLoading && (
          <span className="t1-live-indicator">Dang cap nhat gia...</span>
        )}
      </div>

      {loading && <div className="t1-state-msg">Dang tai du lieu Tang 1...</div>}
      {error && <div className="t1-state-msg t1-error">Khong tai duoc du lieu: {error}</div>}

      {!loading && !error && data && (
        <Tang1Table
          rows={viewMode === "scenario" ? data.tang1WithScenario : data.tang1Result}
          showScenarioScore={viewMode === "scenario"}
          livePrices={livePrices}
          showLivePrice={true}
        />
      )}
    </div>
  );
}
