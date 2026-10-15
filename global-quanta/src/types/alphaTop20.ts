/** Top 20 v2 (T4) — Gateway GET /api/market/alpha/top20 (mô hình M1, 18 yếu tố, kiểm định T3, sổ theo dõi). */
export type AlphaGroup = 'price' | 'flow' | 'fund' | 'sector';

export interface AlphaFactorCell { key: string; group: AlphaGroup; raw: number | null; z: number | null; weight: number | null; contribution: number | null }

export interface AlphaStock {
  ticker: string;
  sector: string | null;
  sectorName: string | null;
  score: number | null;
  rank: number;
  avgValue60: number;
  factors: AlphaFactorCell[];
  groups: Record<AlphaGroup, number | null>;
}

export interface AlphaBoot { n: number; mean: number | null; lo: number | null; hi: number | null; pOneSided?: number | null }

export interface AlphaEvidence {
  version: string; prereg: string; ranAt: string; configSha256: string; model: string; label: string; verdict: string;
  period: { is: [string, string]; oos: [string, string]; oosDates: number; tickers: number };
  checks: { id: number; name: string; pass: boolean }[];
  oos: { ic: AlphaBoot; spreadNet5: AlphaBoot; vsPlacebo: AlphaBoot; vsConfluence: AlphaBoot; vsMomentum: AlphaBoot; dsr: { sr: number; sr0: number; deflated: number; prob: number; T: number }; turnover: number | null };
  isIc: { M1: number | null; M2: number | null };
  notes: string[];
  reason: string;
}

export interface AlphaLedger {
  snapshots: number; firstDate: string | null; maturedDates: number;
  meanScoreIc: number | null; positiveIcShare: number | null; meanSpreadPct: number | null; beatUniverseShare: number | null;
  recent: { date: string; scoreIc: number | null; top20ExcessPct: number | null; universeExcessPct: number | null; spreadPct: number | null; n: number }[];
}

export interface AlphaTop20Response {
  engine: string; model: string; configSha256: string; dataAsOf: string; builtAt: string;
  universe: number; liquid: number; minValue: number;
  weights: { key: string; name: string; group: AlphaGroup; weight: number | null; ic36m: number | null }[];
  icHistoryDays: number;
  evidence: AlphaEvidence;
  vnd: { fetchedAt: string | null; tickers: number; failed: number | null };
  top20: AlphaStock[];
  others: { ticker: string; sector: string | null; score: number | null; rank: number }[];
  ledger: AlphaLedger;
}
