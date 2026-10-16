/**
 * world-types.ts — data specification for the "Kết nối thế giới" tab.
 * Types, catalogs, validators and SQL schema. No logic beyond validation, so it can be shared by
 * the API, the ETL and the UI.
 */
import type { SeriesMeta } from './macro-data';

export type Region = 'US' | 'CN' | 'EU' | 'JP' | 'KR' | 'TH' | 'VN' | 'GLOBAL';
export type Channel = 'commodity' | 'fx_rates' | 'capital_flow' | 'export_demand' | 'risk_sentiment' | 'policy_trade';
export type EvidenceTier = 'A' | 'B' | 'C';

export const CHANNEL_NAMES_VI: Record<Channel, string> = {
  commodity: 'Hàng hoá',
  fx_rates: 'Tỷ giá, lãi suất',
  capital_flow: 'Dòng vốn',
  export_demand: 'Cầu xuất khẩu',
  risk_sentiment: 'Tâm lý rủi ro',
  policy_trade: 'Chính sách thương mại',
};

export const TIER_MEANING_VI: Record<EvidenceTier, string> = {
  A: 'Vượt hiệu chỉnh kiểm định bội, ổn định theo thời gian và vượt kiểm định ngoài mẫu',
  B: 'Có ý nghĩa thống kê trong mẫu sau hiệu chỉnh kiểm định bội',
  C: 'Giả thuyết hoặc chưa đủ bằng chứng',
};

// ───────────────────────────── Factors ─────────────────────────────

/** Global factors that do not already exist in VN_CATALOG (FED, DXY, OIL do). Monthly, for the matrix. */
export const WORLD_EXTRA_FACTORS: SeriesMeta[] = [
  { id: 'CNY', nameVi: 'Tỷ giá USD/CNY', role: 'factor', kind: 'level', unit: 'CNY', source: 'thị trường', pubLagMonths: 0, typicalReleaseDay: 1, group: 'global' },
  { id: 'STEEL', nameVi: 'Giá thép thế giới', role: 'factor', kind: 'level', unit: 'USD/tấn', source: 'thị trường', pubLagMonths: 0, typicalReleaseDay: 1, group: 'global' },
  { id: 'CONTAINER', nameVi: 'Cước container', role: 'factor', kind: 'level', unit: 'chỉ số', source: 'thị trường', pubLagMonths: 0, typicalReleaseDay: 1, group: 'global' },
  { id: 'PMI_CN', nameVi: 'PMI sản xuất Trung Quốc', role: 'factor', kind: 'rate', unit: 'điểm', source: 'nguồn chính thức', pubLagMonths: 1, typicalReleaseDay: 1, group: 'global' },
  { id: 'PMI_US', nameVi: 'PMI sản xuất Mỹ', role: 'factor', kind: 'rate', unit: 'điểm', source: 'nguồn chính thức', pubLagMonths: 1, typicalReleaseDay: 1, group: 'global' },
  { id: 'SEMI', nameVi: 'Chu kỳ bán dẫn', role: 'factor', kind: 'level', unit: 'chỉ số', source: 'thị trường', pubLagMonths: 0, typicalReleaseDay: 1, group: 'global' },
  { id: 'VIX', nameVi: 'VIX (rủi ro toàn cầu)', role: 'factor', kind: 'level', unit: 'điểm', source: 'thị trường', pubLagMonths: 0, typicalReleaseDay: 1, group: 'global' },
  { id: 'EM_FLOWS', nameVi: 'Dòng vốn thị trường mới nổi', role: 'factor', kind: 'rate', unit: 'tỷ USD', source: 'tổ chức tài chính quốc tế', pubLagMonths: 1, typicalReleaseDay: 10, group: 'global' },
  { id: 'TARIFF', nameVi: 'Bất định chính sách thương mại', role: 'factor', kind: 'level', unit: 'chỉ số', source: 'chỉ số bất định chính sách', pubLagMonths: 0, typicalReleaseDay: 1, group: 'global' },
  { id: 'MSCI_EM', nameVi: 'Chỉ số thị trường mới nổi', role: 'factor', kind: 'level', unit: 'điểm', source: 'thị trường', pubLagMonths: 0, typicalReleaseDay: 1, group: 'global' },
];

/** Region and channel of every world factor (including those defined in VN_CATALOG). */
export const WORLD_FACTOR_INFO: Record<string, { region: Region; channel: Channel }> = {
  FED: { region: 'US', channel: 'fx_rates' },
  DXY: { region: 'US', channel: 'fx_rates' },
  OIL: { region: 'GLOBAL', channel: 'commodity' },
  CNY: { region: 'CN', channel: 'fx_rates' },
  STEEL: { region: 'CN', channel: 'commodity' },
  CONTAINER: { region: 'GLOBAL', channel: 'export_demand' },
  PMI_CN: { region: 'CN', channel: 'export_demand' },
  PMI_US: { region: 'US', channel: 'export_demand' },
  SEMI: { region: 'GLOBAL', channel: 'export_demand' },
  VIX: { region: 'US', channel: 'risk_sentiment' },
  EM_FLOWS: { region: 'GLOBAL', channel: 'capital_flow' },
  TARIFF: { region: 'US', channel: 'policy_trade' },
  MSCI_EM: { region: 'GLOBAL', channel: 'capital_flow' },
};

