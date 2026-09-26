import { z } from 'zod';
import type { BacktestWindow, CycleStatsV3 } from './timing-types';

/**
 * Schema zod cho GET /api/cotuc/cycle-stats?ticker=XYZ (CycleStatsV3, mục 4.2 tài liệu v3).
 * Cùng phong cách với cycle-paths.schema.ts: không chỉ kiểm tra kiểu mà kiểm tra hợp đồng —
 * ví dụ entryFrom ≤ entryTo ≤ 0 (quy ước dấu mục 2.2), selectedWindowId phải trỏ tới một
 * cửa sổ CÓ selected = true (mục 5.6: không được "chọn" một cửa sổ chưa qua cổng thống kê).
 */
export const CYCLE_STATS_LIMITS = {
  maxWindows: 50,
  /** |CAR|, |kỳ vọng ròng| là tỷ lệ; trên ngưỡng này gần như chắc chắn sai đơn vị (%). */
  maxAbsReturn: 1.5,
} as const;

export const TICKER_RE = /^[A-Z0-9]{1,12}$/;

const ratio = (label: string) =>
  z
    .number()
    .refine((v) => Number.isFinite(v), { message: `${label} phải là số hữu hạn` })
    .refine((v) => Math.abs(v) <= CYCLE_STATS_LIMITS.maxAbsReturn, {
      message: `|${label}| vượt ${CYCLE_STATS_LIMITS.maxAbsReturn} (nghi sai đơn vị: cần tỷ lệ, không phải %)`,
    });

const unitInterval = (label: string) =>
  z
    .number()
    .refine((v) => Number.isFinite(v) && v >= 0 && v <= 1, { message: `${label} phải trong [0, 1]` });

const offsetInt = z.number().int();

const backtestWindowSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  entryFrom: offsetInt,
  entryTo: offsetInt,
  exitOffset: offsetInt,
  holdsThroughEx: z.boolean(),
  nEvents: z.number().int(),
  nEff: z.number(),
  meanCarRaw: ratio('meanCarRaw'),
  meanCarShrunk: ratio('meanCarShrunk'),
  netExpectancy: ratio('netExpectancy'),
  netExpectancyLcb: ratio('netExpectancyLcb'),
  winRate: unitInterval('winRate'),
  oosHitRate: unitInterval('oosHitRate').nullable(),
  oosMeanNet: ratio('oosMeanNet').nullable(),
  fdrQValue: unitInterval('fdrQValue'),
  selected: z.boolean(),
});

export const cycleStatsV3Schema = z
  .object({
    ticker: z.string().regex(TICKER_RE, 'mã phải là chữ hoa/số, 1–12 ký tự'),
    version: z.string().min(1),
    asOf: z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'phải là mốc thời gian ISO hợp lệ' }),
    eventType: z.string(), // chỉ 'CASH' được hỗ trợ ở v3; kiểm tra chi tiết bên dưới để thông báo rõ ràng hơn enum lỗi chung
    windows: z.array(backtestWindowSchema).max(CYCLE_STATS_LIMITS.maxWindows),
    selectedWindowId: z.string().nullable(),
    adjustedPriceBasis: z.string(),
    benchmark: z.string(),
  })
  .superRefine((v, ctx) => {
    const bad = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', message, path });

    if (v.eventType !== 'CASH') bad(['eventType'], `chỉ hỗ trợ 'CASH', nhận '${v.eventType}'`);
    if (v.adjustedPriceBasis !== 'ADJ_CLOSE') bad(['adjustedPriceBasis'], `chỉ hỗ trợ 'ADJ_CLOSE', nhận '${v.adjustedPriceBasis}'`);
    if (v.benchmark !== 'VNINDEX' && v.benchmark !== 'SECTOR') bad(['benchmark'], `chỉ hỗ trợ 'VNINDEX'/'SECTOR', nhận '${v.benchmark}'`);

    if (!Array.isArray(v.windows)) return;

    const ids = new Set<string>();
    v.windows.forEach((w, i) => {
      if (ids.has(w.id)) bad(['windows', i, 'id'], `id cửa sổ trùng: ${w.id}`);
      ids.add(w.id);
      // Quy ước dấu mục 2.2: entryFrom <= entryTo <= 0 (vùng mua nằm trước hoặc đúng GDKHQ).
      if (!(w.entryFrom <= w.entryTo)) bad(['windows', i, 'entryFrom'], 'entryFrom phải ≤ entryTo');
      if (w.entryTo > 0) bad(['windows', i, 'entryTo'], 'entryTo phải ≤ 0 (trước hoặc đúng GDKHQ)');
      // exitOffset có thể dương nếu holdsThroughEx (nắm qua GDKHQ), nhưng không thể thoát trước khi mua xong.
      if (w.exitOffset < w.entryTo) bad(['windows', i, 'exitOffset'], 'exitOffset không được sớm hơn entryTo');
      if (!w.holdsThroughEx && w.exitOffset > 0) {
        bad(['windows', i, 'exitOffset'], 'exitOffset > 0 nhưng holdsThroughEx = false (mâu thuẫn)');
      }
    });

    if (v.selectedWindowId !== null) {
      const w = v.windows.find((x) => x.id === v.selectedWindowId);
      if (!w) bad(['selectedWindowId'], `không khớp id cửa sổ nào: ${v.selectedWindowId}`);
      else if (!w.selected) {
        bad(['selectedWindowId'], `trỏ tới cửa sổ '${w.id}' nhưng selected = false (mục 5.6: chưa qua cổng thống kê)`);
      }
    }
  });

/** Giữ schema và kiểu miền (types.ts) đồng bộ: lệch một trong hai chiều sẽ báo lỗi biên dịch. */
type Inferred = z.infer<typeof cycleStatsV3Schema>;
const _parsedToDomain: (a: Inferred) => CycleStatsV3 = (a) => a as CycleStatsV3;
const _domainToParsed: (a: CycleStatsV3) => Inferred = (a) => a as Inferred;
const _windowCheck: (a: z.infer<typeof backtestWindowSchema>) => BacktestWindow = (a) => a;
void _parsedToDomain;
void _domainToParsed;
void _windowCheck;

export function formatIssues(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>, max = 10): string[] {
  const out = issues.slice(0, max).map((i) => `${i.path.map(String).join('.') || '(gốc)'}: ${i.message}`);
  if (issues.length > max) out.push(`… và ${issues.length - max} lỗi khác`);
  return out;
}

export type ParseCycleStatsResult = { ok: true; data: CycleStatsV3 } | { ok: false; issues: string[] };

export function parseCycleStats(raw: unknown): ParseCycleStatsResult {
  try {
    const r = cycleStatsV3Schema.safeParse(raw);
    if (r.success) return { ok: true, data: r.data as CycleStatsV3 };
    return { ok: false, issues: formatIssues(r.error.issues) };
  } catch (e) {
    return { ok: false, issues: [`(gốc): lỗi khi validate: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
