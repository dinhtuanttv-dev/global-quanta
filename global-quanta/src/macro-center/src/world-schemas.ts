/**
 * W5 (19/11/2026) — hợp đồng JSON của /api/world/* viết bằng Zod, KHOÁ đúng định dạng đang chạy trên production (không đổi hợp đồng).
 * Chỉ dùng trong test: (a) mẫu phản hồi thật ghi ngày 19/11/2026 (__fixtures__/world-prod-2026-11-19), (b) đầu ra của engine trong test.
 * Schema chỉ yêu cầu các trường giao diện đang đọc (passthrough cho trường khác) — thêm trường mới không làm vỡ, bỏ/đổi kiểu trường đang dùng thì vỡ.
 */
import { z } from 'zod';

const num = z.number().refine(Number.isFinite, 'số hữu hạn');
const tier = z.enum(['A', 'B', 'C']);
const tierCounts = z.object({ A: z.number().int().nonnegative(), B: z.number().int().nonnegative(), C: z.number().int().nonnegative() });
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}/);
const period = z.string().regex(/^\d{4}-\d{2}/); // kỳ tháng: 'YYYY-MM' hoặc 'YYYY-MM-DD'

export const WorldSeriesSchema = z.looseObject({
  factors: z.array(z.looseObject({ id: z.string(), nameVi: z.string(), channel: z.string() })).min(1),
  sectors: z.array(z.looseObject({ id: z.string(), nameVi: z.string() })).min(1),
  scenarios: z.array(z.looseObject({ id: z.string(), nameVi: z.string(), descriptionVi: z.string() })).min(1),
  tierMeaning: z.object({ A: z.string(), B: z.string(), C: z.string() }),
});

export const WorldOverviewSchema = z.looseObject({
  pulse: z.array(z.looseObject({ id: z.string(), nameVi: z.string(), z: num.nullable(), unusual: z.boolean() })),
  tierCounts,
  spillover: z.looseObject({ total: num }),
  events: z.looseObject({ total: z.number().int(), pending: z.number().int() }),
});

export const WorldMatrixSchema = z.looseObject({
  asOf: isoDay, firstPeriod: period, lastPeriod: period,
  factors: z.array(z.looseObject({ id: z.string(), nameVi: z.string(), channel: z.string(), channelVi: z.string() })).min(1),
  sectors: z.array(z.looseObject({ id: z.string(), nameVi: z.string() })).min(1),
  cells: z.array(z.looseObject({
    factor: z.string(), sector: z.string(), direction: z.enum(['+', '-']), beta: num, t: num, q: num, lag: z.number().int().min(0), tier, reasonVi: z.string(),
    stable: z.boolean().nullable(), oosPass: z.boolean().nullable(),
  })),
  counts: tierCounts,
  warnings: z.array(z.string()),
});

export const WorldEventRowSchema = z.looseObject({
  id: z.string(), titleVi: z.string(), kind: z.enum(['scheduled', 'surprise']), region: z.string(),
  sessionDate: isoDay.nullable(), sectorName: z.string().optional(), car: num.optional(), ci90: z.tuple([num, num]).optional(), q: num.optional(),
  tier: z.enum(['A', 'B', 'C', 'pending']), prespecified: z.boolean().optional(), overlapsWith: z.array(z.string()).optional(), signOk: z.boolean().nullable().optional(),
});
export const WorldEventsSchema = z.looseObject({ events: z.array(WorldEventRowSchema), family: z.string() });

export const WorldEventDetailSchema = z.looseObject({
  event: WorldEventRowSchema,
  alignment: z.looseObject({ date: isoDay, sameDay: z.boolean() }).nullable(),
  path: z.array(z.looseObject({ day: z.number().int(), ar: num, car: num.nullable(), se: num.nullable() })),
  model: z.looseObject({ nEst: z.number().int(), beta: num }).nullable(),
  sectors: z.array(z.looseObject({ sector: z.string(), nameVi: z.string(), car: num, ci90: z.tuple([num, num]), q: num })),
});

const decomposition = z.looseObject({ table: z.array(z.array(num)), from: z.array(num), to: z.array(num), net: z.array(num), total: num });
export const WorldConnectednessSchema = z.looseObject({
  names: z.array(z.string()).min(2), window: z.number().int(), H: z.number().int(),
  full: decomposition, recent: decomposition,
  rolling: z.array(z.looseObject({ date: isoDay, total: num })),
  vnReceivesFrom: z.array(z.looseObject({ market: z.string(), nameVi: z.string(), share: num })),
});

export const WorldScenarioSchema = z.looseObject({
  scenario: z.looseObject({ id: z.string(), nameVi: z.string(), descriptionVi: z.string() }),
  horizon: z.number().int().min(1),
  sectors: z.array(z.looseObject({
    sector: z.string(), nameVi: z.string(), est: num, lo: num, hi: num, conclusive: z.boolean(),
    irf: z.array(z.looseObject({ h: z.number().int(), est: num, lo: num, hi: num })),
  })).min(1),
  stocks: z.array(z.looseObject({ code: z.string(), est: num })),
  stockFactor: z.string().nullable(),
  warnings: z.array(z.string()),
  conclusiveCount: z.number().int().nonnegative(),
});

/** Lỗi: luôn có `error` là câu tiếng Việt (giao diện hiển thị nguyên văn). */
export const WorldErrorSchema = z.object({ error: z.string().min(1) });
