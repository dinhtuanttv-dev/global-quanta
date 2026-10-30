// @vitest-environment node
// SC0 — HÀNG RÀO ĐẦU RA ENGINE cho đợt nâng cấp Super Chart (SC1–SC6 chỉ đổi BỐ CỤC, không đổi công thức).
// Chạy mọi engine/scene của tab TA VN-Index trên dữ liệu SSI thật (FPT + VNINDEX, 800 phiên, cố định) ở khung D và W,
// rồi so với bản ghi nền __baseline__/engineBaseline.json (vân tay SHA-256 của JSON chuẩn hoá + vài con số đọc được).
// Mọi thay đổi đầu ra sẽ làm test đỏ; chỉ cập nhật bằng `npx vitest run -u` KÈM lý do được duyệt.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyze } from "../quant-core";
import { AnalysisController } from "./AnalysisController";
import { buildScene } from "./chart/buildScene";
import { structure3SceneItems as structureSceneItems, structure3Markers as structureMarkers, structure3Levels as structureLevels } from "./chart/structure3Scene";
import { elliottProSummary } from "./chart/elliottProScene";
import { DEFAULT_LAYER_STATE, type LayerState } from "./LayerManager";
import { aggregateToWeekly } from "./TimeframeController";
import { calculateADX, calculateMACD, calculateRSI } from "./detectors/technicalOscillators";
import { elliottMtf } from "../quant-core/elliott/mtf";
import { buildWaveTree } from "../quant-core/elliott/v3/waveTree";
import { evaluateLifecycle, scenariosFromTree } from "../quant-core/elliott/v3/scenarios";
import { buildStructure3 } from "../quant-core/mtf3/doc";
import type { OhlcvBar } from "./types";
import type { Structure3Doc } from "../../hooks/useStructure3";

type Row = [string, number, number, number, number, number];
const fx = JSON.parse(readFileSync(path.resolve(process.cwd(), "src/lib/ta-command-center/__fixtures__/ssiDaily800.json"), "utf8")) as Record<"FPT" | "VNINDEX", { bars: Row[] }>;
const toBars = (rows: Row[]): OhlcvBar[] => rows.map(([date, open, high, low, close, volume]) => ({ date, open, high, low, close, volume }));

/** JSON chuẩn hoá: khoá sắp xếp, số làm tròn 1e-9 (an toàn khác biệt dấu phẩy động giữa máy), bỏ hàm / undefined. */
function canon(v: unknown): unknown {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 1e9) / 1e9 : String(v);
  if (Array.isArray(v)) return v.map(canon);
  if (v instanceof Map) return canon([...v.entries()]);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().filter((k) => typeof (v as Record<string, unknown>)[k] !== "function" && (v as Record<string, unknown>)[k] !== undefined).map((k) => [k, canon((v as Record<string, unknown>)[k])]));
  return v;
}
const fp = (v: unknown) => createHash("sha256").update(JSON.stringify(canon(v))).digest("hex").slice(0, 16);
const ALL_ON = Object.fromEntries(Object.keys(DEFAULT_LAYER_STATE).map((k) => [k, true])) as unknown as LayerState;
const countBy = <T,>(xs: T[], f: (x: T) => string) => Object.fromEntries(Object.entries(xs.reduce<Record<string, number>>((m, x) => ({ ...m, [f(x)]: (m[f(x)] ?? 0) + 1 }), {})).sort());

