// G0 (19/11/2026) — hợp đồng JSON của các route Gateway mà tab KẾT NỐI THẾ GIỚI đọc, ngoài /api/world/* của engine
// (đã khoá ở macro-center/src/world-contract.test.ts). Mẫu = phản hồi THẬT production (__fixtures__/world-ui-baseline).
// Mục đích (Giao-dien-KNTG/05): nâng cấp giao diện không được đổi / bỏ trường mà giao diện đang đọc. Thêm trường mới thì vẫn đạt.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const fx = (f: string) => JSON.parse(readFileSync(resolve(process.cwd(), `src/components/MainTabs/KetNoiTheGioi/__fixtures__/world-ui-baseline/${f}.json`), "utf8"));
const num = z.number().refine(Number.isFinite, "số hữu hạn");
const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}/);

const quote = z.looseObject({ value: num.nullable(), changePct: num.nullable(), date: z.string().nullable(), nameVi: z.string() });
export const PulseSchema = z.looseObject({
  source: z.string(),
  macro: z.looseObject({
    dxy: num.nullable(), vix: num.nullable(), treasury_10y: num.nullable(), oil_brent: num.nullable(),
    vol_term: z.looseObject({ vix: num, vix3m: num, slope: num, stateVi: z.string(), regime: z.enum(["RISK_ON", "NEUTRAL", "RISK_OFF"]) }).nullable(),
    vol_term_evidence: z.looseObject({ note: z.string(), history: z.string() }).nullable(),
    quotes: z.record(z.string(), quote),
  }),
});
export const MonitorSchema = z.looseObject({
  generatedAt: iso,
  items: z.array(z.looseObject({ id: z.string(), nameVi: z.string(), group: z.string(), available: z.boolean(), value: num.nullable().optional(), change: num.nullable().optional(), z: num.nullable().optional(), unusual: z.boolean().optional(), rangePct: num.nullable().optional() })).min(1),
  summary: z.looseObject({ total: z.number().int(), available: z.number().int(), abnormal: z.array(z.looseObject({ id: z.string(), nameVi: z.string() })), vixRangePct: num.nullable() }),
});
export const NewsSchema = z.looseObject({
  refreshedAt: iso,
  items: z.array(z.looseObject({ url: z.string().url(), title: z.string().min(1), sourceLabel: z.string(), authority: z.string(), publishedAt: iso, topics: z.array(z.string()), verification: z.string() })),
  counts: z.looseObject({ official: z.number().int(), corroborated: z.number().int(), single: z.number().int() }),
  sources: z.array(z.looseObject({ id: z.string(), label: z.string(), ok: z.boolean() })),
});
const citation = z.looseObject({});
export const BriefSchema = z.looseObject({
  latest: z.looseObject({
    generatedAt: iso, model: z.string(),
    summary: z.array(z.looseObject({ text: z.string(), citations: z.array(citation) })),
    sectors: z.array(z.looseObject({ icb: z.string(), nameVi: z.string(), direction: z.string(), text: z.string() })),
  }).nullable(),
  runs: z.array(z.looseObject({ id: z.string(), generatedAt: iso })),
  running: z.boolean(), configured: z.boolean(),
});
export const SourceSchema = z.looseObject({
  mode: z.string(), minMonths: z.number().int(),
  coverage: z.array(z.looseObject({ id: z.string(), nameVi: z.string(), n: z.number().int(), stale: z.boolean(), usable: z.boolean() })),
});
export const ConfirmatorySchema = z.looseObject({
  family: z.number().int(), confirmed: z.number().int(),
  rows: z.array(z.looseObject({ id: z.string(), factor: z.string(), sector: z.string(), sign: z.number(), available: z.boolean(), q: num.nullable().optional(), oosPass: z.boolean().nullable().optional() })),
});
const stance = z.enum(["overweight", "neutral", "underweight", "na"]);
export const WsStrategySchema = z.looseObject({
  generatedAt: iso,
  evidence: z.looseObject({ short: z.looseObject({ label: z.string(), ic: num, t: num }) }),
  regime: z.looseObject({ stressed: z.boolean(), vix: num.nullable(), date: z.string() }),
  short: z.looseObject({ rows: z.array(z.looseObject({ icb: z.string(), nameVi: z.string(), stance, alphaBps: num.nullable(), pOutperform: num.nullable(), zx: num.nullable() })).min(1) }),
  medium: z.array(z.looseObject({ icb: z.string(), nameVi: z.string(), stance: z.enum(["supportive", "mixed", "neutral", "adverse"]) })).min(1),
});
export const WsScoresSchema = z.looseObject({
  generatedAt: iso,
  regions: z.record(z.string(), z.looseObject({ nameVi: z.string() })),
  rows: z.array(z.looseObject({ icb: z.string(), nameVi: z.string(), available: z.boolean() })).min(1),
});
export const CommoditiesSchema = z.looseObject({
  generatedAt: iso,
  items: z.array(z.looseObject({
    id: z.string(), nameVi: z.string(), group: z.string(), unit: z.string(), available: z.boolean(), vnTickers: z.array(z.string()),
    transmission: z.looseObject({ speed: z.enum(["immediate", "slow", "none", "unmeasured"]), noteVi: z.string() }).nullable(), proxy: z.boolean(),
  })).min(20),
});
export const ImpactSchema = z.looseObject({
  ticker: z.string(), aggregate: z.null(),
  layers: z.array(z.looseObject({ id: z.string(), labelVi: z.string(), evidenceId: z.string(), seal: z.enum(["ĐẠT", "MỘT PHẦN", "THĂM DÒ", "KHÔNG ĐẠT", "ĐANG TÍCH LUỸ", "CHƯA KIỂM ĐỊNH", "MÔ TẢ"]), available: z.boolean(), direction: z.number().nullable() })).length(7),
});
export const LiquiditySchema = z.looseObject({ date: iso, ticker: z.string(), liq: z.looseObject({ tier: z.enum(["L1", "L2", "L3", "L4", "NA"]), med20: num.nullable(), reasons: z.array(z.string()) }).optional() });

