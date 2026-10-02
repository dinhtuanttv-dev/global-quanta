import { z } from 'zod';
import type { AnnualEarningsCalendarV3, BetaPosterior, EarningsCycleStatsV3 } from './timing-types';
import { TICKER_RE, backtestWindowSchema } from './cycle-stats.schema';

/**
 * Schema cho hai endpoint mới của tính năng "Mùa vụ KQKD":
 *   GET /api/cotuc/earnings-cycle-stats?ticker=&quarter=1..4   → EarningsCycleStatsV3
 *   GET /api/cotuc/annual-earnings-calendar?ticker=            → AnnualEarningsCalendarV3
 * (đường CAR dùng lại nguyên schema CyclePathsV3 ở cycle-paths.schema.ts).
 *
 * Kiểm tra cả hợp đồng nghiệp vụ, không chỉ kiểu: hậu nghiệm Beta phải nhất quán nội tại
 * (mean = α/(α+β), ci chứa mean, ci trong [0,1]) — backend gửi sai là dấu hiệu công thức hỏng.
 */
const unit = (label: string) =>
  z.number().refine((v) => Number.isFinite(v) && v >= 0 && v <= 1, { message: `${label} phải trong [0, 1]` });

const betaPosteriorSchema = z
  .object({
    alpha: z.number().refine((v) => Number.isFinite(v) && v > 0, { message: 'alpha phải > 0' }),
    beta: z.number().refine((v) => Number.isFinite(v) && v > 0, { message: 'beta phải > 0' }),
    mean: unit('mean'),
    ci: z.array(unit('ci')).refine((a) => a.length === 2, { message: 'ci phải có đúng 2 phần tử [thấp, cao]' }),
    level: z.number().refine((v) => v > 0 && v < 1, { message: 'level phải trong (0, 1)' }),
  })
  .superRefine((v, ctx) => {
    const bad = (path: string[], message: string) => ctx.addIssue({ code: 'custom', message, path });
    if (typeof v.alpha === 'number' && typeof v.beta === 'number' && typeof v.mean === 'number') {
      const expected = v.alpha / (v.alpha + v.beta);
      if (Math.abs(expected - v.mean) > 1e-6) bad(['mean'], `mean ${v.mean} không khớp alpha/(alpha+beta) = ${expected}`);
    }
    if (Array.isArray(v.ci) && v.ci.length === 2 && typeof v.mean === 'number') {
      if (!(v.ci[0] <= v.ci[1])) bad(['ci'], 'ci[0] phải ≤ ci[1]');
      if (v.mean < v.ci[0] - 1e-9 || v.mean > v.ci[1] + 1e-9) bad(['ci'], 'ci phải chứa mean');
    }
  });

const quarterSchema = z.number().refine((v) => v === 1 || v === 2 || v === 3 || v === 4, { message: 'quarter phải là 1, 2, 3 hoặc 4' });

const isoTimestamp = z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'phải là mốc thời gian ISO hợp lệ' });

export const earningsCycleStatsV3Schema = z
  .object({
    ticker: z.string().regex(TICKER_RE, 'mã phải là chữ hoa/số, 1–12 ký tự'),
    version: z.string().min(1),
    asOf: isoTimestamp,
    eventType: z.string(),
    quarter: quarterSchema,
    windows: z.array(backtestWindowSchema).max(50),
    selectedWindowId: z.string().nullable(),
    adjustedPriceBasis: z.string(),
    benchmark: z.string(),
    reactionProbability: betaPosteriorSchema.nullable(),
  })
  .superRefine((v, ctx) => {
    const bad = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', message, path });
    if (v.eventType !== 'EARNINGS') bad(['eventType'], `chỉ hỗ trợ 'EARNINGS', nhận '${v.eventType}'`);
    if (v.adjustedPriceBasis !== 'ADJ_CLOSE') bad(['adjustedPriceBasis'], `chỉ hỗ trợ 'ADJ_CLOSE'`);
    if (v.benchmark !== 'VNINDEX' && v.benchmark !== 'SECTOR') bad(['benchmark'], `chỉ hỗ trợ 'VNINDEX'/'SECTOR'`);
    if (!Array.isArray(v.windows)) return;
    const selected = v.selectedWindowId === null ? null : v.windows.find((w) => w.id === v.selectedWindowId);
    if (v.selectedWindowId !== null && !selected) bad(['selectedWindowId'], `không khớp id cửa sổ nào: ${v.selectedWindowId}`);
    if (selected && !selected.selected) bad(['selectedWindowId'], `trỏ tới cửa sổ '${selected.id}' nhưng selected = false`);
    // Ràng buộc nghiệp vụ cốt lõi: có cửa sổ được chọn ⇔ có xác suất phản ứng (không bịa số khi NO_SIGNAL).
    if (v.selectedWindowId === null && v.reactionProbability !== null) {
      bad(['reactionProbability'], 'selectedWindowId = null nhưng có reactionProbability (không được bịa xác suất khi không có tín hiệu)');
    }
    if (v.selectedWindowId !== null && v.reactionProbability === null) {
      bad(['reactionProbability'], 'có cửa sổ được chọn nhưng thiếu reactionProbability');
    }
  });

