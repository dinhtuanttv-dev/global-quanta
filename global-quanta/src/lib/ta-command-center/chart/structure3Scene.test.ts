// MTF v3 · S6 — lớp vẽ: mọi mốc thời gian là nến có thật của khung đang xem (Ngày / Tuần / Tháng), chế độ tăng dần chi tiết, phát lại.
import { describe, expect, it } from "vitest";
import type { OhlcvBar } from "../types";
import { aggregateToWeekly } from "../TimeframeController";
import { buildStructure3 } from "../../quant-core/mtf3/doc";
import type { Structure3Doc } from "../../../hooks/useStructure3";
import { structure3Levels, structure3Markers, structure3SceneItems } from "./structure3Scene";

function walk(n: number, seed = 5): OhlcvBar[] {
  let s = seed, p = 20000;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: OhlcvBar[] = [];
  for (let k = 0; out.length < n; k++) {
    const dt = new Date(Date.UTC(2020, 0, 6) + k * 86400000);
    if (dt.getUTCDay() % 6 === 0) continue;
    const r = 0.0007 + 0.018 * (rnd() + rnd() + rnd() - 1.5);
    const o = p, c = p * (1 + r);
    out.push({ date: dt.toISOString().slice(0, 10), open: o, high: Math.max(o, c) * 1.006, low: Math.min(o, c) * 0.994, close: c, volume: 1e6 * (0.5 + rnd()) });
    p = c;
  }
  return out;
}
const daily = walk(1250);
const doc = { ...buildStructure3(daily, { elliott: false }), symbol: "TST", priceBasis: null, evidence: { label: "", note: "" } } as unknown as Structure3Doc;

function times(items: ReturnType<typeof structure3SceneItems>): string[] {
  return items.flatMap((it) => {
    switch (it.kind) {
      case "zone": return [it.t1, ...(it.t2 ? [it.t2] : [])];
      case "band": return [it.t1, it.t2];
      case "hline": return [it.t1, ...(it.t2 ? [it.t2] : [])];
      case "poly": return it.points.map((p) => p.t);
      case "ring": return [it.t];
      default: return [];
    }
  });
}

describe("structure3Scene", () => {
  it("khung Ngày: mọi mốc là nến có thật; chi tiết tăng dần Tổng quan < Giao dịch < Chuyên sâu", () => {
    const dates = new Set(daily.map((b) => b.date));
    const ov = structure3SceneItems(daily, "D", doc, "overview"), tr = structure3SceneItems(daily, "D", doc, "trade"), dp = structure3SceneItems(daily, "D", doc, "deep");
    for (const t of times(dp)) expect(dates.has(t)).toBe(true);
    expect(ov.length).toBeLessThanOrEqual(tr.length);
    expect(tr.length).toBeLessThanOrEqual(dp.length);
    expect(ov.some((x) => x.kind === "band")).toBe(true);
    expect(structure3Markers(daily, "D", doc, "overview")).toHaveLength(0);
    for (const m of structure3Markers(daily, "D", doc, "deep")) expect(dates.has(m.time)).toBe(true);
  });

  it("khung Tuần / Tháng: mốc quy về khoá nến tuần (thứ Hai) / phiên đầu tháng của biểu đồ", () => {
    const weekly = aggregateToWeekly(daily), wd = new Set(weekly.map((b) => b.date));
    for (const t of times(structure3SceneItems(weekly, "W", doc, "deep"))) expect(wd.has(t)).toBe(true);
    const firsts = new Map<string, string>();
    for (const b of daily) if (!firsts.has(b.date.slice(0, 7))) firsts.set(b.date.slice(0, 7), b.date);
    const monthly = [...firsts.values()].map((d) => ({ ...daily.find((b) => b.date === d)! }));
    const md = new Set(monthly.map((b) => b.date));
    for (const t of times(structure3SceneItems(monthly, "M", doc, "deep"))) expect(md.has(t)).toBe(true);
  });

  it("nền chưa đạt chuẩn: không vẽ ở Giao dịch, chỉ khung mờ không nhịp co ở Chuyên sâu", () => {
    const bad = { ...doc, bases: { ...doc.bases!, D: { ...(doc.bases!.D ?? { from: daily[900].date, to: daily[1249].date, bars: 350, weeks: 70, leftHigh: 30000, low: 15000, lowDate: daily[1000].date, depthPct: 50, contractions: [{ hiDate: daily[900].date, hi: 30000, loDate: daily[1000].date, lo: 15000, depthPct: 50 }], vcp: false, footprint: "70W 50/50 1T", pivot: 30000, pivotDate: daily[900].date, dryUp: 1, dry: false, undercuts: [], vShape: false, pattern: "GENERIC", patternLabel: "Nền giá", baseCount: null, breakout: null }), valid: false, reasons: ["sâu 50%"] } } } as Structure3Doc;
    const tr = structure3SceneItems(daily, "D", bad, "trade"), dp = structure3SceneItems(daily, "D", bad, "deep");
    expect(tr.some((x) => x.kind === "zone" && x.label?.text.includes("chưa đạt chuẩn"))).toBe(false);
    expect(dp.some((x) => x.kind === "zone" && x.label?.text.includes("chưa đạt chuẩn"))).toBe(true);
    expect(dp.some((x) => x.kind === "poly" && x.color.includes("34, 211, 238") && x.nodeLabels?.some((l) => l.startsWith("−")))).toBe(false);
  });

  it("khung trong ngày chỉ có mức giá; không có tài liệu -> rỗng; thang giá trục phải", () => {
    const items = structure3SceneItems(daily.slice(-50), "15m", doc, "deep");
    expect(items.every((x) => x.kind === "zone")).toBe(true);
    expect(structure3SceneItems(daily, "D", null, "deep")).toEqual([]);
    const close = daily[daily.length - 1].close;
    for (const l of structure3Levels(doc, "trade", close)) expect(Number.isFinite(l.price)).toBe(true);
    expect(structure3Levels(doc, "overview", close)).toEqual([]);
  });
});
