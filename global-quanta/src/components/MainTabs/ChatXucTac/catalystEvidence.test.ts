// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CATALYST_EVIDENCE as E } from "./catalystEvidence";

const dir = new URL("../../../../backend/src/market/catalystValidation/", import.meta.url);
const r = JSON.parse(readFileSync(new URL("X6-result.json", dir), "utf8"));
const s = JSON.parse(readFileSync(new URL("X6-sensitivity.json", dir), "utf8"));

describe("X6 — nhãn bằng chứng khớp file kết quả", () => {
  it("số kiểm định đặt trước", () => {
    expect(E.prereg.n20).toBe(r.primary.n);
    expect(E.prereg.meanSar20).toBeCloseTo(r.primary.mean, 4);
    expect(E.prereg.ci95[0]).toBeCloseTo(r.primary.lo, 4);
    expect(E.prereg.verdict).toBe(r.verdict);
  });
  it("sau khi loại dữ liệu mẫu + tin trung lập: dưới ngưỡng mẫu -> EXPERIMENTAL", () => {
    const c = s.results.exclSeedNeutral;
    expect(E.clean.n20).toBe(c.n);
    expect(E.clean.meanSar20).toBeCloseTo(c.mean, 4);
    expect(E.seedSignals).toBe(s.counts.seed);
    expect(c.n).toBeLessThan(E.minN);
    expect(E.label).toBe("EXPERIMENTAL");
  });
});
