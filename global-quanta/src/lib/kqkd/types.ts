// K1–K6 (06/11/2026) — kiểu dữ liệu API KQKD theo quý (Gateway /api/fundamentals/kqkd/*, KQ-v1).
export type Tpl = "corp" | "bank" | "sec" | "ins";
export type GrowthStatus = "NORMAL" | "LOW_BASE" | "TURNAROUND" | "TO_LOSS" | "LOSS" | "NA";
export interface Growth { value: number | null; status: GrowthStatus; raw?: number }
export type FlagId = "NON_CORE" | "HIGH_ACCRUAL" | "NEG_CFO" | "M_FLAG" | "Z_DISTRESS" | "AUDIT_DIFF" | "SEASON_DEV";
export interface Deadline { quarterLabel: string; quarterEndDate: string; deadlineStandalone: string; deadlineConsolidated: string; daysUntilStandalone: number; daysUntilConsolidated: number; isEstimate: boolean }
export type Kpi = Record<string, number | null>;

export interface KqkdRow {
  t: string; tpl: Tpl; quarter: string; fiscal: string; created: string; current?: boolean;
  top: number | null; npat: number | null; core: number | null;
  npatYoY: Growth; coreYoY: Growth; topYoY: Growth;
  ytd: { to: number; now: number | null; prev: number | null; growth: Growth | null } | null; ytdTop: Growth | null; ttmGrowth: Growth;
  nonCoreShare: number | null; netMarginTtm: number | null; roe: number | null;
  accrual: number | null; cfoToNpat: number | null; f: number | null; m: number | null; mFlag: boolean | null; z: number | null; zZone: "SAFE" | "GREY" | "DISTRESS" | null; kpi: Kpi | null;
  sueNpat: number | null; sueCore: number | null; seasonDev: number | null; seasonDevNpat: number | null;
  nowcast: { growth: number | null; est: number; lo: number; hi: number } | null;
  heat: ([number | null, GrowthStatus] | null)[]; mcap: number | null; flags: FlagId[];
}
export interface KqkdSummary {
  version: string; label: string; asOf: string; fetchedAt: string | null; builtAt?: string; source: string;
  latestQuarter: string | null; latestFiscal: string | null; heatQuarters: string[];
  counts: { tickers: number; reportedLatest: number; failed: number; byTemplate: Record<Tpl, number>; nonCore: number; highAccrual: number; mFlag: number; zDistress: number };
  medianYtdGrowth: number | null; shareYtdUp: number | null; shareCoreUp: number | null;
  deadline: { current: Deadline | null; next: Deadline }; failed: string[]; rows: KqkdRow[]; method: { core: string; pit: string; label: string };
}

export interface MatrixRow {
  year: number; q: (number | null)[]; created: (string | null)[]; yoyQ: (Growth | null)[];
  ytd: { h1: number | null; m9: number | null; fy: number | null }; yoyYtd: { h1: Growth | null; m9: Growth | null; fy: Growth | null };
  fyAudited: number | null; auditDiff: number | null; ytdTo: number | null; ytdNow: number | null; ytdPrev: number | null; ytdGrowth: Growth | null;
}
export interface RatioRow { year: number; q: (number | null)[]; ytd: { h1: number | null; m9: number | null; fy: number | null } }
export interface BridgeStep { key: string; label: string; value: number; kind: "start" | "delta" | "total" }
export interface Bridge { label: string; steps: BridgeStep[] }
export interface PiotroskiTest { id: string; label: string; pass: boolean | null }
export interface Quality {
  quarter: string; npatTtm: number | null; topTtm: number | null; cfoTtm: number | null; accrual: number | null; cfoToNpat: number | null; roe: number | null;
  dupont: { netMargin: number | null; turnover: number | null; leverage: number | null; roe: number | null; roa: number | null };
  piotroski?: { score: number | null; of: number; tests: PiotroskiTest[] };
  beneish?: { m: number | null; flag: boolean | null; vars: Record<string, number | null> };
  altman?: { z: number | null; zone: "SAFE" | "GREY" | "DISTRESS" | null; x: Record<string, number | null> };
  wc?: { dso: number | null; dio: number | null; dpo: number | null; ccc: number | null };
  kpi?: Kpi;
}
export interface QualityPoint { quarter: string; accrual: number | null; cfoToNpat: number | null; roe: number | null; f: number | null; m: number | null; z: number | null; kpi: Kpi | null }
export interface Season {
  available: boolean; years: number; need?: number; from?: number; to?: number; share?: (number | null)[]; shareBand?: [number | null, number | null][];
  qoq?: { actual: number; expected: number; deviation: number; pairs: number };
  nowcast?: { through: number; ytd: number; est: number; lo: number; hi: number; cumShare: number; lastFy: number | null; growth: number | null; method: string };
}
export interface TtmPoint { quarter: string; fiscal: string; top: number | null; npatParent: number | null; core: number | null; cfo: number | null; topYoY: number | null; npatYoY: Growth; coreYoY: Growth; netMargin: number | null; roe: number | null }
export interface KqkdDetail {
  version: string; label: string; available: boolean; ticker: string; tpl: Tpl; tplLabel: string; asOf: string; fetchedAt: string | null; mcap?: number | null;
  latest: { fiscal: string; quarter: string; created: string };
  metrics: { key: string; label: string }[]; matrix: Record<string, MatrixRow[]>;
  ratios: { grossMargin: RatioRow[]; coreMargin: RatioRow[]; netMargin: RatioRow[] };
  ttm: TtmPoint[]; dol: number | null; bridge: { quarter: Bridge; ytd: Bridge; ttm: Bridge | null };
  quality: Quality; qualitySeries: QualityPoint[];
  seasonality: { top: Season; npatParent: Season; core: Season };
  surprise: { sueNpat: number | null; sueCore: number | null; sur: number | null };
  space: { surface: { years: number[]; z: (number | null)[][]; color: (number | null)[][] }; trajectory: { quarter: string; x: number; y: number; z: number; npat: number | null }[] };
  flags: { id: FlagId; text: string }[]; method: { core: string; pit: string; label: string };
}
