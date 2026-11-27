// EV-4 (27/11/2026) — hợp đồng GET /api/elite/evidence-evolution (backend/src/market/elite/evidenceEvolution.js). Chỉ mô tả.
export type TrendTag = "PROVEN_LEADER" | "EMERGING" | "DECAYING" | "INVERTED" | "LOW_COVERAGE" | "NEUTRAL";
export type MarketRegime = "UPTREND" | "SIDEWAY" | "DOWNTREND";
export interface RegimeCell { n: number; mean: number | null; t: number | null }
export interface EvolutionSignal {
  id: string; tab: string; labelVi: string; level: "stock" | "sector"; tier: "A" | "B" | "C"; priorTier: "A" | "B" | "C"; mainH: number;
  n: number; sqs: number; sqsBreakdown: { stat: number; stability: number; horizon: number; coverage: number };
  trendTag: TrendTag; rollingIc20: number | null; icAll: number | null; coverageRatio: number; measured: number; expected: number;
  regimeIc: Record<MarketRegime, RegimeCell>; regimeSpread: number | null;
}
export interface Bucket { n: number; meanExcess: number | null }
export interface EvolutionProposal {
  id: string; priority: "HIGH" | "MEDIUM" | "INFO";
  kind: "DATA_FIX" | "SIGNAL_EMERGING" | "SIGNAL_DECAY" | "SIGNAL_INVERTED" | "STUDY_READY" | "CHALLENGER_WIN";
  titleVi: string; evidenceVi: string; suggestedActionVi: string; targetArea: "E1_INGESTION" | "E2_EVIDENCE" | "ELITE_HL" | "AI_ROOM";
}
export interface EvidenceEvolution {
  version: string; generatedAt: string; calendarLast: string | null; evidenceVersion: string | null;
  currentRegime: MarketRegime | "UNKNOWN"; regimeAsOf: string | null;
  rules: { noteVi: string; tierDecisionN: number };
  scorecard: {
    liveAlpha: { championId: "ELITE_HL"; championVersion: string | null; sessionsRecorded: number; settled5: number; settled10: number; hlExcess10: number | null; flowExcess10: number | null; flowSettled10: number; toCompExcess: number | null; toDays: number };
    signalHealth: { totalSignals: number; provenCount: number; emergingCount: number; decayingCount: number; invertedCount: number; lowCoverageCount: number; meanSqs: number; emergingByChance: number; emergingEligible: number };
    aiSkill: { version: string | null; label: string | null; totalEntries: number; scored5: number; bss: number | null; bssNoteVi: string;
      incrementalAlpha: Record<"5" | "10", { agree: Bucket; caution: Bucket; flat: Bucket; baseline: number | null; valueAdd: number | null }> };
    readinessQueue: { id: string; title: string; currentSamples: number; targetSamples: number; progressPct: number; readyToEvaluate: boolean }[];
  };
  signals: EvolutionSignal[];
  registryProgress: { id: string; verdict: string; liveStatus: string }[];
  challengers: unknown[]; challengersNoteVi: string;
  proposals: EvolutionProposal[];
}
