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

describe("R4 — bố cục radar, đổi gì hôm nay, khoảng P vượt", async () => {
  const { radarLayout, portfolioDiff, pOutperformRange, normCdf } = await import("./portfolioRadar");
  it("bố cục theo bề rộng khung: đủ cột ≥ 1000, trung bình 882–999 (giữ P vượt, bỏ cột động lực), gọn < 882; không vượt khung", () => {
    const full = radarLayout(1200, false), mid = radarLayout(980, false), mid2 = radarLayout(890, false), small = radarLayout(850, false);
    expect([full.dense, full.showDrivers]).toEqual([false, true]);
    expect([mid.dense, mid.showDrivers]).toEqual([false, false]);
    expect(mid.cols).toContain("74px");
    expect([small.dense, small.showDrivers]).toEqual([true, false]);
    expect(radarLayout(1200, true).dense).toBe(true);
    for (const [w, l] of [[1200, full], [980, mid], [890, mid2]] as const) expect(l.minWidth).toBeLessThanOrEqual(w);
    expect(full.trackW).toBeLessThanOrEqual(230);
    expect(mid.laneW).toBeGreaterThanOrEqual(170);
  });
  it("đổi gì hôm nay: mã vào kèm hạng; mã ra kèm lý do (vùng đệm, điều kiện, trần ngành, ngành Tụt hậu)", () => {
    const history = { dates: ["2026-11-05"], sessions: [{ date: "2026-11-05", portfolio: ["AAA", "BBB", "CCC", "DDD", "EEE"].map((t) => ({ ticker: t, rank: 1, Z: 1, weight: 0.2, retained: false })), ranks: {} }] };
    const d = {
      date: "2026-11-06",
      portfolio: [{ ticker: "AAA", rank: 1, Z: 2.5 }, { ticker: "NEW", rank: 3, Z: 2.1, rrgPenalty: true }],
      scores: [
        { ticker: "AAA", rank: 1, Z: 2.5, eligible: true, reason: null }, { ticker: "NEW", rank: 3, Z: 2.1, eligible: true, reason: null, rrgPenalty: true },
        { ticker: "BBB", rank: 45, Z: 0.5, eligible: true, reason: null }, { ticker: "CCC", rank: 9, Z: 1.4, eligible: false, reason: "giá bị neo" },
        { ticker: "DDD", rank: 12, Z: 1.2, eligible: true, reason: null }, { ticker: "EEE", rank: 60, Z: 0.2, eligible: true, reason: null, rrgPenalty: true },
      ],
      candidates: [{ ticker: "DDD", reason: "sector_cap" }],
    };
    const diff = portfolioDiff(history as never, d);
    expect(diff.prevDate).toBe("2026-11-05");
    expect(diff.kept).toBe(1);
    expect(diff.added[0].reasonVi).toContain("hạng 3");
    expect(diff.added[0].reasonVi).toContain("Tụt hậu");
    const why = Object.fromEntries(diff.removed.map((x) => [x.ticker, x.reasonVi]));
    expect(why.BBB).toContain("vùng đệm top 20");
    expect(why.CCC).toContain("giá bị neo");
    expect(why.DDD).toContain("đủ 3 mã");
    expect(why.EEE).toContain("Tụt hậu");
    expect(portfolioDiff(null, d).prevDate).toBeNull();
  });
  it("khoảng 95% của P vượt từ sai số IC ngoài mẫu; Z = 0 -> 50%; thiếu dữ liệu -> null", () => {
    expect(Math.abs(normCdf(1.96) - 0.975)).toBeLessThan(1e-4);
    const r = pOutperformRange(2.3, 0.031, 2.65)!;
    expect(r[0]).toBeGreaterThan(0.5);
    expect(r[1]).toBeGreaterThan(r[0]);
    expect(r[0]).toBeLessThan(normCdf((0.031 * 2.3) / Math.sqrt(1 - 0.031 ** 2)));
    const z0 = pOutperformRange(0, 0.031, 2.65)!;
    expect(Math.abs(z0[0] - 0.5)).toBeLessThan(1e-9);
    expect(pOutperformRange(2, null, 2)).toBeNull();
    expect(pOutperformRange(2, 0.03, 0)).toBeNull();
  });
});
