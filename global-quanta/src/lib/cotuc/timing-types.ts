/**
 * Kiểu dữ liệu cho CycleTimeline.
 * BacktestWindow và CycleStatsV3 khớp đúng mục 4.2 của tài liệu v3.
 * Nếu quant-cotuc.ts đã export các kiểu này thì xoá phần trùng và import từ đó.
 */

export type ISODate = string; // 'YYYY-MM-DD', ngày lịch VN

export type AnnounceMethod = 'CONFIRMED' | 'HISTORICAL_LAG' | 'DEADLINE_ONLY';

/** Độ tin cậy của một ngày (mục 2.4 tài liệu v3): đã chốt, doanh nghiệp công bố, hay hệ thống suy ra. */
export type DataStatus = 'CONFIRMED' | 'ANNOUNCED' | 'ESTIMATED';

/** Bọc một giá trị cùng nguồn gốc và độ tin cậy của nó (mục 2.4). */
export interface Sourced<T> {
  value: T;
  status: DataStatus;
  source: 'VCI' | 'VSDC' | 'YAHOO' | 'DERIVED';
  asOf: string;
}

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

export interface CycleStatsV3 {
  ticker: string;
  version: string;
  asOf: string;
  eventType: 'CASH';
  windows: BacktestWindow[];
  selectedWindowId: string | null;
  adjustedPriceBasis: 'ADJ_CLOSE';
  benchmark: 'VNINDEX' | 'SECTOR';
}

/**
 * BỔ SUNG so với v3 (mục 4 chưa có): đường CAR theo offset cho từng đợt.
 * CycleStatsV3 chỉ chứa thống kê tóm tắt của cửa sổ, không đủ để vẽ đường CAR.
 * Endpoint đề xuất: GET /api/cotuc/cycle-paths?ticker=XYZ
 *
 * Quy ước:
 * - offsets tăng dần, đơn vị ngày giao dịch so với GDKHQ (0).
 * - car[i] là CAR tích luỹ tính từ offsets[0] (backend đã rebase, offsets[0] có giá trị 0).
 * - null = thiếu dữ liệu tại offset đó (ví dụ mã chưa niêm yết ở đợt cũ).
 * - currentPath là đợt hiện tại, null ở các offset chưa xảy ra.
 */
export interface CyclePathsV3 {
  ticker: string;
  version: string;
  asOf: string;
  offsets: number[];
  eventPaths: { exDate: ISODate; car: (number | null)[] }[];
  currentPath: (number | null)[] | null;
}

/**
 * Tín hiệu earnings đã tính sẵn ở backend (mục 4.3 của tài liệu v3).
 * `deadline` là hạn pháp lý; `expectedAnnounce` là ngày công bố ước lượng (mục 7.2) — hai giá trị này khác nhau.
 */
export interface EarningsSignal {
  ticker: string;
  isBank: boolean;
  quarterLabel: string; // "Q2/2026"
  legalDeadline: ISODate;
  expectedAnnounce: { date: ISODate; method: AnnounceMethod; lagStdDays: number | null };
  sue: number | null;
  revenueGrowthYoY: number | null;
  profitGrowthYoY: number | null;
  profitTtmGrowthYoY: number | null;
  extraordinaryShare: number | null;
  quality: 'OK' | 'THIN_HISTORY' | 'NEGATIVE_BASE' | 'DISTORTED';
  version: string;
  asOf: string;
}

export interface TimelineMarkers {
  /** Offset (ngày GD so với GDKHQ) của ĐHCĐ, thanh toán. Dùng markerOffset() để tính. */
  agm?: number | null;
  payment?: number | null;
  earnings?: { offset: number; halfWidth: number } | null;
}

// ============================================================================
// Sprint 4/5 (Giai doan 5 - Screener 4 cot moi): "Yeu cau bulk endpoint
// timing-signals cho ca vu tru (mot request)" - thay vi Screener goi
// useCycleStats/optimizeDividendTiming rieng cho tung ma (N lenh goi cho
// N dong bang), backend precompute san TimingRecommendation rut gon cho
// TOAN BO vu tru va tra ve trong mot response. Day la ban rut gon cua
// TimingRecommendation (quant-cotuc.ts) - du de ve 4 cot Screener, khong
// co explanations/toan bo earningsImpact vi Screener khong can giai
// thich chi tiet nhu modal.
//
// LUU Y: TimingAction/Confidence/ConflictKind IMPORT TU quant-cotuc.ts
// (khong dinh nghia lai o day) - vi ban da merge cua repo dinh nghia
// TRUC TIEP cac type nay trong quant-cotuc.ts (khac cau truc goc cua
// goi, noi types.ts la nguon duy nhat) - tranh trung lap dinh nghia.
import type { TimingAction, Confidence, ConflictKind } from "../quant-cotuc";

