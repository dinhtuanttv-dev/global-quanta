// Port từ locnganh-timing-engine (types.ts).
/**
 * types.ts — locnganh-timing-engine.
 * Phần đầu (đến dòng phân cách) là kiểu DÙNG CHUNG, giữ Y HỆT tên và shape so với
 * cotuc-timing-engine/src/types.ts để các component sao chép nguyên vẹn (CycleTimeline,
 * DecisionBar...) dùng được không cần sửa. Phần sau là kiểu RIÊNG cho domain ngành/RRG.
 */

export type ISODate = string;

export interface BacktestWindow {
  id: string;
  label: string;
  entryFrom: number; // offset ngày giao dịch, entryFrom <= entryTo <= 0
  entryTo: number;
  exitOffset: number;
  holdsThroughEx: boolean;
  nEvents: number;
  nEff: number;
  meanCarRaw: number;
  meanCarShrunk: number;
  netExpectancy: number;
  netExpectancyLcb: number;
  winRate: number;
  oosHitRate: number | null;
  oosMeanNet: number | null;
  fdrQValue: number;
  selected: boolean;
}

/**
 * `ticker` giữ nguyên tên trường (để tái dùng compute-cycle-paths.ts/compute-cycle-stats.ts
 * không sửa) nhưng ở gói này giá trị của nó là MÃ NGÀNH (`sectorKey`), không phải mã cổ phiếu.
 * `eventType` đổi literal sang 'QUADRANT_TRANSITION' — sự kiện ở đây là lần ngành CHUYỂN VÀO
 * một góc phần tư RRG mục tiêu (mặc định Improving), không phải GDKHQ/KQKD.
 */
export interface CycleStatsV3 {
  ticker: string; // = sectorKey
  version: string;
  asOf: string;
  eventType: 'QUADRANT_TRANSITION';
  windows: BacktestWindow[];
  selectedWindowId: string | null;
  adjustedPriceBasis: 'ADJ_CLOSE';
  benchmark: 'VNINDEX' | 'SECTOR';
}

export interface CyclePathsV3 {
  ticker: string; // = sectorKey
  version: string;
  asOf: string;
  offsets: number[];
  eventPaths: { exDate: ISODate; car: (number | null)[] }[];
  currentPath: (number | null)[] | null;
}

export interface TimelineMarkers {
  agm?: number | null;
  payment?: number | null;
  /** Băng sự kiện phụ tuỳ chọn (ví dụ lần kiểm tra lại Confluence Score gần nhất) — không bắt buộc dùng. */
  earnings?: { offset: number; halfWidth: number } | null;
}

export type DecisionLevel = 'FAVORABLE' | 'WATCH' | 'AVOID';

export interface ConditionCheck {
  key: string;
  label: string;
  passed: boolean | null;
  detail: string;
}

export interface DecisionState {
  level: DecisionLevel;
  headline: string;
  checks: ConditionCheck[];
  combinedProbability: number;
  disclaimer: 'NOT_INVESTMENT_ADVICE';
}

// =============================================================================
// Domain riêng: RRG & chu kỳ xoay vòng ngành
// =============================================================================

/** 4 góc phần tư RRG — nhãn tiếng Anh giữ nguyên vì đây là thuật ngữ chuẩn của phương pháp. */
export type Quadrant = 'LEADING' | 'IMPROVING' | 'LAGGING' | 'WEAKENING';

/** Một điểm RRG của một ngành tại một thời điểm — khớp RRGPoint trong tài liệu kế hoạch gốc. */
export interface RRGPoint {
  sectorKey: string;
  sectorLabel: string;
  rsRatio: number;
  rsMomentum: number;
  quadrant: Quadrant;
  asOf: ISODate;
}

/** Một lần ngành chuyển từ góc phần tư này sang góc phần tư khác — "sự kiện" của engine này. */
export interface QuadrantTransition {
  sectorKey: string;
  date: ISODate;
  fromQuadrant: Quadrant;
  toQuadrant: Quadrant;
}

export interface ConfluenceWeights {
  rrg: number;
  rs: number;
  volume: number;
  pvt: number;
  ad: number;
}

