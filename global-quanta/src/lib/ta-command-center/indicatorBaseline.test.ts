// @vitest-environment node
// TA-T0 (28/11/2026, docs/ta-tradingview 02 §T0) — HÀNG RÀO GIÁ TRỊ cho các chỉ báo phủ giá mà SC0 (engineBaseline) chưa ghi:
// bộ EMA 21/50/100 · MA 200, Ichimoku 9/26/52, Bollinger 20/2, SuperTrend 10/3. Đợt nâng cấp chart theo chuẩn TradingView (T1–T7)
// chỉ được đổi CÁCH VẼ — mọi giá trị phải khớp bản ghi nền __baseline__/indicatorBaseline.json. Cập nhật bằng `-u` chỉ khi có lý do được duyệt.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { aggregateToWeekly } from "./TimeframeController";
import { ICHIMOKU_DEFAULT, ichimoku, movingAverageSet } from "./detectors/movingAverages";
import { bollingerBands, superTrend } from "./detectors/bandsTrend";
import type { OhlcvBar } from "./types";

type Row = [string, number, number, number, number, number];
const fx = JSON.parse(readFileSync(path.resolve(process.cwd(), "src/lib/ta-command-center/__fixtures__/ssiDaily800.json"), "utf8")) as Record<"FPT" | "VNINDEX", { bars: Row[] }>;
const toBars = (rows: Row[]): OhlcvBar[] => rows.map(([date, open, high, low, close, volume]) => ({ date, open, high, low, close, volume }));
const r9 = (v: unknown): unknown => (typeof v === "number" ? (Number.isFinite(v) ? Math.round(v * 1e9) / 1e9 : String(v)) : Array.isArray(v) ? v.map(r9)
  : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, r9((v as Record<string, unknown>)[k])])) : v);
const fp = (v: unknown) => createHash("sha256").update(JSON.stringify(r9(v))).digest("hex").slice(0, 16);
/** 3 giá trị đọc được (nến cuối, giữa, nến thứ 250) để người duyệt thấy số thật, không chỉ vân tay. */
const sample = (xs: (number | null)[]) => [xs[249] ?? null, xs[Math.floor(xs.length / 2)] ?? null, xs[xs.length - 1] ?? null].map((v) => (v == null ? null : Math.round(v * 1e4) / 1e4));

function values(symbol: "FPT" | "VNINDEX", tf: "D" | "W") {
  const daily = toBars(fx[symbol].bars);
  const bars = tf === "W" ? aggregateToWeekly(daily) : daily;
  const ma = movingAverageSet(bars), ichi = ichimoku(bars, ICHIMOKU_DEFAULT), bb = bollingerBands(bars, { period: 20, mult: 2 }), st = superTrend(bars, { period: 10, mult: 3 });
  return {
    bars: bars.length,
    hash: { maSet: fp(ma), ichimoku: fp(ichi), bollinger: fp(bb), superTrend: fp(st) },
    sample: { ema21: sample(ma.ema21), ma200: sample(ma.ma200), tenkan: sample(ichi.tenkan), spanB: sample(ichi.spanB), bbUpper: sample(bb.upper), stLine: sample(st.line) },
  };
}

describe("TA-T0 — giá trị chỉ báo phủ giá không đổi qua đợt nâng cấp chart chuẩn TradingView", () => {
  it("FPT · VNINDEX × D · W: EMA/MA, Ichimoku, Bollinger, SuperTrend khớp bản ghi nền", async () => {
    const out = { FPT_D: values("FPT", "D"), FPT_W: values("FPT", "W"), VNINDEX_D: values("VNINDEX", "D"), VNINDEX_W: values("VNINDEX", "W") };
    for (const v of Object.values(out)) expect(v.bars).toBeGreaterThan(100);
    await expect(JSON.stringify(out, null, 1) + "\n").toMatchFileSnapshot("./__baseline__/indicatorBaseline.json");
  });
});