export interface TimingSignal {
  ticker: string;
  action: TimingAction;
  tdToEx: number | null;
  window: Pick<BacktestWindow, "entryFrom" | "entryTo" | "exitOffset"> | null;
  expectedNetReturn: number | null;
  nEvents: number | null;
  /** q-value sau hieu chinh da so sanh - Screener hien trong tooltip cung nEvents. */
  fdrQValue: number | null;
  confidence: Confidence | null;
  dateStatus: DataStatus | null;
  earnings: {
    revenueGrowthYoY: number | null;
    profitGrowthYoY: number | null;
    conflict: ConflictKind;
  } | null;
}

export interface TimingSignalsBulkV3 {
  version: string;
  asOf: string;
  signals: TimingSignal[];
}

// =============================================================================
// Mùa vụ KQKD theo quý (giai đoạn 3 gói cotuc-timing-engine) — chép nguyên từ types.ts của gói.
// =============================================================================

export type Quarter = 1 | 2 | 3 | 4;

/** Xem core/beta-binomial.ts để biết cách tính. Định nghĩa lại ở đây để types.ts độc lập với core. */
export interface BetaPosterior {
  alpha: number;
  beta: number;
  mean: number;
  ci: [number, number];
  level: number;
}

/**
 * CycleStatsV3 cho MỘT quý của MỘT mã: giống hệt CycleStatsV3 (cùng BacktestWindow[],
 * cùng cổng chọn mục 5.6) cộng thêm `quarter` và `reactionProbability` — xác suất Bayes
 * mà cửa sổ ĐƯỢC CHỌN cho quý này có CAR dương từ entry đến exit, dạng phân phối đầy đủ
 * (không phải một con số winRate).
 */
export interface EarningsCycleStatsV3 extends Omit<CycleStatsV3, 'eventType'> {
  eventType: 'EARNINGS';
  quarter: Quarter;
  /** null khi selectedWindowId = null (không có cửa sổ nào qua cổng cho quý này). */
  reactionProbability: BetaPosterior | null;
}

/** Mùa vụ của MỘT quý trong lịch năm: tháng công bố điển hình + độ bất định + xác suất phản ứng. */
export interface QuarterSeasonality {
  quarter: Quarter;
  /** Tháng dương lịch (1-12) — trung vị lịch sử của ngày công bố quý này. */
  typicalAnnounceMonth: number;
  /** Độ lệch chuẩn của tháng công bố qua các năm — vẽ thành dải bất định trên trục 12 tháng. */
  announceMonthStd: number;
  reactionProbability: BetaPosterior | null;
  nEvents: number;
  dataStatus: DataStatus;
  /**
   * Phân phối dự báo Student-t của NGÀY công bố (đơn vị: ngày sau cuối kỳ báo cáo), từ mô hình
   * Normal-Inverse-Gamma (core/announce-date-model.ts). Cho phép vẽ đường mật độ xác suất trên
   * trục 12 tháng và tính P(công bố trong N ngày tới). Tuỳ chọn để tương thích dữ liệu cũ.
   */
  announceModel?: { mu: number; scale: number; dof: number; n: number; ci90: [number, number] };
}

/** Timeline chu kỳ KQKD tổng hợp CẢ NĂM cho một mã — 4 phần tử, quarter 1..4. */
export interface AnnualEarningsCalendarV3 {
  ticker: string;
  version: string;
  asOf: string;
  quarters: QuarterSeasonality[];
}

/** Một cơ hội mùa vụ được phát hiện khi quét cả vũ trụ (xem scan-seasonal-opportunities.ts). */
export interface SeasonalOpportunity {
  ticker: string;
  quarter: Quarter;
  /** Cận dưới của khoảng tin cậy — tiêu chí xếp hạng CHÍNH (thận trọng kiểu Bayes, không dùng mean). */
  reactionProbabilityLowerBound: number;
  reactionProbabilityMean: number;
  expectedNetReturn: number;
  nEvents: number;
  window: Pick<BacktestWindow, 'entryFrom' | 'entryTo' | 'exitOffset'>;
}
