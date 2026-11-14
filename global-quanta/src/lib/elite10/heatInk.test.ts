import { describe, expect, it } from "vitest";
import { heatInk } from "./heatInk";
import { divergingColor } from "../worldSectors/types";

const lin = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const lum = (c: string) => { const m = /(\d+),\s*(\d+),\s*(\d+)/.exec(c)!; return 0.2126 * lin(+m[1]) + 0.7152 * lin(+m[2]) + 0.0722 * lin(+m[3]); };

describe("heatInk — màu chữ trên ô nhiệt", () => {
  it("mọi mức màu của thang phân kỳ đều đạt tương phản ≥ 4,5:1", () => {
    for (let z = -3; z <= 3; z += 0.05) {
      const bg = divergingColor(z), ink = heatInk(bg);
      const a = lum(bg), b = ink === "#ffffff" ? 1 : 0;
      expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("nền trong suốt (ô chưa có số) -> chữ sáng", () => { expect(heatInk(divergingColor(null))).toBe("#ffffff"); });
});
