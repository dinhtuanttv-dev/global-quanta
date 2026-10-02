import { describe, expect, it } from "vitest";
import real from "./__fixtures__/fpt-seasonality.prod.json";
import { parseAnnualEarningsCalendar, parseEarningsCycleStats } from "./seasonality.schema";
import { parseCyclePaths } from "./cycle-paths.schema";

// Hợp đồng dữ liệu với Project A: phản hồi THẬT của production (FPT, 03/10/2026) phải qua đúng schema zod mà giao diện dùng.
describe("hợp đồng /api/cotuc mùa vụ KQKD (dữ liệu thật production)", () => {
  it("earnings-cycle-stats 4 quý, earnings-cycle-paths 4 quý, annual-earnings-calendar đều hợp lệ", () => {
    for (const q of ["1", "2", "3", "4"] as const) {
      const s = parseEarningsCycleStats((real.stats as Record<string, unknown>)[q]);
      expect(s.ok ? "ok" : s.issues.join("; ")).toBe("ok");
      const p = parseCyclePaths((real.paths as Record<string, unknown>)[q]);
      expect(p.ok ? "ok" : p.issues.join("; ")).toBe("ok");
    }
    const c = parseAnnualEarningsCalendar(real.calendar);
    expect(c.ok ? "ok" : c.issues.join("; ")).toBe("ok");
    expect((real.signals as { count: number }).count).toBe(17);
  });
});
