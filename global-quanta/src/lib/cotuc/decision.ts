// Hợp đồng + tải dữ liệu Bộ máy quyết định 3 trạng thái (Timing Engine v3 giai đoạn 4) từ Project A:
//   GET /api/cotuc/decision-states   -> DecisionSnapshot cả danh mục (cron timing-signals-scan tính từ giá SSI)
//   GET /api/cotuc/signal-tracking   -> theo dõi tín hiệu thực tế (tỷ lệ đúng, Brier, CUSUM, bản ghi gần nhất)
// Trình duyệt KHÔNG tự tính quyết định — chỉ hiển thị đúng ảnh chụp mà server đã ghi vào sổ theo dõi.
import { z } from 'zod';
import { defaultBaseUrl } from './cycle-paths.api';
import { fetchValidatedJson, type FetchJsonOptions } from './http-json';
import { formatIssues } from './seasonality.schema';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const level = z.enum(['FAVORABLE', 'WATCH', 'AVOID']);
const action = z.enum(['NO_DATE', 'POST_EX', 'NO_SIGNAL', 'TOO_EARLY', 'IN_WINDOW', 'WINDOW_PASSED']);

const checkSchema = z.object({ key: z.string(), label: z.string(), passed: z.boolean().nullable(), detail: z.string() });

export const decisionSnapshotSchema = z.object({
  version: z.string(),
  ticker: z.string().min(1),
  asOf: isoDate,
  priceDate: isoDate.nullable(),
  exDate: z.object({ value: isoDate, status: z.enum(['CONFIRMED', 'ANNOUNCED', 'ESTIMATED']), label: z.string() }).nullable(),
  recommendation: z.object({
    action,
    tdToEx: z.number().nullable(),
    window: z.object({ id: z.string(), label: z.string(), entryFrom: z.number(), entryTo: z.number(), exitOffset: z.number() }).nullable(),
    expectedNetReturn: z.number().nullable(),
    nEvents: z.number().nullable(),
    confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']).nullable(),
  }),
  decision: z.object({
    level,
    headline: z.string(),
    checks: z.array(checkSchema),
    combinedProbability: z.number().min(0).max(1),
    disclaimer: z.literal('NOT_INVESTMENT_ADVICE'),
  }),
  combined: z.object({ probability: z.number(), probabilityBeforeShrink: z.number(), totalWeight: z.number() }),
  signals: z.array(z.object({ name: z.string(), used: z.boolean(), probability: z.number().nullable(), weight: z.number(), detail: z.string() })),
  regime: z.object({ regime: z.enum(['RISK_ON', 'NEUTRAL', 'RISK_OFF']), belowMa: z.boolean().nullable(), volatilityPercentile: z.number().nullable(), reasons: z.array(z.string()) }),
  entryPlan: z.object({
    tranches: z.array(z.object({ offset: z.number(), fraction: z.number() })),
    runTooFar: z.object({ percentile: z.number().nullable(), hasRunTooFar: z.boolean() }),
    pauseFurtherEntries: z.boolean(),
  }),
  currentCar: z.number().nullable(),
  liquidity: z.object({ avgValue20: z.number().nullable(), threshold: z.number(), ok: z.boolean().nullable() }),
  earnings: z.object({ quarterLabel: z.string(), expectedAnnounce: isoDate, tdToEarnings: z.number().nullable() }).nullable(),
});

const decisionStatesSchema = z.object({ asOf: z.string().nullable(), count: z.number().int().nonnegative(), states: z.array(decisionSnapshotSchema) });

const cusumSchema = z.object({ posSum: z.number(), negSum: z.number(), n: z.number(), alarmed: z.boolean(), alarmDirection: z.enum(['HIGH', 'LOW']).nullable() });
export const trackingSummarySchema = z.object({
  totalSignals: z.number().int().nonnegative(),
  resolvedSignals: z.number().int().nonnegative(),
  rollingAccuracy: z.number().nullable(),
  rollingWindowSize: z.number().optional(),
  brierScore: z.number().nullable(),
  cusum: cusumSchema,
  meanPredicted: z.number().nullable(),
  byLevel: z.array(z.object({ level, total: z.number(), resolved: z.number(), hitRate: z.number().nullable() })),
});
const trackRowSchema = z.object({
  id: z.string(), ticker: z.string(), windowId: z.string(), level, predictedProbability: z.number(), exDate: isoDate, exDateStatus: z.string(),
  entryDate: isoDate, plannedExitDate: isoDate, issuedAt: z.string(), outcome: z.union([z.literal(0), z.literal(1)]).nullable(),
  realizedCar: z.number().nullable(), exitDate: isoDate.nullable(), outcomeRecordedAt: z.string().nullable(),
});
const signalTrackingSchema = z.object({ summary: trackingSummarySchema, recent: z.array(trackRowSchema) });

export type DecisionSnapshot = z.infer<typeof decisionSnapshotSchema>;
export type DecisionLevel = z.infer<typeof level>;
export type DecisionStates = z.infer<typeof decisionStatesSchema>;
export type TrackingSummary = z.infer<typeof trackingSummarySchema>;
export type TrackRow = z.infer<typeof trackRowSchema>;
export type SignalTracking = z.infer<typeof signalTrackingSchema>;

function parseWith<T>(schema: z.ZodType, raw: unknown): { ok: true; data: T } | { ok: false; issues: string[] } {
  const r = schema.safeParse(raw);
  return r.success ? { ok: true, data: r.data as T } : { ok: false, issues: formatIssues(r.error.issues) };
}
export const parseDecisionStates = (raw: unknown) => parseWith<DecisionStates>(decisionStatesSchema, raw);
export const parseSignalTracking = (raw: unknown) => parseWith<SignalTracking>(signalTrackingSchema, raw);

export const buildDecisionStatesUrl = (base = defaultBaseUrl()) => `${base.replace(/\/+$/, '')}/api/cotuc/decision-states`;
export const buildSignalTrackingUrl = (base = defaultBaseUrl()) => `${base.replace(/\/+$/, '')}/api/cotuc/signal-tracking`;

export const fetchDecisionStates = (opts: FetchJsonOptions & { baseUrl?: string } = {}) =>
  fetchValidatedJson(buildDecisionStatesUrl(opts.baseUrl), parseDecisionStates, 'decision-states', opts);
export const fetchSignalTracking = (opts: FetchJsonOptions & { baseUrl?: string } = {}) =>
  fetchValidatedJson(buildSignalTrackingUrl(opts.baseUrl), parseSignalTracking, 'signal-tracking', opts);
