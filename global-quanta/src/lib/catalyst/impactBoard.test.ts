import { describe, expect, it } from "vitest";
import { askSector, askTicker } from "./impactBoard";

describe("câu hỏi mồi Tác động ngành & cổ phiếu", () => {
  it("nêu đúng ngành / mã và không còn nhắc chất xúc tác", () => {
    expect(askSector("Thép", "1750")).toContain("ICB 1750");
    expect(askTicker("FPT")).toContain("FPT");
    expect(askSector("Thép", "1750") + askTicker("FPT")).not.toContain("xúc tác");
  });
});