/** Khớp ConfluenceStock trong tài liệu kế hoạch gốc — dữ liệu đã có sẵn trong LocNganhPanel. */
export interface ConfluenceStock {
  ticker: string;
  sectorKey: string;
  sectorQuadrant: Quadrant;
  rs3m: number | null;
  volumeSpikeRatio: number | null;
  pvtScore: number | null; // -100..100
  adScore: number | null; // -100..100
  rrgScore: number; // 0-100
  rsScore: number; // 0-100
  volumeScore: number; // 0-100
  pvtScoreNormalized: number; // 0-100
  adScoreNormalized: number; // 0-100
  weightsUsed: ConfluenceWeights;
  confluenceScore: number; // 0-100
}

export type MacroRegime = 'RISK_ON' | 'RISK_OFF' | 'TRUNG_LAP';

/** `TimingAction` cho ngành — cùng 6 trạng thái như cotuc, ý nghĩa suy ra từ lần chuyển quadrant gần nhất. */
export type SectorTimingAction = 'NO_DATE' | 'POST_EX' | 'NO_SIGNAL' | 'TOO_EARLY' | 'IN_WINDOW' | 'WINDOW_PASSED';

/**
 * CycleStatsV3 cho MỘT ngành: giống hệt CycleStatsV3 (cùng BacktestWindow[], cùng cổng chọn)
 * cộng thêm `reactionProbability` — xác suất Bayes ngành tiếp tục outperform benchmark từ
 * entry đến exit của cửa sổ được chọn, dạng phân phối (không phải một con số winRate).
 */
export interface SectorCycleStatsV3 extends Omit<CycleStatsV3, 'eventType'> {
  eventType: 'QUADRANT_TRANSITION';
  targetQuadrant: Quadrant;
  reactionProbability: { alpha: number; beta: number; mean: number; ci: [number, number]; level: number } | null;
}

/** Một cơ hội ngành được phát hiện khi quét cả vũ trụ ngành (xem scan-sector-opportunities.ts). */
export interface SectorOpportunity {
  sectorKey: string;
  reactionProbabilityLowerBound: number;
  reactionProbabilityMean: number;
  expectedNetReturn: number;
  nEvents: number;
  window: Pick<BacktestWindow, 'entryFrom' | 'entryTo' | 'exitOffset'>;
}

/** Bulk signal cho mỗi ngành — dùng trong bảng LocNganhPanel/Top 20, một request cho cả vũ trụ ngành. */
export interface SectorTimingSignal {
  sectorKey: string;
  action: SectorTimingAction;
  tdSinceTransition: number | null;
  window: Pick<BacktestWindow, 'entryFrom' | 'entryTo' | 'exitOffset'> | null;
  expectedNetReturn: number | null;
  nEvents: number | null;
  fdrQValue: number | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  reactionProbability: { mean: number; ci: [number, number] } | null;
}

export interface SectorTimingSignalsBulkV3 {
  version: string;
  asOf: string;
  signals: SectorTimingSignal[];
}

// =============================================================================
// Mở rộng của route thật (Project A /api/locnganh/*, Gateway /api/market/sectors/*) — tích hợp L4
// =============================================================================

