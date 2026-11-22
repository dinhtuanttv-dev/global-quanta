export interface Bar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceActionContext {
  symbol: string;
  timeframe: string;
  priceBasis: string;
  source: string;
  asOf: string;
  isIndex: boolean;
  limitPct: number | null;
  isClosed?: boolean;
  tickSize?: (price: number) => number;
}

export type PAStatus = "ready" | "insufficient" | "invalid";
export type EvidenceSource = "HARD" | "DERIVED" | "INFERRED" | "MODEL";
export type Direction = "bullish" | "bearish";
export type PatternDirection = Direction | "two_sided";
export type PatternId =
  | "TREND_BAR"
  | "REVERSAL_BAR"
  | "KEY_REVERSAL_BAR"
  | "EXHAUSTION_CANDIDATE"
  | "PIN_BAR"
  | "TWO_BAR_REVERSAL"
  | "THREE_BAR_REVERSAL"
  | "THREE_BAR_PULLBACK"
  | "INSIDE_BAR"
  | "OUTSIDE_BAR"
  | "NR7";

export interface EventTime {
  originIndex: number;
  confirmedIndex: number;
  originDate: string;
  confirmedDate: string;
}

export interface CandleFeature {
  index: number;
  range: number;
  atr: number | null;
  body: number;
  upperWick: number;
  lowerWick: number;
  bodyToRange: number | null;
  closeLocation: number | null;
  rangeAtr: number | null;
  bodyAtr: number | null;
  direction: "bullish" | "bearish" | "neutral";
  complete: boolean;
}

export interface PAPattern extends EventTime {
  id: PatternId;
  direction: PatternDirection;
  state: "candidate" | "confirmed" | "invalidated";
  priceLow: number;
  priceHigh: number;
  evidence: Record<string, number | boolean | string | null>;
  source: EvidenceSource;
  caveats: string[];
}

export interface PASwing extends EventTime {
  kind: "high" | "low";
  price: number;
  label: "HH" | "LH" | "HL" | "LL" | "equal" | "unclassified";
}

export type TrendState = "bullish" | "bearish" | "mixed" | "undetermined";

export interface TrendContext {
  state: TrendState;
  latestHighLabel: "HH" | "LH" | "equal" | null;
  latestLowLabel: "HL" | "LL" | "equal" | null;
  asOfIndex: number;
  asOfDate: string | null;
}

export type ZoneState = "developing" | "active" | "broken" | "flipped" | "expired";

export interface ZoneStateEvent {
  index: number;
  date: string;
  state: ZoneState;
  role: "support" | "resistance";
  reason: string;
}

export interface PAZone extends EventTime {
  id: string;
  kind: "support" | "resistance" | "congestion";
  role: "support" | "resistance";
  low: number;
  high: number;
  mid: number;
  touches: number;
  rejections: number;
  breaks: number;
  state: ZoneState;
  stateIndex: number | null;
  strengthComponents: {
    touches: number;
    recency: number;
    rejection: number;
    confluence: number;
  };
  stateEvents: ZoneStateEvent[];
}

export type SetupState = "forming" | "triggered" | "invalidated" | "expired";

export interface PASetup extends EventTime {
  id: string;
  kind: "PIN_REJECTION_AT_ZONE";
  direction: Direction;
  state: SetupState;
  stateIndex: number;
  stateDate: string;
  stateReason: string;
  entryReference: number | null;
  invalidationLevel: number | null;
  targetReferences: { price: number; basis: string }[];
  riskDistance: number | null;
  evidence: string[];
  missingConditions: string[];
  provenance: EvidenceSource;
}

export interface PASummary {
  trend: TrendState;
  latestPatterns: PatternId[];
  activeZones: number;
  formingSetups: number;
  triggeredSetups: number;
}

export interface PriceActionResult {
  status: PAStatus;
  engineVersion: string;
  paramsHash: string;
  context: PriceActionContext;
  candleFeatures: CandleFeature[];
  patterns: PAPattern[];
  swings: PASwing[];
  trend: TrendContext;
  zones: PAZone[];
  setups: PASetup[];
  latestSummary: PASummary | null;
  warnings: string[];
  errors: { index: number; field: string; message: string }[];
}
