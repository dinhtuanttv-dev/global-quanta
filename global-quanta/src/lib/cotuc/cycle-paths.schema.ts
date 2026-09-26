import { z } from 'zod';
import type { CyclePathsV3 } from './timing-types';

/**
 * Schema zod cho response của GET /api/cotuc/cycle-paths?ticker=XYZ (CyclePathsV3).
 * Chỉ dùng API zod có ở cả v3 lẫn v4 (object, string, number, array, nullable, refine, superRefine).
 *
 * Schema không chỉ kiểm tra kiểu mà còn kiểm tra hợp đồng dữ liệu:
 * - offsets tăng ngặt; mọi car / currentPath cùng độ dài offsets.
 * - exDate hợp lệ và không trùng (CycleTimeline dùng exDate làm React key).
 * - car[0] = 0 (đã rebase tại offsets[0]).
 * - |CAR| không vượt ngưỡng hợp lý, để bắt lỗi đơn vị (backend gửi % thay vì tỷ lệ).
 */
export const CYCLE_PATHS_LIMITS = {
  maxOffsets: 400,
  maxEvents: 200,
  /** CAR là tỷ lệ (0,05 = 5%). Trên 150% trong ~55 ngày giao dịch gần như chắc chắn là sai đơn vị. */
  maxAbsCar: 1.5,
  rebaseTolerance: 1e-6,
} as const;

/** Mã chứng khoán (gồm cả ETF, chứng quyền): chữ hoa và số, 1–12 ký tự. */
export const TICKER_RE = /^[A-Z0-9]{1,12}$/;

/** Parse ngày nghiêm ngặt, không phụ thuộc múi giờ. Có thể thay bằng toDayNumber dùng chung của quant-cotuc. */
export function isValidIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const isoDate = z.string().refine(isValidIsoDate, { message: 'phải là ngày YYYY-MM-DD hợp lệ' });

const timestamp = z.string().refine((s) => !Number.isNaN(Date.parse(s)), { message: 'phải là mốc thời gian ISO hợp lệ' });

const carValue = z
  .number()
  .refine((v) => Number.isFinite(v), { message: 'phải là số hữu hạn' })
  .refine((v) => Math.abs(v) <= CYCLE_PATHS_LIMITS.maxAbsCar, {
    message: `|CAR| vượt ${CYCLE_PATHS_LIMITS.maxAbsCar} (nghi sai đơn vị: cần tỷ lệ, không phải %)`,
  });

export const cyclePathsV3Schema = z
  .object({
    ticker: z.string().regex(TICKER_RE, 'mã phải là chữ hoa/số, 1–12 ký tự'),
    version: z.string().min(1),
    asOf: timestamp,
    offsets: z.array(z.number().int()).min(2).max(CYCLE_PATHS_LIMITS.maxOffsets),
    eventPaths: z
      .array(z.object({ exDate: isoDate, car: z.array(carValue.nullable()) }))
      .max(CYCLE_PATHS_LIMITS.maxEvents),
    currentPath: z.array(carValue.nullable()).nullable(),
  })
  .superRefine((v, ctx) => {
    // Tuỳ phiên bản zod, superRefine có thể vẫn chạy khi trường nền đã lỗi kiểu: bỏ qua, lỗi kiểu đã được báo.
    if (!Array.isArray(v.offsets) || !Array.isArray(v.eventPaths)) return;
    const n = v.offsets.length;
    const bad = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', message, path });
    const tol = CYCLE_PATHS_LIMITS.rebaseTolerance;

    for (let i = 1; i < n; i++) {
      if (v.offsets[i] <= v.offsets[i - 1]) {
        bad(['offsets', i], 'offsets phải tăng ngặt');
        break;
      }
    }

    const seen = new Set<string>();
    v.eventPaths.forEach((e, i) => {
      if (!Array.isArray(e.car)) return;
      if (e.car.length !== n) bad(['eventPaths', i, 'car'], `car có ${e.car.length} phần tử, cần ${n} (bằng offsets)`);
      if (seen.has(e.exDate)) bad(['eventPaths', i, 'exDate'], `exDate trùng: ${e.exDate}`);
      seen.add(e.exDate);
      const first = e.car[0];
      if (typeof first === 'number' && Math.abs(first) > tol) {
        bad(['eventPaths', i, 'car', 0], 'car[0] phải bằng 0 (đã rebase tại offsets[0])');
      }
    });

    if (Array.isArray(v.currentPath)) {
      if (v.currentPath.length !== n) {
        bad(['currentPath'], `currentPath có ${v.currentPath.length} phần tử, cần ${n} (bằng offsets)`);
      }
      const first = v.currentPath[0];
      if (typeof first === 'number' && Math.abs(first) > tol) {
        bad(['currentPath', 0], 'currentPath[0] phải bằng 0 (đã rebase tại offsets[0])');
      }
    }
  });

/** Giữ schema và kiểu miền (cycle-types.ts) đồng bộ: lệch một trong hai chiều sẽ báo lỗi biên dịch. */
type Inferred = z.infer<typeof cyclePathsV3Schema>;
const _parsedToDomain: (a: Inferred) => CyclePathsV3 = (a) => a;
const _domainToParsed: (a: CyclePathsV3) => Inferred = (a) => a;
void _parsedToDomain;
void _domainToParsed;

export function formatIssues(
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>,
  max = 10,
): string[] {
  const out = issues.slice(0, max).map((i) => `${i.path.map(String).join('.') || '(gốc)'}: ${i.message}`);
  if (issues.length > max) out.push(`… và ${issues.length - max} lỗi khác`);
  return out;
}

export type ParseCyclePathsResult = { ok: true; data: CyclePathsV3 } | { ok: false; issues: string[] };

/** Validate dữ liệu thô. Không ném lỗi. */
export function parseCyclePaths(raw: unknown): ParseCyclePathsResult {
  try {
    const r = cyclePathsV3Schema.safeParse(raw);
    if (r.success) return { ok: true, data: r.data };
    return { ok: false, issues: formatIssues(r.error.issues) };
  } catch (e) {
    return { ok: false, issues: [`(gốc): lỗi khi validate: ${e instanceof Error ? e.message : String(e)}`] };
  }
}