/** Tín hiệu bulk + trường mở rộng của Project A (decision, tên ngành, góc phần tư, rổ chỉ số…). */
export type SectorTimingSignalV2 = SectorTimingSignal & {
  name: string; level: number; group: string | null; quadrant: Quadrant; liveQuadrant: Quadrant; indexMembers: number; thin: boolean;
  lastTransitionDate: string | null; expectedNetReturnLcb: number | null; decision: DecisionState; confluenceScore: number | null;
};
export interface SectorTimingBulkV2 extends SectorTimingSignalsBulkV3 {
  signals: SectorTimingSignalV2[];
  gateway?: { engine: string; dataAsOf: string; closedThrough: string | null; method: string };
  market?: { riskOnScore: number | null; macroRegime: MacroRegime };
  evidence?: { label: string; reason: string };
}
/** Chi tiết một ngành (Project A /api/locnganh/sector-cycle?code=). */
export interface SectorCycleDetail {
  code: string; name: string; level: number; asOf: string; version: string;
  evidence: { label: string; reason: string };
  signal: SectorTimingSignalV2 | null;
  stats: Omit<CycleStatsV3, 'eventType'> & { eventType: string; reactionProbability: { mean: number; ci: [number, number] } | null };
  paths: { offsets: number[]; eventPaths: { exDate: string; car: (number | null)[] }[]; currentPath: (number | null)[] | null };
  decision: DecisionState;
  entryPlan: { tranches: { offset: number; fraction: number }[]; invalidationLevel: number | null; invalidated: boolean; timeStopped: boolean; pauseFurtherEntries: boolean; runTooFar: { percentile: number | null; hasRunTooFar: boolean } } | null;
  rrg: { week: string; date: string; ratio: number; momentum: number; quadrant: Quadrant }[];
}
/** Tóm tắt một ngành của Gateway (/api/market/sectors/rrg). */
export interface GatewaySectorRrg {
  code: string; level: number; name: string; en: string; parent: string | null; universeMembers: number; indexMembers: number; thin?: boolean;
  constituents: { ticker: string; weight: number }[]; quadrant: Quadrant; liveQuadrant: Quadrant;
  tail: { week: string; date: string; ratio: number; momentum: number; quadrant: Quadrant }[];
  latestClosed: { ratio: number; momentum: number; heading: number | null; velocity: number | null };
  transitions: number; weeksSinceImproving: number | null; historyWeeks: number; from: string;
  flow?: SectorFlow; state?: { key: SectorStateKey; label: string; why: string[] };
}
export interface GatewaySectorRrgDoc {
  engine: string; dataAsOf: string; closedThrough: string | null; partialWeek: boolean; method: string;
  coverage: { l2Total: number; l2Covered: number; missing: { code: string; name: string; reason: string }[]; classified: number; withSeries: number };
  sectors: GatewaySectorRrg[];
  rotation?: Record<"2" | "3", SectorRotation>;
  evidence?: { label: string; reason: string };
}

// =============================================================================
// L5 — dòng tiền & trạng thái ngành (Gateway sectors/flow.js)
// =============================================================================
export type SectorStateKey = "GROWTH" | "ACCUMULATION" | "BOTTOMING" | "DISTRIBUTION" | "DECLINE" | "NEUTRAL";
export interface SectorLeader {
  ticker: string; rs: number | null; ret63: number | null; fromHigh: number | null; passed: number; leader: boolean; tags: string[];
  checks: { aboveMa50: boolean; aboveMa200: boolean; nearHigh: boolean; beatsSector: boolean | null; rsStrong: boolean; volumeUp: boolean };
}
export interface SectorFlow {
  share: { share20: number; share60: number; changePct: number; z: number; state: "INFLOW" | "OUTFLOW" | "RISING" | "FALLING"; history: { date: string; share: number }[] };
  money: { cmf20: number; upDownValue: number; foreignNet20: number | null; foreignCoverage: number; accumulationScore: number; stealthAccumulation: boolean; stealthDistribution: boolean; volContraction: number | null };
  price: { ret20: number | null; ret63: number | null };
  breadth: { aboveMa50: number | null; aboveMa200: number | null; nearHigh52: number | null; members: number };
  stage: { stage: number; label: string; confidence: number; stage2Start: string | null; baseCount: number } | null;
  leaders: SectorLeader[];
}
export interface SectorRotation {
  weeks: number; note: string;
  gainers: { code: string; name: string; delta: number }[]; losers: { code: string; name: string; delta: number }[];
  transfers: { from: string; fromName: string; to: string; toName: string; pp: number }[];
}
export interface SectorTrackingSummary {
  summary: { totalSignals: number; resolvedSignals: number; rollingAccuracy: number | null; rollingWindowSize?: number; brierScore: number | null; cusum: { posSum: number; negSum: number; n: number; alarmed: boolean; alarmDirection: "HIGH" | "LOW" | null }; meanPredicted: number | null };
  recent: { id: string; sectorCode: string; level: string; predictedProbability: number; entryDate: string; plannedExitDate: string; outcome: 0 | 1 | null; realizedCar: number | null }[];
}
