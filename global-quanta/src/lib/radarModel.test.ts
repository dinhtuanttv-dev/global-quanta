import { describe, expect, it } from "vitest";
import { buildRadarModel, scoreTicker, CORE_MIN, type RadarSources } from "./radarModel";
import type { SieuQuetStockItem } from "../hooks/useSieuQuetScanner";

const item = (ticker: string, smartScore: number, extra: Partial<SieuQuetStockItem> = {}): SieuQuetStockItem => ({
  ticker, companyName: `Cty ${ticker}`, sector: null, price: 20_000, changePct: 1, faScore: 50, taScore: 50, eventImpactScore: 0, smartScore,
  rsRating: 60, riskAdjustedMomentum: 0, riskRewardRatio: 1, trendTag: "Up-Trend", qualityTag: null, confluenceStatusCode: null, confluenceStatusLabel: null,
  confluenceBoost: 0, confluenceReasonCodes: [], breakoutBoostBadge: false, piotroskiFScore: 6, fScoreMax: 9, foreignNetBuyFlag: false, computedAt: "",
  industry: "Ngân hàng", sectorGroup: "Tài chính", ...extra,
});
const src = (over: Partial<RadarSources> = {}): RadarSources => ({
  scanner: new Map([
    ["AAA", item("AAA", 80)], ["BBB", item("BBB", 70, { breakoutBoostBadge: true, sectorGroup: "Công nghiệp" })],
    ["CCC", item("CCC", 40, { trendTag: "Down-Trend" })], ["DDD", item("DDD", 90, { piotroskiFScore: 2 })],
    ["EEE", item("EEE", 65, { eventImpactScore: 5 })],
  ]),
  world: new Set(["AAA", "BBB"]), sector: new Set(["AAA", "BBB", "CCC"]), ta: new Set(["AAA"]),
  catalyst: new Set(["BBB"]), dividend: new Set(["AAA"]),
  ...over,
});

describe("ELITE COMMAND RADAR — 6 tiêu chí từ dữ liệu thật của danh mục", () => {
  it("chấm từng tiêu chí đúng thứ tự 6 tab; F-Score thấp không đạt Siêu Quét; sự kiện ngành tính vào Chất xúc tác", () => {
    expect(scoreTicker("AAA", src()).convergence).toEqual([1, 1, 1, 1, 0, 1]);
    expect(scoreTicker("DDD", src()).convergence[0]).toBe(0);
    expect(scoreTicker("EEE", src()).convergence).toEqual([1, 0, 0, 0, 1, 0]);
    const unknown = scoreTicker("ZZZ", src());
    expect(unknown.score).toBe(0);
    expect(unknown.missing).toContain("Siêu quét AI");
  });

  it("Core = ≥4/6 (tối đa 5), Ring = phần còn lại; trạng thái Core theo Siêu Quét; nguồn thiếu không tính là không đạt", () => {
    const m = buildRadarModel(["CCC", "AAA", "BBB", "EEE", "DDD"], src(), { AAA: { price: 21_000, changePct: 2.5 } }, "2026-10-02");
    expect(CORE_MIN).toBe(4);
    expect(m.core.map((n) => [n.ticker, n.state])).toEqual([["AAA", "stable"], ["BBB", "breakout"]]);
    expect(m.core[0]).toMatchObject({ price: 21_000, changePct: 2.5, livePrice: true, convergence: [1, 1, 1, 1, 0, 1] });
    expect(m.ring.map((n) => [n.ticker, n.score])).toEqual([["EEE", 2], ["CCC", 1], ["DDD", 0]]);
    expect(m.risk?.level).toBe("low");
    expect(m.digest?.text).toContain("Core: AAA 5/6, BBB 4/6.");
    expect(m.digest?.text).toContain("EEE gần Core nhất (2/6)");
    expect(m.missingSources).toEqual([]);
    const partial = buildRadarModel(["AAA"], src({ world: null, dividend: null }));
    expect(partial.missingSources).toEqual(["Kết nối thế giới", "Cổ tức · điểm mua"]);
    expect(partial.core).toEqual([]); // 3/6 khi thiếu nguồn
  });

  it("danh mục lớn: hiện tối đa 5 Core + 11 Ring, báo số mã ẩn; rủi ro tập trung khi Core dồn một nhóm", () => {
    const tickers = Array.from({ length: 20 }, (_, i) => `M${String(i).padStart(2, "0")}`);
    const scanner = new Map(tickers.map((t, i) => [t, item(t, 50 + i)]));
    const all = new Set(tickers);
    const m = buildRadarModel(tickers, { scanner, world: all, sector: all, ta: all, catalyst: all, dividend: new Set() });
    expect(m.core.length).toBe(5);
    expect(m.ring.length).toBe(11);
    expect(m.hidden).toBe(4);
    expect(m.core[0].ticker).toBe("M19"); // cùng điểm hội tụ -> Smart Score cao trước
    expect(m.risk?.level).toBe("high");
    expect(buildRadarModel([], src()).digest).toBeNull();
  });
});
