// Radar danh mục Elite 10 — hạng, lên/xuống hạng, vệt Z, sự kiện, xếp trực tiếp, vị trí giá trong dải cắt lỗ–mục tiêu.
import { describe, expect, it } from "vitest";
import { liveExcess, portfolioEvents, rankMoves, sortPicks, stopTargetPosition, zTrails, type RankHistory } from "./portfolioRadar";

const H: RankHistory = {
  dates: ["2026-10-27", "2026-10-28", "2026-10-29"],
  sessions: [
    { date: "2026-10-27", portfolio: [{ ticker: "VPI", rank: 14, Z: 1.8, weight: 0.1, retained: false }], ranks: { VPI: { rank: 14, Z: 1.8 }, IDC: { rank: 16, Z: 1.7 } } },
    { date: "2026-10-28", portfolio: [{ ticker: "VPI", rank: 7, Z: 2.1, weight: 0.1, retained: true }, { ticker: "MCH", rank: 24, Z: 1.4, weight: 0.1, retained: true }, { ticker: "IDC", rank: 8, Z: 2.0, weight: 0.1, retained: true }],
      ranks: { VPI: { rank: 7, Z: 2.1 }, IDC: { rank: 8, Z: 2.0 }, MCH: { rank: 24, Z: 1.4 }, AAS: { rank: 30, Z: 1.2 } } },
    { date: "2026-10-29", portfolio: [{ ticker: "VPI", rank: 2, Z: 2.4, weight: 0.07, retained: true }, { ticker: "IDC", rank: 4, Z: 2.3, weight: 0.09, retained: true }, { ticker: "AAS", rank: 5, Z: 2.2, weight: 0.06, retained: false }],
      ranks: { VPI: { rank: 2, Z: 2.4 }, IDC: { rank: 4, Z: 2.3 }, AAS: { rank: 5, Z: 2.2 }, MCH: { rank: 41, Z: 0.9 } } },
  ],
};
const picks = [{ ticker: "IDC", rank: 4 }, { ticker: "VPI", rank: 2 }, { ticker: "AAS", rank: 5 }];

describe("Radar danh mục Elite 10", () => {
  it("lên/xuống hạng so phiên quyết định trước; mã mới vào", () => {
    const m = rankMoves(H, "2026-10-29", picks);
    expect(m.get("VPI")).toEqual({ prevRank: 7, delta: 5, isNew: false });
    expect(m.get("IDC")).toEqual({ prevRank: 8, delta: 4, isNew: false });
    expect(m.get("AAS")).toEqual({ prevRank: 30, delta: 25, isNew: true });
    expect(rankMoves(null, "2026-10-29", picks).get("VPI")).toEqual({ prevRank: null, delta: null, isNew: false });
  });
  it("vệt Z: các phiên TRƯỚC phiên đang xem, cũ -> mới", () => {
    expect(zTrails(H, "2026-10-29", ["VPI", "AAS"]).get("VPI")).toEqual([1.8, 2.1]);
    expect(zTrails(H, "2026-10-29", ["VPI", "AAS"]).get("AAS")).toEqual([1.2]);
    expect(zTrails(H, "2026-10-28", ["VPI"]).get("VPI")).toEqual([1.8]);
  });
  it("sự kiện: vào, ra (kèm hạng mới), lên ≥ 3 hạng", () => {
    const ev = portfolioEvents(H, "2026-10-29", picks);
    expect(ev.map((e) => e.kind + ":" + e.ticker)).toEqual(["enter:AAS", "leave:MCH", "rank_up:IDC", "rank_up:VPI"]);
    expect(ev.find((e) => e.kind === "leave")!.text).toBe("MCH ra khỏi danh mục (nay hạng #41)");
    expect(ev.find((e) => e.ticker === "VPI")!.text).toBe("VPI lên 5 hạng (#7 → #2)");
  });
  it("xếp hàng: hạng Elite (1 trước); trực tiếp theo vượt VN-Index (thiếu số -> cuối)", () => {
    const rows = [{ ticker: "IDC", rank: 4, pOutperform: 0.52, weight: 0.09 }, { ticker: "VPI", rank: 2, pOutperform: 0.53, weight: 0.07 }, { ticker: "AAS", rank: 5, pOutperform: 0.54, weight: 0.06 }];
    expect(sortPicks(rows, "rank").map((r) => r.ticker)).toEqual(["VPI", "IDC", "AAS"]);
    expect(sortPicks(rows, "prob").map((r) => r.ticker)).toEqual(["AAS", "VPI", "IDC"]);
    expect(sortPicks(rows, "weight").map((r) => r.ticker)).toEqual(["IDC", "VPI", "AAS"]);
    expect(sortPicks(rows, "live", new Map([["IDC", 0.012], ["AAS", -0.004], ["VPI", null]])).map((r) => r.ticker)).toEqual(["IDC", "AAS", "VPI"]);
  });
  it("vượt VN-Index từ lúc dựng; vị trí giá trong dải cắt lỗ → mục tiêu", () => {
    expect(liveExcess(100, 103, 1000, 1010)).toBeCloseTo(1.03 / 1.01 - 1, 12);
    expect(liveExcess(100, 103, null, null)).toBeCloseTo(0.03, 12);
    expect(liveExcess(null, 103, 1, 1)).toBeNull();
    expect(stopTargetPosition(55, 50, 60)).toBeCloseTo(0.5);
    expect(stopTargetPosition(48, 50, 60)).toBeCloseTo(-0.2);
    expect(stopTargetPosition(null, 50, 60)).toBeNull();
  });
});
