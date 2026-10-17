// Hợp đồng dữ liệu Gateway /api/elite/* (Elite 10 E1–E3).
export type Tier = "A" | "B" | "C";

export interface SignalSpec { id: string; tab: string; labelVi: string; unit: string; level: "stock" | "sector"; tier: Tier; evidenceVi?: string }

export interface SignalWeight { id: string; labelVi: string; tab: string; tier: Tier; mainH: number; n: number; icMeas: number; icPrior: number; icPost: number; w: number }

export interface EliteScore {
  ticker: string; rank: number; Z: number; alpha5Pct: number | null; pOutperform: number; eligible: boolean; reason: string | null;
  close: number | null; advBn: number | null; sigma20: number | null; sectorKey: string | null;
  contributions: { id: string; z: number | null; contribution: number }[];
}

export interface PortfolioPick {
  ticker: string; weight: number; Z: number; rank: number; alpha5Pct: number | null; pOutperform: number; sectorKey: string | null;
  close: number; stop: number; target: number; holdSessions: number;
}

export interface LedgerHorizon {
  n: number; meanExcess: number | null; hitRate: number | null; excessCi95: [number, number] | null; meanPortfolioNet: number | null; meanVnIndex: number | null;
  ic: { n: number; mean: number | null; t: number | null }; curve: [string, number][];
}
export interface LedgerSummary { horizons: Record<string, LedgerHorizon>; criteria: { icPass: boolean; excessPass: boolean; sessions: number }; label: "EVIDENCE" | "EXPERIMENTAL"; labelVi: string }

export interface EliteDecision {
  version: string; date: string; builtAt: string; icComb: number; sigma5: number | null; weights: SignalWeight[];
  universe: { panel: number; eligible: number }; portfolio: PortfolioPick[]; scores: EliteScore[]; ledgerSummary: LedgerSummary | null;
}

export interface EvidenceHorizon { n: number; mean: number | null; t: number | null; pPos: number | null; q: number | null; stable: boolean; halves: [number, number] | null; from: string | null; to: string | null }
export interface EvidenceSignal {
  id: string; tab: string; labelVi: string; priorTier: Tier; priorEvidenceVi: string; tier: Tier; change: "up" | "down" | "none"; reasonVi: string; mainH: number;
  source: string; byH: Record<string, EvidenceHorizon>;
}
export interface EliteEvidence { version: string; generatedAt: string; calendarLast: string | null; tests: number; counts: Record<Tier, number>; signals: EvidenceSignal[] }

export interface PanelTicker { date: string; ticker: string; icb: { l1?: string; l2?: string; l3?: string } | null; sector: string | null; values: Record<string, number | null>; signals: SignalSpec[]; missingSources: string[] }
export interface DecisionTicker extends EliteScore { date: string; version: string; icComb: number; weights: SignalWeight[]; inPortfolio: boolean; universe: { panel: number; eligible: number } }

export const TIER_LABEL: Record<Tier, string> = { A: "Bậc A", B: "Bậc B", C: "Bậc C" };
export const TIER_TITLE: Record<Tier, string> = {
  A: "Đạt kiểm định đặt trước — có trọng số",
  B: "Có lợi thế một phần / mẫu mỏng — có trọng số nhỏ",
  C: "Thăm dò / chưa kiểm định — chỉ làm bối cảnh, không có trọng số",
};

export interface VarBlock { level: number; historical: { var: number; cvar: number }; gaussian: { var: number; cvar: number }; cornishFisher: { var: number }; moments: { mean: number; sd: number; skew: number; exKurt: number } }
export interface EliteRisk {
  date: string; version: string; generatedAt: string; label: string; available: boolean; reasonVi?: string;
  sessions?: number; from?: string; to?: string;
  shrinkage?: { delta: number; avgCorrelation: number; method: string };
  volatility?: { daily: number; annual: number };
  holdings?: { ticker: string; weight: number; volAnnual: number; riskContribution: number; sector: string | null }[];
  diversification?: { ratio: number; effectiveN: number; enb: number; hhi: number };
  var?: { "0.95": VarBlock; "0.99": VarBlock; tenDayNoteVi: string };
  beta?: number | null; corrWithVnIndex?: number | null;
  maxDrawdown?: { value: number; from: string | null; to: string | null };
  stress?: { worstVnIndexDays: { date: string; vnIndex: number; portfolio: number }[]; worst10Sessions: { from: string; to: string; vnIndex: number; portfolio: number } | null };
  sectors?: { key: string; weight: number }[];
  correlation?: { tickers: string[]; matrix: (number | null)[][] };
}

export interface LedgerEntry {
  date: string; lockedAt: string; holdings: { ticker: string; weight: number }[]; universeSize: number | null;
  results: Record<string, { from: string; to: string; portfolioNet: number; universeNet: number; excess: number; vnIndex: number | null; ic: number | null; names: number }>;
}
export interface EliteLedger { version: string; updatedAt: string; summary: LedgerSummary; entries: LedgerEntry[] }

export interface EliteRetro {
  version: string; generatedAt: string; prereg: string; label: "EVIDENCE" | "EXPERIMENTAL"; verdictVi: string;
  period: { from: string | null; to: string | null; sessions: number };
  criteria: { icPass: boolean; excessPass: boolean; sessions: number };
  horizons: Record<string, LedgerHorizon>;
  descriptive: { nonOverlapping10: { n: number; mean: number | null; ci95: [number, number] | null }; annualisedExcess: number | null; dailyTurnover: number | null; tierDays: Record<string, Record<Tier, number>> };
  lastWeights: { id: string; tier: Tier; w: number; icPost: number }[];
}
