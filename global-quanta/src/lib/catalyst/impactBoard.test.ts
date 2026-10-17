import { describe, expect, it } from "vitest";
import { ageDays, askTicker, catalystByIcb, CATALYST_SECTOR_ICB } from "./impactBoard";

describe("impactBoard — ghép xúc tác theo ICB", () => {
  it("gom điểm ngành + mã có tác động vào đúng ICB, bỏ mã/ngành không ánh xạ được", () => {
    const snap = {
      sectors: [
        { sector: "Thep", netScore: 1.5 }, { sector: "Khu cong nghiep", netScore: -0.5 }, { sector: "Bat dong san", netScore: 1 }, { sector: "La", netScore: 9 },
      ],
      tickerImpacts: { HPG: { direction: "benefit", compositeScore: 20 }, VHM: { direction: "harm", compositeScore: 10 }, PVS: { direction: "none", compositeScore: 0 }, ZZZ: { direction: "benefit", compositeScore: 5 } },
    } as never;
    const m = catalystByIcb(snap, new Map([["1750", ["HPG", "HSG"]], ["8600", ["VHM"]], ["0500", ["PVS"]]]));
    expect(m.get("1750")).toEqual({ netScore: 1.5, sectors: ["Thep"], benefit: ["HPG"], harm: [] });
    expect(m.get("8600")).toEqual({ netScore: 0.5, sectors: ["Khu cong nghiep", "Bat dong san"], benefit: [], harm: ["VHM"] });
    expect(m.has("0500")).toBe(false);
    expect([...m.keys()].sort()).toEqual(["1750", "8600"]);
  });

  it("mọi ngành xúc tác ánh xạ vào mã ICB 4 chữ số; tuổi dữ liệu theo ngày; câu hỏi mồi có mã", () => {
    expect(Object.values(CATALYST_SECTOR_ICB).every((c) => /^\d{4}$/.test(c))).toBe(true);
    expect(catalystByIcb(null, new Map()).size).toBe(0);
    expect(ageDays("2026-10-10T22:56:25Z", Date.parse("2026-10-17T05:00:00Z"))).toBe(6);
    expect(ageDays(null)).toBeNull();
    expect(askTicker("HPG")).toContain("HPG");
  });
});
