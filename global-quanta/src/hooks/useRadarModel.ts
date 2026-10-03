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
import { useBuyTimeline } from "./useBuyTimeline";
import { useDecisionStates } from "./useCotucDecision";
import { buyCriterion } from "../lib/radarTimeline";

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
  // Tiêu chí 6 "Cổ tức · điểm mua": Timeline điểm mua + DecisionBar (tab Cổ tức) — chỉ xét mã trên Radar.
  const buyTimeline = useBuyTimeline();
  const decisionStates = useDecisionStates();
  const buy = useMemo(() => {
    if (!buyTimeline.data) return null; // chưa tải / lỗi -> "chưa có dữ liệu", không tính là "không đạt"
    const decisions = decisionStates.states.map((d) => ({ ticker: d.ticker, level: d.decision.level, combinedProbability: d.decision.combinedProbability }));
    return buyCriterion(buyTimeline.data.rows, decisions, tickers);
  }, [buyTimeline.data, decisionStates.states, tickers]);
  const us = useSectorPulse();
  const eu = useSectorPulseRegion("eu");
  const asia = useSectorPulseRegion("asia");

  const sources: RadarSources = useMemo(() => {
    const worldReady = us.topGainers.length + us.topLosers.length > 0;
    const world = worldReady
      ? new Map(computeBeneficiaryStocks({
          usGainers: us.topGainers, usLosers: us.topLosers, euGainers: eu.topGainers, euLosers: eu.topLosers,
          asiaGainers: asia.topGainers, asiaLosers: asia.topLosers, macro: null, commodityDeltas: null,
        }).filter((b) => b.direction === "positive").map((b) => [b.ticker, `Hưởng lợi: ${b.sources.slice(0, 2).join("; ")}`]))
      : null;
    const impacts = catalyst?.tickerImpacts as Record<string, { direction: string; compositeScore: number }> | undefined;
    return {
      scanner: new Map(basket.items.map((i) => [i.ticker, i])),
      world,
      sector: top20Data?.top20
        ? new Map(top20Data.top20.map((r, i) => [r.ticker, `Top 20 Hội tụ dòng tiền: hạng ${i + 1}, điểm ${Math.round(r.confluenceScore)}`]))
        : null,
      ta: ta.results.length || (!ta.isLoading && !ta.error)
        ? new Map(ta.results.map((r) => [r.ticker, `Đồng thuận TA ${r.taConsensusScore}${r.goldenPatternLabel ? ` · ${r.goldenPatternLabel}` : ""}${r.wyckoffPhase ? ` · Wyckoff ${r.wyckoffPhase}` : ""}`]))
        : null,
      catalyst: impacts
        ? new Map(Object.entries(impacts).filter(([, v]) => v.direction === "benefit" && v.compositeScore > 0).map(([t, v]) => [t, `Chất xúc tác hưởng lợi, điểm ${Math.round(v.compositeScore)}`]))
        : null,
      dividend: buy ? buy.pass : null,
      dividendFail: buy?.fail,
    };
  }, [basket.items, us.topGainers, us.topLosers, eu.topGainers, eu.topLosers, asia.topGainers, asia.topLosers, catalyst, top20Data, ta.results, ta.isLoading, ta.error, buy]);

  const model = useMemo(() => buildRadarModel(tickers, sources, live), [tickers, sources, live]);
  return { ...model, listName: radar.name, listId: radar.id, tickers, loading: isLoading || basket.loading };
}
