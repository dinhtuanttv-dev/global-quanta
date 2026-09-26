import { z } from 'zod';
import type { ConflictKind, TimingAction } from '../quant-cotuc';
import type { TimingSignal, TimingSignalsBulkV3 } from './timing-types';

/**
 * Schema cho GET /api/cotuc/timing-signals (mục 12.1 tài liệu v3: bulk endpoint cho cả vũ trụ,
 * một request thay vì gọi cycle-stats riêng cho từng mã). Cùng phong cách với
 * cycle-paths.schema.ts/cycle-stats.schema.ts: kiểm cả hợp đồng nghiệp vụ, không chỉ kiểu.
 */
export const TIMING_SIGNALS_LIMITS = {
  /** VN30+VN100+... — 300 đủ dư cho vũ trụ hiện tại, chặn payload bất thường lớn. */
  maxSignals: 300,
  maxAbsReturn: 1.5,
} as const;

export const TICKER_RE = /^[A-Z0-9]{1,12}$/;

const ACTIONS: readonly TimingAction[] = ['NO_DATE', 'POST_EX', 'NO_SIGNAL', 'TOO_EARLY', 'IN_WINDOW', 'WINDOW_PASSED'];
const CONFLICTS: readonly ConflictKind[] = ['NONE', 'NEAR_EX', 'INSIDE_HOLD'];

const oneOf = <T extends string>(label: string, values: readonly T[]) =>
  z.string().refine((v): v is T => (values as readonly string[]).includes(v), {
    message: `${label} phải là một trong: ${values.join(', ')}`,
  });

const ratio = (label: string) =>
  z
    .number()
    .refine((v) => Number.isFinite(v), { message: `${label} phải là số hữu hạn` })
    .refine((v) => Math.abs(v) <= TIMING_SIGNALS_LIMITS.maxAbsReturn, {
      message: `|${label}| vượt ${TIMING_SIGNALS_LIMITS.maxAbsReturn} (nghi sai đơn vị: cần tỷ lệ, không phải %)`,
    });

const windowSchema = z
  .object({ entryFrom: z.number().int(), entryTo: z.number().int(), exitOffset: z.number().int() })
  .nullable();

const earningsSchema = z
  .object({
    revenueGrowthYoY: ratio('revenueGrowthYoY').nullable(),
    profitGrowthYoY: ratio('profitGrowthYoY').nullable(),
    conflict: oneOf('conflict', CONFLICTS),
  })
  .nullable();

const timingSignalSchema = z
  .object({
    ticker: z.string().regex(TICKER_RE, 'mã phải là chữ hoa/số, 1–12 ký tự'),
    action: oneOf('action', ACTIONS),
    tdToEx: z.number().int().nullable(),
    window: windowSchema,
    expectedNetReturn: ratio('expectedNetReturn').nullable(),
    nEvents: z.number().int().nullable(),
    fdrQValue: z
      .number()
      .refine((v) => Number.isFinite(v) && v >= 0 && v <= 1, { message: 'fdrQValue phải trong [0, 1]' })
      .nullable(),
    confidence: oneOf('confidence', ['HIGH', 'MEDIUM', 'LOW'] as const).nullable(),
    dateStatus: oneOf('dateStatus', ['CONFIRMED', 'ANNOUNCED', 'ESTIMATED'] as const).nullable(),
    earnings: earningsSchema,
  })
  .superRefine((v, ctx) => {
    const bad = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', message, path });
    // Quy ước dấu mục 2.2: entryFrom <= entryTo <= 0.
    if (v.window) {
      if (!(v.window.entryFrom <= v.window.entryTo)) bad(['window', 'entryFrom'], 'entryFrom phải ≤ entryTo');
      if (v.window.entryTo > 0) bad(['window', 'entryTo'], 'entryTo phải ≤ 0 (trước hoặc đúng GDKHQ)');
      if (v.window.exitOffset < v.window.entryTo) bad(['window', 'exitOffset'], 'exitOffset không được sớm hơn entryTo');
    }
    // action là IN_WINDOW/TOO_EARLY/WINDOW_PASSED chỉ có ý nghĩa khi có window đã chọn.
    if ((v.action === 'IN_WINDOW' || v.action === 'TOO_EARLY' || v.action === 'WINDOW_PASSED') && !v.window) {
      bad(['window'], `action = '${v.action}' nhưng window = null (thiếu cửa sổ đã chọn)`);
    }
    if (v.action === 'NO_SIGNAL' && v.window) {
      bad(['window'], "action = 'NO_SIGNAL' nhưng window khác null (mục 5.6: không chọn cửa sổ khi chưa qua cổng)");
    }
  });

export const timingSignalsBulkV3Schema = z
  .object({
    version: z.string().min(1),
    asOf: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'phải là mốc thời gian ISO hợp lệ' }),
    signals: z.array(timingSignalSchema).max(TIMING_SIGNALS_LIMITS.maxSignals),
  })
  .superRefine((v, ctx) => {
    if (!Array.isArray(v.signals)) return;
    const seen = new Set<string>();
    v.signals.forEach((s, i) => {
      if (seen.has(s.ticker)) ctx.addIssue({ code: 'custom', message: `ticker trùng: ${s.ticker}`, path: ['signals', i, 'ticker'] });
      seen.add(s.ticker);
    });
  });

/** Giữ schema và kiểu miền (types.ts) đồng bộ: lệch một trong hai chiều sẽ báo lỗi biên dịch. */
type Inferred = z.infer<typeof timingSignalsBulkV3Schema>;
const _parsedToDomain: (a: Inferred) => TimingSignalsBulkV3 = (a) => a as TimingSignalsBulkV3;
const _domainToParsed: (a: TimingSignalsBulkV3) => Inferred = (a) => a as Inferred;
const _rowCheck: (a: z.infer<typeof timingSignalSchema>) => TimingSignal = (a) => a;
void _parsedToDomain;
void _domainToParsed;
void _rowCheck;

export function formatIssues(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>, max = 10): string[] {
  const out = issues.slice(0, max).map((i) => `${i.path.map(String).join('.') || '(gốc)'}: ${i.message}`);
  if (issues.length > max) out.push(`… và ${issues.length - max} lỗi khác`);
  return out;
}

export type ParseTimingSignalsResult = { ok: true; data: TimingSignalsBulkV3 } | { ok: false; issues: string[] };

export function parseTimingSignals(raw: unknown): ParseTimingSignalsResult {
  try {
    const r = timingSignalsBulkV3Schema.safeParse(raw);
    if (r.success) return { ok: true, data: r.data as TimingSignalsBulkV3 };
    return { ok: false, issues: formatIssues(r.error.issues) };
  } catch (e) {
    return { ok: false, issues: [`(gốc): lỗi khi validate: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
