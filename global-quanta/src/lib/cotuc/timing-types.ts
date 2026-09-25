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