export const WORLD_FACTOR_IDS = Object.keys(WORLD_FACTOR_INFO);

// ───────────────────────────── Sectors and markets ─────────────────────────────

export interface SectorInfo {
  id: string;
  nameVi: string;
}

export const VN_SECTORS: SectorInfo[] = [
  { id: 'S_BANK', nameVi: 'Ngân hàng' },
  { id: 'S_SEC', nameVi: 'Chứng khoán' },
  { id: 'S_RE', nameVi: 'Bất động sản' },
  { id: 'S_STEEL', nameVi: 'Thép' },
  { id: 'S_OIL', nameVi: 'Dầu khí' },
  { id: 'S_SEAFOOD', nameVi: 'Thuỷ sản' },
  { id: 'S_TEXTILE', nameVi: 'Dệt may' },
  { id: 'S_PORT', nameVi: 'Cảng và logistics' },
  { id: 'S_TECH', nameVi: 'Công nghệ' },
  { id: 'S_POWER', nameVi: 'Điện' },
];

export const SECTOR_TARGETS: SeriesMeta[] = VN_SECTORS.map((s) => ({
  id: s.id, nameVi: s.nameVi, role: 'target' as const, kind: 'index' as const, unit: 'điểm', source: 'HOSE', pubLagMonths: 0, typicalReleaseDay: 1, group: 'market' as const,
}));

export interface MarketInfo {
  id: 'US' | 'CN' | 'JP' | 'KR' | 'TH' | 'VN';
  nameVi: string;
}

/** Equity markets used by the connectedness analysis (daily returns). */
export const WORLD_MARKETS: MarketInfo[] = [
  { id: 'US', nameVi: 'Mỹ' },
  { id: 'CN', nameVi: 'Trung Quốc' },
  { id: 'JP', nameVi: 'Nhật' },
  { id: 'KR', nameVi: 'Hàn Quốc' },
  { id: 'TH', nameVi: 'Thái Lan' },
  { id: 'VN', nameVi: 'Việt Nam' },
];

// ───────────────────────────── Events ─────────────────────────────

export type EventKind = 'scheduled' | 'surprise';
export type EventType = 'monetary_policy' | 'trade_policy' | 'macro_release' | 'commodity_shock' | 'geopolitical' | 'index_reclassification' | 'other';
export const EVENT_TYPES: EventType[] = ['monetary_policy', 'trade_policy', 'macro_release', 'commodity_shock', 'geopolitical', 'index_reclassification', 'other'];

export interface WorldEvent {
  id: string;
  kind: EventKind;
  type: EventType;
  titleVi: string;
  /** announcement instant in UTC, ISO 8601 */
  tsUtc: string;
  region: Region;
  /** sectors the event is EXPECTED to affect (a hypothesis, not a result) */
  sectorsHint: string[];
  polarityHint: -1 | 0 | 1;
  source: { name: string; url?: string };
  extraction?: { method: 'manual' | 'llm'; confidence: number; reviewed: boolean };
}

// ───────────────────────────── Stock exposure ─────────────────────────────

export interface StockExposure {
  code: string;
  sectorId: string;
  /** share of revenue by region, percent, must sum to 100 (±0.5) */
  revenueByRegion: Partial<Record<Region, number>>;
  /** share of costs tied to commodities, 0..1 */
  commodityCostShare: number;
  fxRevenueShare: number;
  fxDebtShare: number;
  foreignOwnership?: number;
  asOfPeriod: string;
  sourceRef: string;
}

// ───────────────────────────── Validation ─────────────────────────────

const isIso = (s: unknown): boolean => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?Z$/.test(s) && !Number.isNaN(Date.parse(s));
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Returns a list of human-readable problems; an empty list means valid. */
export function validateWorldEvent(e: unknown): string[] {
  if (!isObj(e)) return ['Sự kiện phải là một đối tượng.'];
  const errs: string[] = [];
  if (typeof e.id !== 'string' || !e.id.trim()) errs.push('Thiếu id.');
  if (e.kind !== 'scheduled' && e.kind !== 'surprise') errs.push("kind phải là 'scheduled' hoặc 'surprise'.");
  if (!EVENT_TYPES.includes(e.type as EventType)) errs.push(`type không hợp lệ; cho phép: ${EVENT_TYPES.join(', ')}.`);
  if (typeof e.titleVi !== 'string' || !e.titleVi.trim()) errs.push('Thiếu tiêu đề.');
  if (!isIso(e.tsUtc)) errs.push('tsUtc phải là thời điểm UTC dạng ISO 8601 kết thúc bằng Z.');
  if (!Array.isArray(e.sectorsHint) || !e.sectorsHint.every((s) => VN_SECTORS.some((v) => v.id === s))) errs.push('sectorsHint phải là danh sách mã ngành hợp lệ.');
  if (![-1, 0, 1].includes(e.polarityHint as number)) errs.push('polarityHint phải là -1, 0 hoặc 1.');
  if (!isObj(e.source) || typeof e.source.name !== 'string' || !e.source.name) errs.push('Thiếu nguồn.');
  if (e.extraction !== undefined) {
    const x = e.extraction;
    if (!isObj(x) || (x.method !== 'manual' && x.method !== 'llm') || typeof x.confidence !== 'number' || x.confidence < 0 || x.confidence > 1 || typeof x.reviewed !== 'boolean')
      errs.push('extraction không hợp lệ (method, confidence 0..1, reviewed).');
    else if (x.method === 'llm' && x.confidence < 0.6 && x.reviewed !== true) errs.push('Sự kiện do AI trích với độ tin cậy dưới 0,6 phải được người kiểm duyệt trước khi đo.');
  }
  return errs;
}

