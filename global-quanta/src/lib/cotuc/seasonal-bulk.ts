// Hợp đồng + tải dữ liệu TỔNG HỢP toàn danh mục của Project A cho tab Cổ tức:
//   GET /api/cotuc/earnings-signals          -> EarningsSignal cả danh mục (mục "Sắp KQKD", kỳ KQKD tới của từng mã)
//   GET /api/cotuc/seasonal-opportunities    -> cơ hội mùa vụ đã đạt kiểm định + ứng viên gần đạt
// Dùng chung tầng fetch của gói (http-json.ts: 404 -> null, timeout, phân loại lỗi thử lại) và schema zod.
import { z } from 'zod';
import type { EarningsSignal, Quarter, SeasonalOpportunity } from './timing-types';
import { defaultBaseUrl } from './cycle-paths.api';
import { fetchValidatedJson, type FetchJsonOptions } from './http-json';
import { formatIssues } from './seasonality.schema';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const earningsSignalSchema = z.object({
  ticker: z.string().min(1),
  isBank: z.boolean(),
  quarterLabel: z.string().regex(/^Q[1-4]\/\d{4}$/),
  legalDeadline: isoDate,
  expectedAnnounce: z.object({
    date: isoDate,
    method: z.enum(['CONFIRMED', 'HISTORICAL_LAG', 'DEADLINE_ONLY']),
    lagStdDays: z.number().nullable(),
  }),
  sue: z.number().nullable(),
  revenueGrowthYoY: z.number().nullable(),
  profitGrowthYoY: z.number().nullable(),
  profitTtmGrowthYoY: z.number().nullable(),
  extraordinaryShare: z.number().nullable(),
  quality: z.enum(['OK', 'THIN_HISTORY', 'NEGATIVE_BASE', 'DISTORTED']),
  version: z.string(),
  asOf: z.string(),
});

const earningsSignalsBulkSchema = z.object({
  generatedAt: z.string().nullable(),
  count: z.number().int().nonnegative(),
  signals: z.array(earningsSignalSchema),
});

const windowRef = z.object({ entryFrom: z.number(), entryTo: z.number(), exitOffset: z.number() });
const quarter = z.number().int().min(1).max(4).transform((q) => q as Quarter);
const opportunitySchema = z.object({
  ticker: z.string(), quarter, reactionProbabilityLowerBound: z.number(), reactionProbabilityMean: z.number(),
  expectedNetReturn: z.number(), nEvents: z.number().int(), window: windowRef,
});
const watchItemSchema = z.object({
  ticker: z.string(), quarter, windowId: z.string(), label: z.string(), nEvents: z.number().int(),
  netExpectancy: z.number(), netExpectancyLcb: z.number(), winRate: z.number(), fdrQValue: z.number(), missing: z.array(z.string()),
});
const opportunitiesSchema = z.object({
  asOf: z.string().nullable(),
  tickers: z.number().int().nonnegative(),
  opportunities: z.array(opportunitySchema),
  watchlist: z.array(watchItemSchema),
});

export type EarningsSignalsBulk = { generatedAt: string | null; count: number; signals: EarningsSignal[] };
export type WatchItem = z.infer<typeof watchItemSchema>;
export type SeasonalOpportunitiesV3 = { asOf: string | null; tickers: number; opportunities: SeasonalOpportunity[]; watchlist: WatchItem[] };

function parseWith<T>(schema: z.ZodType, raw: unknown): { ok: true; data: T } | { ok: false; issues: string[] } {
  const r = schema.safeParse(raw);
  return r.success ? { ok: true, data: r.data as T } : { ok: false, issues: formatIssues(r.error.issues) };
}
export const parseEarningsSignalsBulk = (raw: unknown) => parseWith<EarningsSignalsBulk>(earningsSignalsBulkSchema, raw);
export const parseSeasonalOpportunities = (raw: unknown) => parseWith<SeasonalOpportunitiesV3>(opportunitiesSchema, raw);

export const buildEarningsSignalsUrl = (base = defaultBaseUrl()) => `${base.replace(/\/+$/, '')}/api/cotuc/earnings-signals`;
export const buildSeasonalOpportunitiesUrl = (base = defaultBaseUrl()) => `${base.replace(/\/+$/, '')}/api/cotuc/seasonal-opportunities`;

export const fetchEarningsSignalsBulk = (opts: FetchJsonOptions & { baseUrl?: string } = {}) =>
  fetchValidatedJson(buildEarningsSignalsUrl(opts.baseUrl), parseEarningsSignalsBulk, 'earnings-signals', opts);
export const fetchSeasonalOpportunities = (opts: FetchJsonOptions & { baseUrl?: string } = {}) =>
  fetchValidatedJson(buildSeasonalOpportunitiesUrl(opts.baseUrl), parseSeasonalOpportunities, 'seasonal-opportunities', opts);

/** "Q3/2026" -> 3 */
export function quarterOfLabel(label: string | null | undefined): Quarter | null {
  const m = /^Q([1-4])\//.exec(label ?? '');
  return m ? (Number(m[1]) as Quarter) : null;
}
