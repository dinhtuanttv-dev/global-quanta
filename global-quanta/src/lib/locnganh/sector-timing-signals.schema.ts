// Port từ locnganh-timing-engine (ui/sector-rotation/sector-timing-signals.schema.ts).
import { z } from 'zod';
import type { Quadrant, SectorTimingAction, SectorTimingSignal, SectorTimingSignalsBulkV3 } from './types';

/**
 * Schema cho GET /api/locnganh/sector-timing-signals — một request cho CẢ vũ trụ ngành, dùng
 * trong LocNganhPanel/Top 20 thay vì gọi sector-cycle-stats riêng cho từng dòng bảng. Cùng
 * phong cách với timing-signals.schema.ts (cotuc-timing-engine): kiểm cả hợp đồng nghiệp vụ.
 */
export const SECTOR_TIMING_SIGNALS_LIMITS = { maxSignals: 100, maxAbsReturn: 1.5 } as const;

const ACTIONS: readonly SectorTimingAction[] = ['NO_DATE', 'POST_EX', 'NO_SIGNAL', 'TOO_EARLY', 'IN_WINDOW', 'WINDOW_PASSED'];
const QUADRANTS: readonly Quadrant[] = ['LEADING', 'IMPROVING', 'LAGGING', 'WEAKENING'];

const oneOf = <T extends string>(label: string, values: readonly T[]) =>
  z.string().refine((v): v is T => (values as readonly string[]).includes(v), { message: `${label} phải là một trong: ${values.join(', ')}` });

const ratio = (label: string) =>
  z
    .number()
    .refine((v) => Number.isFinite(v), { message: `${label} phải là số hữu hạn` })
    .refine((v) => Math.abs(v) <= SECTOR_TIMING_SIGNALS_LIMITS.maxAbsReturn, { message: `|${label}| vượt ${SECTOR_TIMING_SIGNALS_LIMITS.maxAbsReturn} (nghi sai đơn vị)` });

const unit = (label: string) => z.number().refine((v) => Number.isFinite(v) && v >= 0 && v <= 1, { message: `${label} phải trong [0, 1]` });

const windowSchema = z.object({ entryFrom: z.number().int(), entryTo: z.number().int(), exitOffset: z.number().int() }).nullable();

const reactionProbabilitySchema = z
  .object({ mean: unit('mean'), ci: z.array(unit('ci')).refine((a) => a.length === 2 && a[0] <= a[1], { message: 'ci phải là [thấp, cao] với thấp ≤ cao' }) })
  .nullable();

const sectorTimingSignalSchema = z
  .object({
    sectorKey: z.string().min(1).max(40),
    action: oneOf('action', ACTIONS),
    tdSinceTransition: z.number().int().nullable(),
    window: windowSchema,
    expectedNetReturn: ratio('expectedNetReturn').nullable(),
    nEvents: z.number().int().nullable(),
    fdrQValue: unit('fdrQValue').nullable(),
    confidence: oneOf('confidence', ['HIGH', 'MEDIUM', 'LOW'] as const).nullable(),
    reactionProbability: reactionProbabilitySchema,
  })
  // giữ trường mở rộng của Project A (decision, name, quadrant…) — hợp đồng gốc chỉ kiểm phần lõi
  .passthrough()
  .superRefine((v, ctx) => {
    const bad = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', message, path });
    if (v.window) {
      if (!(v.window.entryFrom <= v.window.entryTo)) bad(['window', 'entryFrom'], 'entryFrom phải ≤ entryTo');
      if (v.window.exitOffset < v.window.entryTo) bad(['window', 'exitOffset'], 'exitOffset không được sớm hơn entryTo');
    }
    if ((v.action === 'IN_WINDOW' || v.action === 'TOO_EARLY' || v.action === 'WINDOW_PASSED') && !v.window) {
      bad(['window'], `action = '${v.action}' nhưng window = null`);
    }
    if (v.action === 'NO_SIGNAL' && (v.window || v.reactionProbability)) {
      bad(['window'], "action = 'NO_SIGNAL' nhưng có window/reactionProbability (không được bịa khi chưa qua cổng thống kê)");
    }
  });

export const sectorTimingSignalsBulkV3Schema = z
  .object({
    version: z.string().min(1),
    asOf: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'phải là mốc thời gian ISO hợp lệ' }),
    signals: z.array(sectorTimingSignalSchema).max(SECTOR_TIMING_SIGNALS_LIMITS.maxSignals),
  })
  .passthrough()
  .superRefine((v, ctx) => {
    if (!Array.isArray(v.signals)) return;
    const seen = new Set<string>();
    v.signals.forEach((s, i) => {
      if (seen.has(s.sectorKey)) ctx.addIssue({ code: 'custom', message: `sectorKey trùng: ${s.sectorKey}`, path: ['signals', i, 'sectorKey'] });
      seen.add(s.sectorKey);
    });
  });

type Inferred = z.infer<typeof sectorTimingSignalsBulkV3Schema>;
const _parsedToDomain: (a: Inferred) => SectorTimingSignalsBulkV3 = (a) => a as SectorTimingSignalsBulkV3;
const _rowCheck: (a: z.infer<typeof sectorTimingSignalSchema>) => SectorTimingSignal = (a) => a as unknown as SectorTimingSignal; // zod 4: ci suy ra mảng, kiểu miền là bộ 2 phần tử
void _parsedToDomain;
void _rowCheck;

export function formatIssues(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>, max = 10): string[] {
  const out = issues.slice(0, max).map((i) => `${i.path.map(String).join('.') || '(gốc)'}: ${i.message}`);
  if (issues.length > max) out.push(`… và ${issues.length - max} lỗi khác`);
  return out;
}

export type ParseSectorTimingSignalsResult = { ok: true; data: SectorTimingSignalsBulkV3 } | { ok: false; issues: string[] };

export function parseSectorTimingSignals(raw: unknown): ParseSectorTimingSignalsResult {
  try {
    const r = sectorTimingSignalsBulkV3Schema.safeParse(raw);
    if (r.success) return { ok: true, data: r.data as SectorTimingSignalsBulkV3 };
    return { ok: false, issues: formatIssues(r.error.issues) };
  } catch (e) {
    return { ok: false, issues: [`(gốc): lỗi khi validate: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
