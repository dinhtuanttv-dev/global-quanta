// K1–K6 (06/11/2026) — kiểu dữ liệu API KQKD theo quý (Gateway /api/fundamentals/kqkd/*, KQ-v1).
export type Tpl = "corp" | "bank" | "sec" | "ins";
export type GrowthStatus = "NORMAL" | "LOW_BASE" | "TURNAROUND" | "TO_LOSS" | "LOSS" | "NA";
export interface Growth { value: number | null; status: GrowthStatus; raw?: number }
export type FlagId = "NON_CORE" | "HIGH_ACCRUAL" | "NEG_CFO" | "M_FLAG" | "Z_DISTRESS" | "AUDIT_DIFF" | "SEASON_DEV";
export interface Deadline { quarterLabel: string; quarterEndDate: string; deadlineStandalone: string; deadlineConsolidated: string; daysUntilStandalone: number; daysUntilConsolidated: number; isEstimate: boolean }
export type Kpi = Record<string, number | null>;

/** LC-v1 — lịch công bố KQKD. */
export type CalStatus = "REPORTED" | "DISCLOSED" | "UPCOMING" | "OVERDUE";
export interface CalRow {
  t: string; tpl: Tpl; status: CalStatus; date: string | null; source: "DISCLOSURE" | "DATA" | null; disclosureTitle: string | null; lagDays: number | null;
  expected: string | null; band: [string, string] | null; medianLag: number | null; ownN: number; lateShare: number | null; pNext: number | null;
  history: { q: string; lag: number }[];
  result: { npatYoY: Growth | null; ytd: Growth | null; sueCore: number | null; sueNpat: number | null; flags: FlagId[] } | null;
  reaction?: ({ kind: "THIN"; nEst: number } | { kind: "EVENT"; carAnn: number | null; scarAnn: number | null; avAnn: number | null; carPre: number | null; avPre: number | null; sessionsAfter: number; source: string } | { kind: "LIVE"; asOf: string; car10: number | null; scar10: number | null; av10: number | null }) | null;
}
/** LC3 — nghiên cứu sự kiện. */
export interface EsCi { n: number; mean: number | null; lo: number | null; hi: number | null }
export interface EsGroup { n: number; pre: EsCi; ann: EsCi; post: EsCi; path: (number | null)[] | null; nPath: number; leakPrice: number | null; leakVolume: number | null; reactVolume: number | null }
export interface EsAggregate { version: string; label: string; windows: { pre: [number, number]; ann: [number, number]; post: [number, number]; est: [number, number] }; pathFrom: number; events: number; precise: number; quarters: string[]; all: EsGroup; dataDated: EsGroup; quintiles: Record<string, EsGroup>; spread: { pre: number | null; ann: number | null; post: number | null }; baseRate: number; method: string }
export interface EsEvent { fiscal: string; date: string; source: string; sue: number | null; e0: string; carPre: number | null; carAnn: number | null; carPost: number | null; scarAnn: number | null; avPre: number | null; avAnn: number | null; sessionsAfter: number; path: (number | null)[] }
export interface CalSeason {
  version: string; label: string; asOf: string; method: string;
  quarter: { fiscal: string; label: string; end: string; deadlineStandalone: string; deadlineConsolidated: string; dayOfSeason: number };
  rows: CalRow[]; curve: { fiscal: string; label: string; reported: number; curve: (number | null)[] }; prevCurves: { fiscal: string; label: string; reported: number; curve: (number | null)[] }[];
  stats: { tickers: number; reported: number; disclosed: number; upcoming: number; overdue: number; expectedNext: number | null; horizonDays: number; shareNow: number | null; sharePrevSameDay: number | null; earlyVsLate: { early: number | null; late: number | null; n: number } | null };
}
export interface KqkdCalendar { asOf: string; disclosuresFetchedAt: string | null; current: CalSeason; next: CalSeason; eventStudy?: { version: string; builtAt: string; aggregate: EsAggregate } | null }

/** S7/S3/S5 — gói Mùa vụ KQKD. */
export interface SeasonAuditRow { used: string; fiscal: string; precise: string | null; source: "DISCLOSURE" | "DATA" | null; days: number | null; sessions: number | null }
export interface SeasonalityBundle {
  version: string; ticker: string; fetchedAt: string; cached: boolean; stale: boolean; source: string;
  items: Record<string, { status: number; body: unknown; error?: string; stale?: boolean }>;
  audit: Record<string, { rows: SeasonAuditRow[]; checked: number; offBy2: number; maxOff: number | null }>;
  context: {
    next: { quarter: string; fiscal: string; deadlineConsolidated: string; status: CalStatus; date: string | null; expected: string | null; band: [string, string] | null; pNext: number | null; medianLag: number | null; ownN: number; lateShare: number | null } | null;
    last: { quarter: string; date: string | null; source: string | null; result: CalRow["result"]; reaction: CalRow["reaction"] | null } | null;
    nowcast: KqkdRow["nowcast"]; nowcastLabel: string; plan: KqkdRow["plan"] | null;
    live: { asOf: string; car10: number | null; scar10: number | null; av10: number | null } | null;
    pooled?: SeasonPooled | null;
  } | null;
}

/** S4 — bằng chứng gộp theo ngành (ES-v1, chỉ kỳ có tin BCTC chính thức). */
export interface Ci { n: number; mean: number | null; lo: number | null; hi: number | null }
export interface PooledQ { n: number; tickers: number; pre: Ci; ann: Ci; post: Ci; sueSplit: { high: number; low: number; diff: number; k: number } | null }
export interface SeasonPooled { version: string; builtAt: string; sector: { code: string; name: string; byQ: Record<string, PooledQ> } | null; market: { byQ: Record<string, PooledQ> } }

