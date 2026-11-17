// PFA-v1 (17/11/2026) — hợp đồng dữ liệu Gateway /api/elite/profile-fa/* (Hồ sơ 360° · Doanh nghiệp & Sự kiện).
// Mọi số đến từ engine có sẵn trên Gateway (KQKD, cổ tức DS/DQ/FM, sự kiện CE-v1, Săn cổ tức TO-v1), khoá theo phiên bảng tín hiệu E1.
export interface PfaYoY { value: number | null; status: string }
export interface PfaTest { id: string; label: string; pass: boolean | null }
export interface PfaEarnings {
  available: boolean; reasonVi?: string; quarter?: string; fiscal?: string | null; published?: string | null; publishedSource?: string | null; tpl?: string | null; financial?: boolean;
  npatTtm?: number | null; topTtm?: number | null; epsTtm?: number | null; npatYoY?: PfaYoY | null; coreYoY?: PfaYoY | null; topYoY?: PfaYoY | null; ytd?: PfaYoY | null; ttmGrowth?: PfaYoY | null;
  netMarginTtm?: number | null; roe?: number | null; nonCoreShare?: number | null;
  piotroski?: { score: number | null; of: number; tests: PfaTest[] } | null; beneish?: { m: number; flag: boolean } | null; altman?: { z: number; zone: string | null } | null;
  accrual?: number | null; cfoToNpat?: number | null; kpi?: { debtToEquity?: number | null; interestCover?: number | null; netDebtToEbitda?: number | null } | null;
  surprise?: { sueNpat: number | null; sueCore: number | null }; nowcast?: { growth: number | null; est: number | null; lo: number | null; hi: number | null; cumShare: number | null } | null;
  seasonDev?: number | null; flags?: string[]; na?: string[];
  evidence?: { prereg: string | null; nowcast: { pass: boolean; label: string; ic: number; p: number } | null; sue: { pass: boolean; label: string; ic: number; p: number } | null } | null;
}
export interface PfaCalRow { label: string; status: string | null; date: string | null; expected: string | null; band: [string, string] | null; medianLag: number | null; lateShare: number | null; ownN: number | null }
export interface PfaDividend {
  available: boolean; reasonVi?: string; price?: number | null; yieldGross?: number | null; yieldNet?: number | null; ttmCash?: number | null; payments12m?: number | null; stockPct12m?: number | null;
  lastEx?: string | null; lastCash?: number | null; lastFy?: number | null; lastFyCash?: number | null; streak?: number | null; cagr3?: number | null; cuts5?: number | null; years5?: number | null; history?: [number, number][];
  payout?: number | null; fcfCover?: number | null; pe?: number | null; pb?: number | null;
  exStudy?: { n: number; dropMedian: number | null; fillWithin20: number | null; fillDaysMedian: number | null } | null;
  quality?: { version: string | null; yield: { fy?: number | null; ttm?: number | null; median3?: number | null; company?: number | null } | null; company: { years?: number; payout5?: number | null; fcfCover5?: number | null; streak?: number; cuts10?: number; lossYears10?: number } | null;
    lintner: { ok: boolean; speed: number | null; targetPayout: number | null; r2: number | null; n: number | null } | null; nextYield: number | null; checks: PfaTest[]; checksPassed: number | null; checksKnown: number | null;
    risk: unknown; trap: unknown } | null;
  fm?: { version: string | null; label: string | null; score: number | null; groups: Record<string, number | null> | null; rank: number | null; of: number | null; quintile: number | null } | null;
}
export interface PfaEvent { cat: string; group: string; label: string; title: string | null; disclosed: string | null; ex: string | null; record: string | null; pay: string | null; meeting: string | null; date: string | null; cash: number | null; ratio: number | null; leadDays: number | null; sessionsAway: number | null }
export interface PfaTo { available: boolean; sector?: string | null; done?: number; hitRate?: number | null; events?: { ex: string; disclosed: string | null; yield: number | null; bucket: string | null; qualifies: boolean; entryDate: string | null; exitDate: string | null; excess: number | null; postEx5: number | null; runUp: number | null }[] }
export interface PfaWarning { id: string; level: "warn" | "info"; text: string; source: string }
export interface ProfileFa {
  version: string; asOf: string; builtAt?: string; ticker: string; missing?: boolean;
  rules?: Record<string, number>; sources?: Record<string, string | null>;
  earnings?: PfaEarnings; calendar?: { current: PfaCalRow | null; next: PfaCalRow | null }; dividend?: PfaDividend;
  events?: { upcoming: PfaEvent[]; recent: PfaEvent[]; status: PfaEvent[] }; to?: PfaTo; warnings?: PfaWarning[];
}
export interface ProfileFaWarnings { version: string; asOf: string; builtAt: string; tickers: Record<string, PfaWarning[]> }
