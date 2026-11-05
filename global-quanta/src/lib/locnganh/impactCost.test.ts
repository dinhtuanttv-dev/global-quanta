import { describe, expect, it } from "vitest";
import { IMPACT_MAX_PARTICIPATION, sigmaFromLowVol, sqrtImpact } from "./impactCost";

describe("chi phí tác động căn bậc hai", () => {
  it("Y·σ·√(Q/ADV): σ 2%, lệnh 1% GTGD -> 0,2%", () => {
    const e = sqrtImpact(0.02, 100e9, 1e9)!;
    expect(e.participation).toBeCloseTo(0.01, 10);
    expect(e.costPct).toBeCloseTo(0.2, 10);
    expect(e.unreliable).toBe(false);
  });
  it("gấp 4 lệnh -> gấp đôi chi phí; vượt 10% GTGD -> cờ kém tin cậy", () => {
    expect(sqrtImpact(0.02, 100e9, 4e9)!.costPct / sqrtImpact(0.02, 100e9, 1e9)!.costPct).toBeCloseTo(2, 10);
    expect(sqrtImpact(0.02, 10e9, 10e9 * IMPACT_MAX_PARTICIPATION)!.unreliable).toBe(false);
    expect(sqrtImpact(0.02, 10e9, 1.5e9)!.unreliable).toBe(true);
  });
  it("thiếu hoặc sai số liệu thì không đoán", () => {
    for (const [s, a] of [[null, 1e9], [0.02, null], [0, 1e9], [0.02, 0], [Number.NaN, 1e9]] as const) expect(sqrtImpact(s, a, 1e9)).toBeNull();
    expect(sigmaFromLowVol(-0.021)).toBe(0.021);
    expect(sigmaFromLowVol(null)).toBeNull();
    expect(sigmaFromLowVol(0.01)).toBeNull();
  });
});
