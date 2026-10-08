import { describe, expect, it } from "vitest";
import { aggregateIntraday, aggregateToMonthly, isIntradayTf, type IntradayBar } from "../TimeframeController";
import { chartTime } from "./time";
import { buildScene } from "./buildScene";
import { DEFAULT_LAYER_STATE } from "../LayerManager";
import { EMPTY_SMC } from "../AnalysisController";
import { analyze } from "../../quant-core";
import type { OhlcvBar } from "../types";

const m = (t: string, close: number, volume = 100, extra: Partial<IntradayBar> = {}): IntradayBar =>
  ({ date: `2026-10-02T${t}+07:00`, open: close, high: close + 50, low: close - 50, close, volume, ...extra });

describe("P4 — khung thời gian", () => {
  it("gộp 15 phút theo PHIÊN: sáng neo 09:00, chiều neo 13:00, không gộp qua giờ nghỉ trưa", () => {
    const bars = [m("09:15:40", 100, 10, { auction: "ATO" }), m("09:16:00", 101), m("09:29:00", 102), m("09:30:00", 103),
      m("11:29:00", 104), m("13:00:00", 105), m("13:14:00", 106), m("14:45:00", 107, 500, { auction: "ATC" })];
    const out = aggregateIntraday(bars, 15);
    expect(out.map((b) => b.date.slice(11, 16))).toEqual(["09:15", "09:30", "11:15", "13:00", "14:45"]);
    expect(out[0]).toMatchObject({ open: 100, close: 102, volume: 210, auction: "ATO" });
    expect(out[out.length - 1].auction).toBe("ATC");
    const h1 = aggregateIntraday(bars, 60);
    expect(h1.map((b) => b.date.slice(11, 16))).toEqual(["09:00", "11:00", "13:00", "14:00"]); // không có nến 12:00
  });

  it("khung tháng: nến đại diện = phiên đầu tiên của tháng; khung intraday được nhận diện", () => {
    const d: OhlcvBar[] = ["2026-08-31", "2026-09-03", "2026-09-30", "2026-10-01"].map((date, i) => ({ date, open: i, high: i + 1, low: i - 1, close: i, volume: 1 }));
    expect(aggregateToMonthly(d).map((b) => b.date)).toEqual(["2026-08-31", "2026-09-03", "2026-10-01"]);
    expect(isIntradayTf("15m")).toBe(true);
    expect(isIntradayTf("M")).toBe(false);
  });

  it("trục thời gian hiển thị giờ VN: 09:15 +07:00 -> 09:15 trên trục (UTC của thư viện)", () => {
    const t = chartTime("2026-10-02T09:15:00+07:00");
    expect(new Date(t * 1000).toISOString().slice(11, 16)).toBe("09:15");
    expect(chartTime("2026-10-02")).toBe(Date.parse("2026-10-02T00:00:00Z") / 1000);
  });
});

describe("P4 — Volume Profile / Anchored VWAP trên biểu đồ", () => {
  let seed = 9;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  let c = 60_000;
  const bars: OhlcvBar[] = Array.from({ length: 200 }, (_, i) => {
    const o = c; c = o * (1 + Math.sin(i / 20) * 0.004 + (rnd() - 0.5) * 0.03);
    return { date: new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10), open: o, high: Math.max(o, c) * 1.01, low: Math.min(o, c) * 0.99, close: c, volume: 1e6 * (0.5 + rnd()) };
  });
  const a = analyze(bars);
  const base = { bars, smc: EMPTY_SMC, wyckoff: null, primitives: [], draft: null, elliottDraft: [], fibExtension: false, highlight: null, profile: a.profile, avwap: a.avwap };

  it("mặc định TẮT: có dữ liệu profile/AVWAP nhưng không vẽ gì", () => {
    expect(a.profile.composite).not.toBeNull();
    expect(buildScene({ ...base, layers: DEFAULT_LAYER_STATE }).items).toHaveLength(0);
  });

  it("bật Volume Profile: histogram composite 60 nến + POC/VAH/VAL neo vào nến đầu/cuối vùng", () => {
    const s = buildScene({ ...base, layers: { ...DEFAULT_LAYER_STATE, vprofile: true } });
    const prof = s.items.find((i) => i.kind === "profile");
    expect(prof && prof.kind === "profile" && prof.t1).toBe(bars[bars.length - 60].date);
    expect(prof && prof.kind === "profile" && prof.t2).toBe(bars[bars.length - 1].date);
    expect(s.items.filter((i) => i.kind === "hline")).toHaveLength(3);
  });

  it("bật Anchored VWAP: 5 đường (VWAP, ±1σ, ±2σ) bắt đầu từ nến neo", () => {
    const s = buildScene({ ...base, layers: { ...DEFAULT_LAYER_STATE, avwap: true } });
    const polys = s.items.filter((i) => i.kind === "poly");
    expect(polys).toHaveLength(5);
    expect(polys[0].kind === "poly" && polys[0].points[0].t).toBe(a.avwap!.anchorDate);
  });
});
