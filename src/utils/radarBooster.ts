import type { RadarCoreNode, RadarRingNode, WatchlistStock } from "../types";
import type { TAConsensusResult } from "../lib/ta-command-center/golden-filter/taConsensus";

// Index co dinh trong CONVERGENCE_LABELS ung voi "TA VN-Index"
const TA_INDEX_SLOT = 3;
const CONSENSUS_ELITE_THRESHOLD = 70;

export interface MergedRadarData {
  core: RadarCoreNode[];
  ring: RadarRingNode[];
}

// Gop danh sach Radar goc (mock/backend) voi Watchlist + Dong Thuan TA thuc,
// CHI boost dung o TA_INDEX_SLOT vi day la tin hieu that duy nhat co san.
// 5 o con lai (Sieu quet AI, Ket noi the gioi, Loc nganh, Chat xuc tac, Co tuc)
// giu nguyen nhu du lieu goc - KHONG bia them vi chua co logic tinh that cho cac tab do.
export function mergeRadarWithConsensus(
  radarCore: RadarCoreNode[],
  radarRing: RadarRingNode[],
  watchlist: WatchlistStock[],
  consensusResults: TAConsensusResult[]
): MergedRadarData {
  const consensusMap = new Map(consensusResults.map((r) => [r.ticker, r]));

  const boostConvergence = (ticker: string, convergence: number[]): number[] => {
    const consensus = consensusMap.get(ticker);
    if (!consensus || consensus.taConsensusScore < CONSENSUS_ELITE_THRESHOLD) return convergence;
    const next = [...convergence];
    next[TA_INDEX_SLOT] = 1;
    return next;
  };

  const boostedCore: RadarCoreNode[] = radarCore.map((node) => ({
    ...node,
    convergence: boostConvergence(node.ticker, node.convergence ?? []),
  }));

  const existingTickers = new Set([...boostedCore, ...radarRing].map((n) => n.ticker));

  const boostedRing: RadarRingNode[] = radarRing.map((node) => {
    const consensus = consensusMap.get(node.ticker);
    const hasStrongConsensus = consensus && consensus.taConsensusScore >= CONSENSUS_ELITE_THRESHOLD;
    return hasStrongConsensus ? { ...node, score: Math.min(6, node.score + 1) } : node;
  });

  // Ma moi tu Watchlist hoac Dong Thuan TA chua co trong Radar goc -> them vao Ring
  // (khong dua vao Core, vi CORE_ANGLES chi co 5 vi tri co dinh - xem canh bao da neu).
  const newTickers = new Set<string>();
  watchlist.forEach((w) => { if (!existingTickers.has(w.ticker)) newTickers.add(w.ticker); });
  consensusResults.slice(0, 20).forEach((c) => { if (!existingTickers.has(c.ticker)) newTickers.add(c.ticker); });

  const extraRingNodes: RadarRingNode[] = Array.from(newTickers).map((ticker) => {
    const w = watchlist.find((x) => x.ticker === ticker);
    const consensus = consensusMap.get(ticker);
    const hasStrongConsensus = consensus && consensus.taConsensusScore >= CONSENSUS_ELITE_THRESHOLD;
    return {
      ticker,
      sector: w?.sector ?? consensus?.sector ?? "-",
      price: w?.price ?? 0,
      changePct: w?.changePct ?? 0,
      score: hasStrongConsensus ? 1 : 0,
    };
  });

  return { core: boostedCore, ring: [...boostedRing, ...extraRingNodes] };
}