function fingerprint(symbol: "FPT" | "VNINDEX", tf: "D" | "W") {
  const daily = toBars(fx[symbol].bars);
  const bars = tf === "W" ? aggregateToWeekly(daily) : daily;
  const isIndex = symbol === "VNINDEX";
  const benchmark = isIndex ? null : toBars(fx.VNINDEX.bars);
  const a = analyze(bars, { isIndex, timeframe: tf, benchmark: benchmark && tf === "D" ? benchmark : undefined });
  const ctl = new AnalysisController(daily, { isIndex });
  if (tf === "W") ctl.setTimeframe("W");
  if (benchmark) ctl.setBenchmark(benchmark);
  const smc = ctl.getSmc(), vsa = ctl.getVsa(), wy = ctl.getWyckoff();
  const rsi = calculateRSI(bars), macd = calculateMACD(bars), adx = calculateADX(bars);
  const mtf = elliottMtf(daily);
  const candles = bars.map((b) => ({ time: b.date, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }));
  const tree = buildWaveTree(candles);
  const scenarios = scenariosFromTree(buildWaveTree(candles, { confirmedOnly: true }), candles, symbol).map((sc) => ({ sc, lc: evaluateLifecycle(sc, candles) }));
  const pro = { tree, scenarios, mode: "chart" as const };
  const ell = tf === "W" ? { primary: mtf.week, alternate: mtf.week?.alternates?.[0] ?? null } : { primary: mtf.day, alternate: mtf.day?.alternates?.[0] ?? null };
  const scene = buildScene({
    bars, smc, wyckoff: wy, layers: ALL_ON, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null,
    profile: a.profile ?? null, avwap: a.avwap ?? null, elliott: ell, pring: null, elliottPro: pro,
  });
  // 30/10/2026 (MTF v3 S7, anh duyệt S0–S7): lớp Cấu trúc v2 được thay bằng v3 — cập nhật bản ghi nền cho các khoá structure*.
  const doc = { ...buildStructure3(daily, { elliott: false }), symbol, priceBasis: null, evidence: { label: "", note: "" } } as unknown as Structure3Doc;
  const st = Object.fromEntries((["overview", "trade", "deep"] as const).map((m) => [m, fp(structureSceneItems(bars, tf, doc, m))]));
  ctl.destroy();
  return {
    counts: {
      bars: bars.length, scene: countBy(scene.items, (i) => i.kind), smc: smc.totals, vsa: vsa.length, wyckoffPhase: wy.phase,
      elliottDayPoints: mtf.day?.scenario?.points?.length ?? 0, chochN: a.backtest.chochBull.n + a.backtest.chochBear.n, v3Scenarios: scenarios.length, structureStage: doc.structure?.context?.[tf === "W" ? "W" : "D"]?.stage ?? null,
    },
    hash: {
      analyze: fp(a), smc: fp(smc), vsa: fp(vsa), wyckoff: fp(wy), backtest: fp(a.backtest), oscillators: fp([rsi, macd, adx]),
      elliottMtf: fp(mtf), waveTree: fp(tree), scenarios: fp(scenarios), elliottProSummary: fp(elliottProSummary(pro)),
      scene: fp(scene), structureDoc: fp(doc), structureScene: st, structureMarkers: fp(structureMarkers(bars, tf, doc, "deep")), structureLevels: fp(structureLevels(doc, "trade", bars[bars.length - 1].close)),
    },
  };
}

describe("SC0 — đầu ra engine của tab TA VN-Index không đổi qua đợt nâng cấp bố cục", () => {
  it("FPT · VNINDEX × D · W: vân tay mọi engine / scene khớp bản ghi nền", async () => {
    const out = { FPT_D: fingerprint("FPT", "D"), FPT_W: fingerprint("FPT", "W"), VNINDEX_D: fingerprint("VNINDEX", "D"), VNINDEX_W: fingerprint("VNINDEX", "W") };
    for (const v of Object.values(out)) expect(v.counts.bars).toBeGreaterThan(100);
    await expect(JSON.stringify(out, null, 1) + "\n").toMatchFileSnapshot("./__baseline__/engineBaseline.json");
  });

  it("tất định: chạy lại cho cùng vân tay (không phụ thuộc thời gian / ngẫu nhiên)", () => {
    expect(fingerprint("FPT", "D").hash).toEqual(fingerprint("FPT", "D").hash);
  });
});