export function validateStockExposure(x: unknown): string[] {
  if (!isObj(x)) return ['Phơi nhiễm phải là một đối tượng.'];
  const errs: string[] = [];
  if (typeof x.code !== 'string' || !x.code) errs.push('Thiếu mã cổ phiếu.');
  if (!VN_SECTORS.some((s) => s.id === x.sectorId)) errs.push('sectorId không hợp lệ.');
  if (!isObj(x.revenueByRegion)) errs.push('Thiếu revenueByRegion.');
  else {
    const vals = Object.values(x.revenueByRegion);
    if (!vals.every((v) => typeof v === 'number' && v >= 0 && v <= 100)) errs.push('Mỗi tỷ trọng doanh thu phải trong [0, 100].');
    else if (Math.abs(vals.reduce((a: number, b) => a + (b as number), 0) - 100) > 0.5) errs.push('Tỷ trọng doanh thu theo vùng phải cộng đủ 100%.');
  }
  for (const k of ['commodityCostShare', 'fxRevenueShare', 'fxDebtShare'] as const)
    if (typeof x[k] !== 'number' || (x[k] as number) < 0 || (x[k] as number) > 1) errs.push(`${k} phải trong [0, 1].`);
  if (typeof x.asOfPeriod !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(x.asOfPeriod)) errs.push('asOfPeriod phải có dạng YYYY-MM.');
  if (typeof x.sourceRef !== 'string' || !x.sourceRef) errs.push('Thiếu sourceRef (truy xuất nguồn báo cáo).');
  return errs;
}

// ───────────────────────────── SQL schema ─────────────────────────────

export const WORLD_DDL = `-- World tab storage (PostgreSQL). Append-only where history matters.
CREATE TABLE IF NOT EXISTS world_event (
  id            text PRIMARY KEY,
  kind          text NOT NULL CHECK (kind IN ('scheduled','surprise')),
  type          text NOT NULL,
  title_vi      text NOT NULL,
  ts_utc        timestamptz NOT NULL,
  region        text NOT NULL,
  sectors_hint  text[] NOT NULL DEFAULT '{}',
  polarity_hint smallint NOT NULL CHECK (polarity_hint IN (-1,0,1)),
  source_name   text NOT NULL,
  source_url    text,
  extraction_method     text CHECK (extraction_method IN ('manual','llm')),
  extraction_confidence real CHECK (extraction_confidence BETWEEN 0 AND 1),
  reviewed      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- one row per (event, sector, estimation run); a re-run is a new row, never an UPDATE
CREATE TABLE IF NOT EXISTS event_reaction (
  event_id     text NOT NULL REFERENCES world_event(id),
  sector_id    text NOT NULL,
  window_lo    smallint NOT NULL,
  window_hi    smallint NOT NULL,
  car_pct      double precision NOT NULL,
  se_pct       double precision NOT NULL,
  t_stat       double precision NOT NULL,
  p_value      double precision NOT NULL,
  q_value      double precision,
  n_estimation integer NOT NULL,
  limit_days   smallint NOT NULL DEFAULT 0,
  run_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, sector_id, window_lo, window_hi, run_at)
);

CREATE TABLE IF NOT EXISTS stock_exposure (
  code                 text NOT NULL,
  sector_id            text NOT NULL,
  as_of_period         char(7) NOT NULL,
  revenue_by_region    jsonb NOT NULL,
  commodity_cost_share real NOT NULL CHECK (commodity_cost_share BETWEEN 0 AND 1),
  fx_revenue_share     real NOT NULL CHECK (fx_revenue_share BETWEEN 0 AND 1),
  fx_debt_share        real NOT NULL CHECK (fx_debt_share BETWEEN 0 AND 1),
  foreign_ownership    real,
  source_ref           text NOT NULL,
  PRIMARY KEY (code, as_of_period)
);

CREATE TABLE IF NOT EXISTS evidence_link (
  factor_id   text NOT NULL,
  sector_id   text NOT NULL,
  lag_months  smallint NOT NULL,
  tier        char(1) NOT NULL CHECK (tier IN ('A','B','C')),
  q_value     double precision,
  stable      boolean,
  oos_pass    boolean,
  computed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (factor_id, sector_id, lag_months, computed_at)
);
`;
