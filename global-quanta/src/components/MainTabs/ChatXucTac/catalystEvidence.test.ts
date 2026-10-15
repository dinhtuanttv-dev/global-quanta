// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CATALYST_EVIDENCE as E } from "./catalystEvidence";

const r = JSON.parse(readFileSync(new URL("../../../../backend/src/market/catalystValidation/X6-result.json", import.meta.url), "utf8"));

describe("X6 — nhãn bằng chứng khớp file kết quả đặt trước", () => {
  it("số liệu và nhãn", () => {
    expect(E.label).toBe(r.evidence);
    expect(E.n20).toBe(r.primary.n);
    expect(E.meanSar20).toBeCloseTo(r.primary.mean, 4);
    expect(E.ci95[0]).toBeCloseTo(r.primary.lo, 4);
    expect(E.ci95[1]).toBeCloseTo(r.primary.hi, 4);
    expect(E.hitRate20).toBeCloseTo(r.primary.hitRate, 4);
    expect(E.meanSar5).toBeCloseTo(r.secondary.sar5.mean, 4);
  });
});
