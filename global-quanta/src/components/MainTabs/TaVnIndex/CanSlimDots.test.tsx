import { describe, expect, it } from "vitest";
import { factorState } from "./CanSlimDots";

const c = (factor: string, ok: boolean) => ({ key: factor + ok, factor, label: "x", max: 5, points: ok ? 5 : 0, ok, value: null }) as never;

describe("CanSlimDots.factorState", () => {
  it("đủ / một phần / chưa đạt theo các tiêu chí của từng yếu tố", () => {
    const list = [c("C", true), c("C", true), c("A", true), c("A", false), c("M", false)];
    expect(factorState(list, "C")).toBe("full");
    expect(factorState(list, "A")).toBe("partial");
    expect(factorState(list, "M")).toBe("none");
    expect(factorState(list, "I")).toBe("none");
  });
});
