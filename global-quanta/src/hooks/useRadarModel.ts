import { useMemo } from "react";
import { useAppStore } from "../store/useAppStore";
import { useSieuQuetScanner } from "./useSieuQuetScanner";
import { useScannerBasket } from "./useScannerBasket";
import { useWatchlists } from "./useWatchlists";
import { useTAConsensus } from "./useTAConsensus";
import { useTop20Radar } from "./useTop20Radar";
import { useCatalystData } from "./useCatalystData";
import { useQualityScore } from "./useQualityScore";
import { useSectorPulse } from "./useSectorPulse";
import { useSectorPulseRegion } from "./useSectorPulseRegion";
import { computeBeneficiaryStocks } from "../lib/beneficiary-stocks";
import { buildRadarModel, type RadarModel, type RadarSources } from "../lib/radarModel";

/**
 * ELITE COMMAND RADAR theo ★ Danh mục được chọn cho Radar (mặc định "Danh mục của tôi").
 * Gom dữ liệu thật của 6 tab (Siêu Quét qua Gateway; các tab còn lại cùng nguồn API với tab đó, SWR dùng chung
 * bộ đệm) và chấm hội tụ 6/6 cho từng mã. Gọi ở cả Radar và Action Center: SWR khử trùng nên không gọi API lặp.
 */
export function useRadarModel(): RadarModel & { listName: string; listId: string; tickers: string[]; loading: boolean } {
  const { radar } = useWatchlists();
  const tickers = radar.tickers;
  const { items, isLoading } = useSieuQuetScanner();
  const basket = useScannerBasket(items, "WATCHLIST", tickers);
  const live = useAppStore((s) => s.livePrices);

  const ta = useTAConsensus();
  const { top20Data } = useTop20Radar(null);
  const { snapshot: catalyst } = useCatalystData();
  const { qualityScoreData } = useQualityScore();
  const us = useSectorPulse();
  const eu = useSectorPulseRegion("eu");
  const asia = useSectorPulseRegion("asia");

  const sources: RadarSources = useMemo(() => {
    const worldReady = us.topGainers.length + us.topLosers.length > 0;
    const world = worldReady
      ? new Set(computeBeneficiaryStocks({
          usGainers: us.topGainers, usLosers: us.topLosers, euGainers: eu.topGainers, euLosers: eu.topLosers,
          asiaGainers: asia.topGainers, asiaLosers: asia.topLosers, macro: null, commodityDeltas: null,
        }).filter((b) => b.direction === "positive").map((b) => b.ticker))
      : null;
    const impacts = catalyst?.tickerImpacts as Record<string, { direction: string; compositeScore: number }> | undefined;
    return {
      scanner: new Map(basket.items.map((i) => [i.ticker, i])),
      world,
      sector: top20Data?.top20 ? new Set(top20Data.top20.map((r) => r.ticker)) : null,
      ta: ta.results.length || (!ta.isLoading && !ta.error) ? new Set(ta.results.map((r) => r.ticker)) : null,
      catalyst: impacts ? new Set(Object.entries(impacts).filter(([, v]) => v.direction === "benefit" && v.compositeScore > 0).map(([t]) => t)) : null,
      dividend: qualityScoreData?.results ? new Set((qualityScoreData.results as { ticker: string }[]).map((r) => r.ticker)) : null,
    };
  }, [basket.items, us.topGainers, us.topLosers, eu.topGainers, eu.topLosers, asia.topGainers, asia.topLosers, catalyst, top20Data, ta.results, ta.isLoading, ta.error, qualityScoreData]);

  const model = useMemo(() => buildRadarModel(tickers, sources, live), [tickers, sources, live]);
  return { ...model, listName: radar.name, listId: radar.id, tickers, loading: isLoading || basket.loading };
}
