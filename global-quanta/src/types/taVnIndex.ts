/**
 * Types cho Tab "TA VN-Index" — cụm phân tích kỹ thuật của Elite 10.
 *
 * QUY ƯỚC MINH BẠCH DỮ LIỆU (bắt buộc, xuyên suốt dự án):
 * - `source: "HARD_DATA"`  → tính trực tiếp từ giá/khối lượng thật.
 * - `source: "ESTIMATED"`  → suy ra từ mô hình/thống kê. UI PHẢI gắn badge
 *   "Ước tính" cạnh giá trị này — xem <SourceBadge />.
 *
 * Ghi chú kiến trúc: types này mô tả HỢP ĐỒNG DỮ LIỆU giữa Project B (tiêu
 * thụ) và Project A (tính toán). Mọi field đều giả định do Project A trả
 * về qua API — Frontend KHÔNG tự tính DTW/SMC/Wyckoff/Elliott/ADX.
 */

export type DataSource = 'HARD_DATA' | 'ESTIMATED';

export interface QuantValue {
  value: number;
  source: DataSource;
}

export type Timeframe = 'D' | 'W' | 'H4' | 'M1';

// ---------------------------------------------------------------
// Main Chart — OHLCV + overlay (Giai đoạn "chart thật có trục thời gian")
// ---------------------------------------------------------------

