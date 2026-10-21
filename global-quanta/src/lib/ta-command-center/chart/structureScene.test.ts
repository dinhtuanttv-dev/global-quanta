import { describe, expect, it } from "vitest";
import type { OhlcvBar } from "../types";
import type { StructureDoc, StructureTf } from "../../../hooks/useStructure";
import { aggregateToWeekly } from "../TimeframeController";
import { chartDateOf, structureLevels, structureMarkers, structureSceneItems, structureTfFor } from "./structureScene";
import type { SceneItem } from "./scene";
import { positionSize } from "../../../components/MainTabs/TaVnIndex/StructurePanel";

function daily(n: number): OhlcvBar[] {
  const out: OhlcvBar[] = []; const d = new Date("2026-03-02T00:00:00Z"); let p = 50_000;
  while (out.length < n) {
    if (d.getUTCDay() % 6) { const o = p; p *= 1 + Math.sin(out.length / 9) * 0.01; out.push({ date: d.toISOString().slice(0, 10), open: o, high: Math.max(o, p) * 1.01, low: Math.min(o, p) * 0.99, close: p, volume: 1e6 }); }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const bars = daily(160);
const D = (i: number) => bars[i].date;

function tf(over: Partial<StructureTf>): StructureTf {
  return {
    tf: "D", asOf: D(159), close: bars[159].close, stage: "UP", stageLabel: "Xu hướng tăng", stageText: "…", stageAge: 20, dow: 1,
    ma: { fast: 20, slow: 100, fastValue: 1, slowValue: 1 }, dev: 1, slope: 0.1, spread: 0.5, atr: 900,
    segments: [
      { stage: "DOWN", label: "Xu hướng giảm", from: "2025-12-01", to: D(60), bars: 61 },
      { stage: "A", label: "A · Tích lũy đáy", from: D(61), to: D(139), bars: 79 },
      { stage: "UP", label: "Xu hướng tăng", from: D(140), to: D(159), bars: 20 },
    ],
    zones: [
      { lo: 48_000, hi: 48_600, mid: 48_300, strength: 0.9, sources: ["Dow", "MA"], touches: 4, role: "support", flipped: false },
      { lo: 56_000, hi: 56_600, mid: 56_300, strength: 0.7, sources: ["Dow"], touches: 2, role: "resistance", flipped: true },
      { lo: 46_000, hi: 46_500, mid: 46_250, strength: 0.5, sources: ["Khối lượng"], touches: 6, role: "support", flipped: false },
    ],
    base: { from: D(100), to: D(159), lo: 47_000, hi: 53_000, bars: 60, rangeAtr: 5, contractions: 2, tight: false, positionPct: 70, bbwPct: 30, maConverged: true },
    patterns: [{
      type: "W", name: "Hai đáy (W)", dir: 1, status: "confirmed",
      points: [{ date: D(110), price: 47_000, label: "Đáy 1" }, { date: D(120), price: 51_000, label: "Cổ" }, { date: D(130), price: 47_200, label: "Đáy 2" }],
      neck: { d0: D(120), p0: 51_000, d1: D(120), p1: 51_000 }, confirmedDate: D(135), breakDate: D(140), failDate: null, target: 55_000, height: 4000,
    }],
    signals: [{ date: D(150), code: "M3", side: "MUA", price: 52_000, note: "Mua 3" }, { date: "2020-01-01", code: "B1", side: "BÁN", price: 1, note: "ngoài dữ liệu" }],
    swings: [{ date: D(110), kind: "L", price: 47_000, confirmedDate: D(115) }, { date: D(120), kind: "H", price: 51_000, confirmedDate: D(125) }, { date: D(130), kind: "L", price: 47_200, confirmedDate: D(134) }],
    checklistBuy: [], checklistSell: [],
    ...over,
  };
}

const doc = {
  version: "1.0.0", symbol: "FPT", asOf: D(159), generatedAt: "", dataSource: { daily: { source: "SSI", priceBasis: "ADJUSTED_CUMULATIVE", bars: 160, warnings: [] }, h1: {} },
  context: { week: "UP", day: "UP", h1: "UP" },
  align: { verdict: "MUA", rule: "R1", cell: "Ngày:UP × H1:UP", sizeMult: 1, text: "", rules: [] },
  checklist: { buy: [], sell: [], buyScore: 6, sellScore: 1 },
  scenarios: [
    { side: "L", title: "Kịch bản tăng", trigger: 56_600, entry: 56_600, stop: 47_550, targets: [60_000, 62_000], rr: 0.4, targetBasis: "zones", text: "" },
    { side: "S", title: "Kịch bản giảm", trigger: 48_000, entry: 48_000, stop: 57_000, targets: [46_250], rr: 0.2, targetBasis: "zones", text: "" },
  ],
  tfs: {
    D: tf({}),
    W: tf({ tf: "W", segments: [{ stage: "UP", label: "Xu hướng tăng", from: "2026-06-05", to: "2026-10-09", bars: 18 }], patterns: [], signals: [], swings: [], base: null }),
    H1: tf({ tf: "H1", segments: [{ stage: "UP", label: "Xu hướng tăng", from: "2026-10-08 09:00", to: "2026-10-09 14:00", bars: 10 }], patterns: [], swings: [], base: null,
      signals: [{ date: "2026-10-09 10:00", code: "G3", side: "MUA", price: 1, note: "" }] }),
  },
  annotations: [], timeline: [], dayContextOnH1: null, narrative: [],
  cone: { horizons: { 5: { p10: 50_000, p50: 52_000, p90: 54_000, kind: "empirical", coverageOOS: 0.8 }, 20: { p10: 47_000, p50: 53_000, p90: 59_000, kind: "empirical", coverageOOS: 0.8 } }, label: "THỰC NGHIỆM" },
  probability: null, stageOdds: null,
  evidence: { prereg: "", status: "PENDING", verdicts: {}, summary: null, labels: { stageUp: "ĐANG KIỂM ĐỊNH", alignment: "ĐANG KIỂM ĐỊNH", checklist: "ĐANG KIỂM ĐỊNH", patterns: "ĐANG KIỂM ĐỊNH", stageDown: "ĐANG KIỂM ĐỊNH" } },
} as unknown as StructureDoc;

/** Mọi mốc thời gian của phần tử (trừ vùng tương lai dùng `from` + k) phải là một nến có thật. */
function anchors(it: SceneItem): string[] {
  switch (it.kind) {
    case "zone": return [it.t1, ...(it.t2 ? [it.t2] : [])];
    case "band": return [it.t1, it.t2];
    case "hline": return [it.t1, ...(it.t2 ? [it.t2] : [])];
    case "vline": return [it.t];
    case "segment": return [it.a.t, it.b.t];
    case "poly": return it.points.map((p) => p.t);
    case "future": case "cone": return [it.from];
    default: return [];
  }
}

describe("Lớp Cấu trúc MTF trên biểu đồ (T5)", () => {
  it("khung D: mọi phần tử ghim vào nến có thật; đoạn bắt đầu trước dữ liệu neo vào nến đầu; nhiều chi tiết hơn theo chế độ", () => {
    const dates = new Set(bars.map((b) => b.date));
    const counts = (["overview", "trade", "deep"] as const).map((m) => {
      const items = structureSceneItems(bars, "D", doc, m);
      for (const it of items) for (const a of anchors(it)) expect(dates.has(a), `${it.kind} ${a}`).toBe(true);
      return items;
    });
    expect(counts[0].length).toBeLessThan(counts[1].length);
    expect(counts[1].length).toBeLessThan(counts[2].length);
    const firstBand = counts[0].find((x) => x.kind === "band");
    expect(firstBand && firstBand.kind === "band" && firstBand.t1).toBe(bars[0].date);
    expect(counts[0].some((x) => x.kind === "cone")).toBe(false);
    expect(counts[1].some((x) => x.kind === "cone")).toBe(true);
    expect(counts[1].filter((x) => x.kind === "future")).toHaveLength(2);
    expect(counts[2].some((x) => x.kind === "poly" && x.nodeLabels?.join() === "Đ1,C,Đ2")).toBe(true);
  });

  it("khung W: ngày của Gateway (phiên cuối tuần) -> thứ Hai của nến tuần; khung 1H -> khoá tiết +07:00", () => {
    const weekly = aggregateToWeekly(bars);
    const wd = new Set(weekly.map((b) => b.date));
    const items = structureSceneItems(weekly, "W", doc, "trade");
    expect(items.some((x) => x.kind === "band")).toBe(true);
    for (const it of items) for (const a of anchors(it)) expect(wd.has(a)).toBe(true);
    expect(items.some((x) => x.kind === "cone")).toBe(false);
    expect(chartDateOf("1H", "2026-10-09 14:00")).toBe("2026-10-09T14:00:00+07:00");
    const h1: OhlcvBar[] = ["2026-10-08", "2026-10-09"].flatMap((d) => ["09", "10", "11", "13", "14"].map((h) => ({ date: `${d}T${h}:00:00+07:00`, open: 1, high: 1, low: 1, close: 52_000, volume: 1 })));
    const hItems = structureSceneItems(h1, "1H", doc, "trade");
    expect(hItems.find((x) => x.kind === "band")).toMatchObject({ t1: "2026-10-08T09:00:00+07:00", t2: "2026-10-09T14:00:00+07:00" });
    expect(structureMarkers(h1, "1H", doc, "trade")).toEqual([expect.objectContaining({ time: "2026-10-09T10:00:00+07:00", text: "G3" })]);
  });

  it("khung khác (15m): chỉ mức giá khung ngày neo từ nến đầu; tín hiệu ngoài dữ liệu bị bỏ; thang mức giá theo chế độ", () => {
    expect(structureTfFor("15m")).toBeNull();
    const m15: OhlcvBar[] = [{ date: "2026-10-09T09:00:00+07:00", open: 1, high: 1, low: 1, close: 52_000, volume: 1 }, { date: "2026-10-09T09:15:00+07:00", open: 1, high: 1, low: 1, close: 52_000, volume: 1 }];
    const items = structureSceneItems(m15, "15m", doc, "trade");
    expect(items.length).toBeGreaterThan(0);
    for (const it of items) { expect(["zone", "hline"]).toContain(it.kind); expect(anchors(it)[0]).toBe(m15[0].date); }
    expect(structureMarkers(bars, "D", doc, "overview")).toEqual([]);
    expect(structureMarkers(bars, "D", doc, "trade").map((m) => m.text)).toEqual(["M3"]);
    expect(structureLevels(doc, "overview", 52_000)).toEqual([]);
    expect(structureLevels(doc, "trade", 52_000).map((l) => l.title)).toEqual(["Kích hoạt tăng", "Cắt lỗ", "Kích hoạt giảm", "Hỗ trợ mạnh", "Kháng cự mạnh"]);
  });

  it("hộp rủi ro: 5% vốn / khoảng cắt lỗ, trần 25% vốn, hệ số R7, lô 100", () => {
    expect(positionSize(100_000_000, 50_000, 45_000)).toMatchObject({ shares: 500, capped: true }); // rủi ro cho 1000 cp nhưng trần 25% = 500 cp
    expect(positionSize(100_000_000, 50_000, 30_000)).toMatchObject({ shares: 200, capped: false }); // 5tr / 20k = 250 -> lô 200
    expect(positionSize(100_000_000, 50_000, 45_000, { sizeMult: 0.5 })?.shares).toBe(200);
    expect(positionSize(100_000_000, 50_000, 55_000)).toBeNull();
  });
});
