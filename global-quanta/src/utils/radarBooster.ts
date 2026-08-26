import type { RadarCoreNode, RadarRingNode, WatchlistStock } from "../types";
import type { TAConsensusResult } from "../lib/ta-command-center/golden-filter/taConsensus";

const TA_INDEX_SLOT = 3;
const CONSENSUS_ELITE_THRESHOLD = 70;

export interface MergedRadarData {
  core: RadarCoreNode[];
  ring: RadarRingNode[];
}

// Universe hop le duy nhat cua Radar = Watchlist hop Dong Thuan TA Top 20.
// Ma nao KHONG nam trong universe nay se bi loai khoi Radar hoan toan,
// ke ca khi da co san trong du lieu goc (mock/backend) - dung theo yeu cau
// "xoa khoi Watchlist thi xoa tuong ung tren Radar".
export function mergeRadarWithConsensus(
  radarCore: RadarCoreNode[],
  radarRing: RadarRingNode[],
  watchlist: WatchlistStock[],
  consensusResults: TAConsensusResult[]
): MergedRadarData {
  const consensusMap = new Map(consensusResults.map((r) => [r.ticker, r]));
  const top20Consensus = consensusResults.slice(0, 20);

  const eligibleTickers = new Set<string>([
    ...watchlist.map((w) => w.ticker),
    ...top20Consensus.map((c) => c.ticker),
  ]);

  const boostConvergence = (ticker: string, convergence: number[]): number[] => {
    const consensus = consensusMap.get(ticker);
    if (!consensus || consensus.taConsensusScore < CONSENSUS_ELITE_THRESHOLD) return convergence;
    const next = [...convergence];
    next[TA_INDEX_SLOT] = 1;
    return next;
  };

  // Loc bo ma khong con hop le TRUOC khi boost - day la dong sua chinh cho bug.
  const filteredCore = radarCore.filter((node) => eligibleTickers.has(node.ticker));
  const filteredRing = radarRing.filter((node) => eligibleTickers.has(node.ticker));

  const boostedCore: RadarCoreNode[] = filteredCore.map((node) => ({
    ...node,
    convergence: boostConvergence(node.ticker, node.convergence ?? []),
  }));

  const boostedRing: RadarRingNode[] = filteredRing.map((node) => {
    const consensus = consensusMap.get(node.ticker);
    const hasStrongConsensus = consensus && consensus.taConsensusScore >= CONSENSUS_ELITE_THRESHOLD;
    return hasStrongConsensus ? { ...node, score: Math.min(6, node.score + 1) } : node;
  });

  const existingTickers = new Set([...boostedCore, ...boostedRing].map((n) => n.ticker));
  const newTickers = Array.from(eligibleTickers).filter((t) => !existingTickers.has(t));

  const extraRingNodes: RadarRingNode[] = newTickers.map((ticker) => {
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