export interface OhlcBar {
  time: string; // ISO date, dạng business-day cho lightweight-charts
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Vùng giá chữ nhật vẽ lên chart (Demand Zone, Order Block...) */
export interface PriceZone {
  id: string;
  kind: 'demand_zone' | 'order_block_bearish' | 'order_block_bullish' | 'fvg';
  priceTop: number;
  priceBottom: number;
  timeFrom: string;
  timeTo: string;
  label: string;
}

/** Đường xu hướng — danh sách điểm nối (tối thiểu 2) */
export interface TrendlinePoint {
  time: string;
  value: number;
}

/**
 * Sự kiện ghim vào nến trên timeline (catalyst/cổ tức). `barsSinceEvent` và
 * `pctChangeToNow` PHẢI tính từ chính OhlcBar thật (không hardcode) — xem
 * `computeEventStats` trong lib/taMath.ts.
 */
export interface ChartEvent {
  time: string;
  type: 'T' | 'C'; // T = catalyst, C = cổ tức (ex-dividend)
  label: string;
  priceAtEvent: QuantValue; // HARD_DATA
}

export interface EventStat extends ChartEvent {
  barsSinceEvent: number; // HARD_DATA — đếm trực tiếp từ dữ liệu
  pctChangeToNow: QuantValue; // HARD_DATA
}

// ---------------------------------------------------------------
// SMC / VSA / Wyckoff / Elliott / ADX — Giai đoạn 8 (TA Logic Engine fixes)
// ---------------------------------------------------------------

export interface SmcData {
  orderBlockCount: number;
  fvgCount: number;
  bosCount: number;
  nearestBearishOb: { priceLow: number; priceHigh: number } | null;
  zones: PriceZone[];
  source: DataSource;
}

export interface VsaData {
  pattern: string; // vd. "Climax"
  detail: string;
  source: DataSource;
}

/**
 * Wyckoff: PHẢI tự hạ độ tin cậy khi ADX < 20 (chế độ thị trường nhiễu) —
 * fix Giai đoạn 8. `confidence` = null nghĩa là "Chưa xác định" (trung
 * thực), không được ép ra một phase giả.
 */
export interface WyckoffData {
  phase: string | null; // null = "Chưa xác định"
  confidence: QuantValue | null;
  regimeGated: boolean; // true nếu độ tin cậy đã bị hạ do ADX thấp
  detail: string;
}

/** Elliott: PHẢI có confidence + số cách đếm thay thế — fix Giai đoạn 8 */
export interface ElliottData {
  waveLabel: string;
  confidence: QuantValue; // ESTIMATED
  alternateCounts: number; // vd. 2 nghĩa là có 2 cách đếm hợp lệ
  regimeGated: boolean;
}

/**
 * ADX: BẮT BUỘC tách +DI/-DI — fix quan trọng nhất Giai đoạn 8. Tuyệt đối
 * không suy luận hướng xu hướng chỉ từ giá trị adx.value.
 */
export interface AdxData {
  adx: QuantValue;
  plusDi: QuantValue;
  minusDi: QuantValue;
  dominant: 'plus' | 'minus' | 'neutral';
}

export interface RsiData {
  value: QuantValue;
  label: string; // vd. "Trung tính"
}

export interface MacdData {
  macd: QuantValue;
  signal: QuantValue;
  histogram: QuantValue;
  label: string;
}

// ---------------------------------------------------------------
// Pattern Scanner — fix decorrelation + tách geometric/win-rate (Giai đoạn 8)
// ---------------------------------------------------------------

export interface PatternScannerEntry {
  ticker: string;
  sector: string;
  patternName: string;
  geometricMatchPct: QuantValue; // HARD_DATA — độ khớp hình học
  historicalWinRatePct: QuantValue | null; // HARD_DATA — null nếu chưa đủ mẫu lịch sử
  dampenedConfidencePct: QuantValue; // ESTIMATED — sau correlation dampening
  isDampened: boolean; // true nếu bị giảm do trùng ngành với mã khác
}

// ---------------------------------------------------------------
// Cảnh báo xung đột giữa các module (fix Giai đoạn 8)
// ---------------------------------------------------------------

export interface ConflictWarning {
  id: string;
  sourceA: string;
  sourceB: string;
  description: string;
}

// ---------------------------------------------------------------
// Bộ đếm hình thành / độ chín tín hiệu (mở rộng Giai đoạn 7)
// ---------------------------------------------------------------

export type MaturityLevel = 'forming' | 'consolidating' | 'stable';

export interface FormationCounter {
  componentName: string;
  barsSinceFormation: number | null; // null = "Chưa đủ dữ liệu"
  maturity: MaturityLevel | null;
}

// ---------------------------------------------------------------
// Giải trình hội tụ — Elite Score Engine (Giai đoạn 7 + 9)
// ---------------------------------------------------------------

export type ConfluenceStatus = 'ok' | 'warn' | 'conflict' | 'no_data';

export interface ConfluenceSource {
  key: string;
  name: string;
  status: ConfluenceStatus;
  detail: string;
  weightPct: number | null; // null = chưa hiệu chỉnh trọng số (vd. Khối ngoại)
  isCurrentTab: boolean;
}

export interface EliteScoreBreakdown {
  overall: QuantValue; // ESTIMATED — tổng hợp có trọng số
  sourcesWithData: number;
  sourcesTotal: number;
  sources: ConfluenceSource[];
  concentrationRiskNote: string;
  weightsConfirmed: boolean; // false = trọng số là giả thuyết, chưa qua backtest (Giai đoạn 9)
}

// ---------------------------------------------------------------
// Danh sách mã (watchlist selector)
// ---------------------------------------------------------------

export type WatchlistFilter = 'all' | 'core' | 'ring' | 'pinned';

export interface TickerListItem {
  ticker: string;
  changePct: QuantValue;
  status: 'core' | 'ring' | 'watch';
  badge: string; // vd. "Mới thêm thủ công"
}

// ---------------------------------------------------------------
// Request params + Response tổng hợp
// ---------------------------------------------------------------

export interface TaVnIndexParams {
  ticker: string;
  timeframe?: Timeframe;
}

export interface TaVnIndexResponse {
  ticker: string;
  timeframe: Timeframe;
  asOfDate: string;
  priceSeries: OhlcBar[];
  trendline: TrendlinePoint[];
  events: ChartEvent[];
  smc: SmcData;
  vsa: VsaData;
  wyckoff: WyckoffData;
  elliott: ElliottData;
  adx: AdxData;
  rsi: RsiData;
  macd: MacdData;
  patternScanner: PatternScannerEntry[];
  conflicts: ConflictWarning[];
  formationCounters: FormationCounter[];
  confluence: EliteScoreBreakdown;
}
