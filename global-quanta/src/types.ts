export type StockTag = 'core' | 'ring' | 'none';

export interface SimilarTo {
  core: string;
  coeff: number;
}

export interface WatchlistStock {
  ticker: string;
  sector: string;
  price: number;
  changePct: number;
  tag: StockTag;
  convScore: number;
  groups: string[];
  pinned: boolean;
  reason: string | null;
  addedAt: string;
  addedPerfPct: number;
  unread: boolean;
  similarTo: SimilarTo | null;
}

export interface AddableStock {
  ticker: string;
  sector: string;
}

export type CoreState = 'stable' | 'breakout' | 'caution';

export interface RadarCoreNode {
  ticker: string;
  name: string;
  sector: string;
  state: CoreState;
  stateLabel: string;
  price: number;
  changePct: number;
  holdSuggestion: string;
  convergence: number[];
  trendWarning: string | null;
}

export interface RadarRingNode {
  ticker: string;
  score: number;
  sector: string;
  price: number;
  changePct: number;
}

export interface RadarDigest {
  text: string;
  date: string;
}

export interface ConcentrationRisk {
  level: 'low' | 'medium' | 'high';
  note: string;
}

export interface NewsItem {
  id: string;
  ticker: string;
  title: string;
  relevance: 'core' | 'ring';
  timeAgo: string;
}

export interface VnIndexCompare {
  index: string;
  value: number;
  changePct: number;
}

export interface VnIndexData {
  value: number;
  changeAbs: number;
  changePct: number;
  sparkline: number[];
  volumeShares: string;
  valueVND: string;
  compare: VnIndexCompare[];
  compareNote: string;
}

export interface MacroTickerData {
  name: string;
  value: number | string;
  changePct?: number;
  changeAbs?: number;
  sparkline: number[];
}

export interface LiquidityData {
  todayValueAt1030Ty: number;
  last5SessionsAt1030Ty: number[];
  avg5Ty: number;
  deviationPct: number;
  alertThresholdPct: number;
  status: string;
}

export const CONVERGENCE_LABELS = [
  'Siêu quét AI',
  'Kết nối thế giới',
  'Lọc ngành',
  'TA VN-Index',
  'Chất xúc tác',
  'Cổ tức',
];
