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

/** Vai trò theo sách: đảo chiều (dùng tại hỗ trợ/kháng cự), tiếp diễn (dùng theo xu hướng), bối cảnh (chỉ mô tả). */
export type PatternRole = "reversal" | "continuation" | "context";

export interface PAPattern extends EventTime {
  id: PatternId;
  direction: PatternDirection;
  role: PatternRole;
  /** Mức kích hoạt theo sách (phá đỉnh/đáy của mẫu hình) và mức cắt lỗ tự nhiên (đáy/đỉnh mẫu hình); null nếu không áp dụng. */
  triggerLevel: number | null;
  stopLevel: number | null;
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
  /** Sách: "xu hướng tăng bị phá vỡ khi giá phá xuống swing low cấu trúc gần nhất" — true khi nhãn HH/HL (LH/LL) đã bị giá đóng cửa phá. */
  broken: boolean;
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
  /** Biên vùng theo thời gian: vùng chỉ mở rộng từ phiên pivot mới được xác nhận — truy vấn theo phiên bằng zoneBoundsAt (không nhìn trước). */
  boundsEvents: { index: number; low: number; high: number }[];
  lastTouchIndex: number;
}

export type SetupState = "forming" | "triggered" | "invalidated" | "expired";

export type SetupKind = "REVERSAL_AT_SUPPORT" | "REVERSAL_AT_RESISTANCE" | "CONTINUATION_IN_TREND";

export interface SetupVolume {
  /** RVOL của phiên mẫu hình và phiên kích hoạt (khối lượng / trung bình N phiên trước, không gồm phiên đó). */
  patternRvol: number | null;
  triggerRvol: number | null;
  /** Khối lượng phiên tăng / phiên giảm trong N phiên tới phiên kích hoạt ("khối lượng đồng thuận xu hướng"). */
  upDownRatio: number | null;
  /** Đạt cả hai: phiên kích hoạt có khối lượng tăng vọt và khối lượng đồng thuận xu hướng. null = chưa kích hoạt / thiếu dữ liệu. */
  confirmed: boolean | null;
}

export interface PASetup extends EventTime {
  id: string;
  kind: SetupKind;
  patternId: PatternId;
  direction: Direction;
  state: SetupState;
  stateIndex: number;
  stateDate: string;
  stateReason: string;
  entryReference: number | null;
  invalidationLevel: number | null;
  targetReferences: { price: number; basis: string }[];
  riskDistance: number | null;
  /** (mục tiêu − kích hoạt) / (kích hoạt − cắt lỗ); null khi thiếu mục tiêu hoặc rủi ro. */
  rewardRisk: number | null;
  /** Cổng lời/lỗ của sách (≥ minRewardRisk); null khi chưa tính được. */
  rewardRiskOk: boolean | null;
  trendAtTrigger: TrendState | null;
  volume: SetupVolume;
  zoneId: string | null;
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

export interface VolumeFeature {
  index: number;
  /** null khi thiếu dữ liệu khối lượng của phiên (không thay bằng 0). */
  volume: number | null;
  rvol: number | null;
  upDownRatio: number | null;
}

export interface PriceActionResult {
  status: PAStatus;
  engineVersion: string;
  paramsHash: string;
  context: PriceActionContext;
  candleFeatures: CandleFeature[];
  volumeFeatures: VolumeFeature[];
  patterns: PAPattern[];
  swings: PASwing[];
  trend: TrendContext;
  zones: PAZone[];
  setups: PASetup[];
  latestSummary: PASummary | null;
  warnings: string[];
  errors: { index: number; field: string; message: string }[];
}
