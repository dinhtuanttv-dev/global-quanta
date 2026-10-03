// Hợp đồng + tải "Timeline điểm mua tối ưu" từ Project A (GET /api/cotuc/buy-timeline): vùng mua có cơ sở thống kê theo ngày,
// gộp chu kỳ cổ tức và mùa vụ KQKD, hai bậc tách bạch (VALIDATED đạt kiểm định / NEAR gần đạt + điều kiện còn thiếu).
import { z } from 'zod';
import { defaultBaseUrl } from './cycle-paths.api';
import { fetchValidatedJson, type FetchJsonOptions } from './http-json';
import { formatIssues } from './seasonality.schema';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const rowSchema = z.object({
  id: z.string(),
  ticker: z.string().min(1),
  sector: z.string().nullable(),
  kind: z.enum(['DIVIDEND', 'EARNINGS']),
  tier: z.enum(['VALIDATED', 'NEAR']),
  status: z.enum(['UPCOMING', 'IN_WINDOW', 'PASSED']),
  eventLabel: z.string(),
  eventDate: isoDate,
  eventDateBasis: z.string(),
  windowId: z.string(),
  windowLabel: z.string(),
  entryFrom: z.number(),
  entryTo: z.number(),
  exitOffset: z.number(),
  entryFromDate: isoDate,
  entryToDate: isoDate,
  exitDate: isoDate,
  sessionsToEntry: z.number(),
  nEvents: z.number().int().nonnegative(),
  winRate: z.number().min(0).max(1),
  probability: z.number().min(0).max(1).nullable(),
  netExpectancy: z.number(),
  netExpectancyLcb: z.number(),
  fdrQValue: z.number(),
  decisionLevel: z.enum(['FAVORABLE', 'WATCH', 'AVOID']).nullable(),
  missing: z.array(z.string()),
});
const timelineSchema = z.object({
  today: isoDate,
  asOf: z.object({ decisions: z.string().nullable(), seasonality: z.string().nullable() }),
  coverage: z.object({ decisions: z.number(), seasonality: z.number(), universe: z.number() }),
  counts: z.object({ validated: z.number(), near: z.number(), inWindow: z.number(), upcoming: z.number() }),
  rows: z.array(z.unknown()),
});

export type TimelineRow = z.infer<typeof rowSchema>;
export interface BuyTimeline extends Omit<z.infer<typeof timelineSchema>, 'rows'> { rows: TimelineRow[]; dropped: number }

/** Vỏ kiểm nghiêm ngặt; từng dòng sai hợp đồng bị bỏ riêng (không làm hỏng cả timeline). */
export function parseBuyTimeline(raw: unknown): { ok: true; data: BuyTimeline } | { ok: false; issues: string[] } {
  const env = timelineSchema.safeParse(raw);
  if (!env.success) return { ok: false, issues: formatIssues(env.error.issues) };
  const rows: TimelineRow[] = [];
  let dropped = 0;
  for (const r of env.data.rows) {
    const p = rowSchema.safeParse(r);
    if (p.success) rows.push(p.data);
    else dropped++;
  }
  return { ok: true, data: { ...env.data, rows, dropped } };
}

export const buildBuyTimelineUrl = (base = defaultBaseUrl()) => `${base.replace(/\/+$/, '')}/api/cotuc/buy-timeline`;
export const fetchBuyTimeline = (opts: FetchJsonOptions & { baseUrl?: string } = {}) =>
  fetchValidatedJson(buildBuyTimelineUrl(opts.baseUrl), parseBuyTimeline, 'buy-timeline', opts);