/** S2 — bản đồ mùa vụ toàn thị trường (rút gọn earnings-cycle-stats của Project A). */
export type SeasonWinStatus = "SELECTED" | "WATCH" | "THIN" | "NONE";
export interface SeasonMapWindow { id: string; label: string; n: number; net: number | null; lcb: number | null; q: number | null; win: number | null; status: SeasonWinStatus }
export interface SeasonMapQuarter { n: number; selected: string | null; status: SeasonWinStatus; best: { id: string; net: number | null; lcb: number | null; q: number | null }; windows: SeasonMapWindow[] }
export interface SeasonMap {
  version: string; builtAt: string; sourceAsOf: string | null; source: string; failed: number; ms: number;
  rows: Record<string, { months: Record<string, number>; q: Record<string, SeasonMapQuarter | null>; stale?: boolean }>;
  rules: { minEvents: number; watchQ: number; cost: number; recordAheadDays: [number, number] };
}
/** S6 — sổ theo dõi tiến. */
export interface SeasonLedgerEntry {
  t: string; fiscal: string; quarter: string; window: string; label: string; status: SeasonWinStatus;
  backtest: { n: number; net: number | null; lcb: number | null; q: number | null; win: number | null }; expected: string; recordedAt: string; sourceAsOf: string | null;
  result?: { pending: boolean; need?: number; day0?: string; entry?: string; exit?: string; car?: number; net?: number; published?: string; source?: string };
}
export interface SeasonLedger { version: string; startedAt: string | null; entries: SeasonLedgerEntry[]; total: number; scored: number; summary: Record<string, { n: number; hitRate: number; meanNet: number; meanBacktestNet: number }>; rule: string }

/** AGM-v1 — kế hoạch ĐHĐCĐ. */
export interface PlanItem { status: "VERIFIED" | "REVIEW" | "ABSENT"; vnd?: number | null; basis?: string; value?: number; unit?: string; rowLabel?: string | null; quote?: string | null; page?: number | null; ratioPrior?: number | null; priorCheck?: { printed: number; statement: number; diff: number; match: boolean } | null; reason?: string | null; sameScope?: boolean }
export interface PlanView {
  year: number; approved: boolean; draft: boolean; doc: { url: string; title: string; date: string; kind: string }; models: string[]; at: string;
  items: Record<"revenue" | "pbt" | "npat", PlanItem>;
  attainment: { metric: "npat" | "pbt"; basis: string; plan: number; ytd: number; through: number; done: number; typical: number | null; pace: number | null; nowcastVsPlan: number | null } | null;
}
export interface KqkdRow {
  plan?: { approved: boolean; draft: boolean; metric: "npat" | "pbt" | null; done: number | null; pace: number | null; typical: number | null; nowcastVsPlan: number | null; verified: boolean } | null;
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
/** KQ-r1 — kiểm định đặt trước (ngoài mẫu 2020Q1–2026Q1). */
export interface KqEvidence {
  prereg: string; ranAt: string; note: string;
  sueCore: { pass: boolean; label: string; ic: number | null; p: number | null; spread: number | null; cohorts: number; vsNpat: { pass: boolean; diff: number | null; p: number | null } };
  nowcast: { pass: boolean; label: string; ic: number | null; p: number | null; spread: number | null; cohorts: number };
  accuracy: { pass: boolean; medianApe: number | null; medianApeNaive: number | null; coverage: number | null; target: [number, number]; n: number };
}
/** KQ-L1 — sổ theo dõi tiến của tăng trưởng ước tính cả năm. */
export interface KqLedgerCohort { quarter: string; recorded: number; recordedFrom: string; status: "SCORED" | "PENDING"; withReturn: number; ic: number | null; spread: number | null; accuracy: { n: number; medianApe: number | null; coverage: number | null } | null }
export interface KqLedger { version: string; asOf: string; entries: number; startedAt: string | null; cohorts: KqLedgerCohort[]; scoredCohorts: number; meanIc: number | null; meanSpread: number | null; rule: string }
export interface KqkdSummary {
  evidence?: KqEvidence | null;
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
  evidence?: KqEvidence | null;
  plan?: PlanView | null;
  reactions?: EsEvent[] | null;
  version: string; label: string; available: boolean; ticker: string; tpl: Tpl; tplLabel: string; asOf: string; fetchedAt: string | null; mcap?: number | null;
  latest: { fiscal: string; quarter: string; created: string; published?: string; publishedSource?: "DISCLOSURE" | "DATA" };
  metrics: { key: string; label: string }[]; matrix: Record<string, MatrixRow[]>;
  ratios: { grossMargin: RatioRow[]; coreMargin: RatioRow[]; netMargin: RatioRow[] };
  ttm: TtmPoint[]; dol: number | null; bridge: { quarter: Bridge; ytd: Bridge; ttm: Bridge | null };
  quality: Quality; qualitySeries: QualityPoint[];
  seasonality: { top: Season; npatParent: Season; core: Season };
  surprise: { sueNpat: number | null; sueCore: number | null; sur: number | null };
  space: { surface: { years: number[]; z: (number | null)[][]; color: (number | null)[][] }; trajectory: { quarter: string; x: number; y: number; z: number; npat: number | null }[] };
  flags: { id: FlagId; text: string }[]; method: { core: string; pit: string; label: string };
}