const ok = (s: { safeParse: (v: unknown) => { success: boolean; error?: { issues: unknown[] } } }, v: unknown) => {
  const r = s.safeParse(v);
  if (!r.success) throw new Error(JSON.stringify(r.error?.issues.slice(0, 3)));
  return true;
};

describe("hợp đồng các route Gateway của tab KẾT NỐI THẾ GIỚI (phản hồi thật production)", () => {
  it.each([
    ["pulse", PulseSchema], ["monitor", MonitorSchema], ["news", NewsSchema], ["brief", BriefSchema], ["source", SourceSchema],
    ["confirmatory", ConfirmatorySchema], ["ws-strategy", WsStrategySchema], ["ws-scores", WsScoresSchema], ["commodities", CommoditiesSchema],
    ["impact-HPG", ImpactSchema], ["liquidity-HPG", LiquiditySchema],
  ] as const)("%s khớp schema", (f, s) => { expect(ok(s, fx(f))).toBe(true); });

  it("schema bắt thay đổi phá hợp đồng; thêm trường mới vẫn đạt", () => {
    const st = fx("ws-strategy");
    expect(WsStrategySchema.safeParse({ ...st, short: { ...st.short, rows: [{ ...st.short.rows[0], stance: "buy" }] } }).success).toBe(false);
    const cm = fx("commodities");
    expect(CommoditiesSchema.safeParse({ ...cm, items: cm.items.map((i: Record<string, unknown>) => ({ ...i, transmission: { speed: "fast", noteVi: "" } })) }).success).toBe(false);
    expect(ImpactSchema.safeParse({ ...fx("impact-HPG"), aggregate: 1 }).success).toBe(false);
    expect(MonitorSchema.safeParse({ ...fx("monitor"), extra: true }).success).toBe(true);
  });
});