const announceModelSchema = z
  .object({
    mu: z.number().refine(Number.isFinite, { message: 'mu phải hữu hạn' }),
    scale: z.number().refine((v) => Number.isFinite(v) && v > 0, { message: 'scale phải > 0' }),
    dof: z.number().refine((v) => Number.isFinite(v) && v > 0, { message: 'dof phải > 0' }),
    n: z.number().int(),
    ci90: z.array(z.number()).refine((a) => a.length === 2 && a[0] <= a[1], { message: 'ci90 phải là [thấp, cao] với thấp ≤ cao' }),
  })
  .optional();

const quarterSeasonalitySchema = z.object({
  quarter: quarterSchema,
  typicalAnnounceMonth: z.number().int().refine((v) => v >= 1 && v <= 12, { message: 'tháng phải trong 1..12' }),
  announceMonthStd: z.number().refine((v) => Number.isFinite(v) && v >= 0, { message: 'độ lệch chuẩn phải ≥ 0' }),
  reactionProbability: betaPosteriorSchema.nullable(),
  nEvents: z.number().int().refine((v) => v >= 0, { message: 'nEvents phải ≥ 0' }),
  dataStatus: z.string().refine((v) => v === 'CONFIRMED' || v === 'ANNOUNCED' || v === 'ESTIMATED', { message: 'dataStatus không hợp lệ' }),
  announceModel: announceModelSchema,
});

export const annualEarningsCalendarV3Schema = z
  .object({
    ticker: z.string().regex(TICKER_RE, 'mã phải là chữ hoa/số, 1–12 ký tự'),
    version: z.string().min(1),
    asOf: isoTimestamp,
    quarters: z.array(quarterSeasonalitySchema),
  })
  .superRefine((v, ctx) => {
    if (!Array.isArray(v.quarters)) return;
    if (v.quarters.length !== 4) {
      ctx.addIssue({ code: 'custom', message: `phải có đúng 4 quý, nhận ${v.quarters.length}`, path: ['quarters'] });
      return;
    }
    v.quarters.forEach((q, i) => {
      if (q.quarter !== i + 1) {
        ctx.addIssue({ code: 'custom', message: `quý thứ ${i + 1} phải có quarter = ${i + 1}, nhận ${q.quarter}`, path: ['quarters', i, 'quarter'] });
      }
    });
  });

type _P = z.infer<typeof betaPosteriorSchema>;
const _betaCheck: (a: _P) => BetaPosterior = (a) => a as BetaPosterior;
type _E = z.infer<typeof earningsCycleStatsV3Schema>;
const _e: (a: _E) => EarningsCycleStatsV3 = (a) => a as unknown as EarningsCycleStatsV3;
type _A = z.infer<typeof annualEarningsCalendarV3Schema>;
const _a: (a: _A) => AnnualEarningsCalendarV3 = (a) => a as unknown as AnnualEarningsCalendarV3;
void _betaCheck;
void _e;
void _a;

export function formatIssues(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>, max = 10): string[] {
  const out = issues.slice(0, max).map((i) => `${i.path.map(String).join('.') || '(gốc)'}: ${i.message}`);
  if (issues.length > max) out.push(`… và ${issues.length - max} lỗi khác`);
  return out;
}

export type ParseResult<T> = { ok: true; data: T } | { ok: false; issues: string[] };

// zod v4 (thư viện thật): issue.path là PropertyKey[] (có thể chứa symbol) — nhận ZodType chung thay cho kiểu shim của gói.
function safe<T>(schema: z.ZodType, raw: unknown): ParseResult<T> {
  try {
    const r = schema.safeParse(raw);
    if (r.success) return { ok: true, data: r.data as T };
    return { ok: false, issues: formatIssues(r.error.issues) };
  } catch (e) {
    return { ok: false, issues: [`(gốc): lỗi khi validate: ${e instanceof Error ? e.message : String(e)}`] };
  }
}

export const parseEarningsCycleStats = (raw: unknown) => safe<EarningsCycleStatsV3>(earningsCycleStatsV3Schema, raw);
export const parseAnnualEarningsCalendar = (raw: unknown) => safe<AnnualEarningsCalendarV3>(annualEarningsCalendarV3Schema, raw);
