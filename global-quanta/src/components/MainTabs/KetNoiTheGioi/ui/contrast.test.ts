// G1/L2 (19/11/2026): chữ trên nền dữ liệu luôn đạt tương phản AA ở mọi mức của thang phân kỳ ngành.
import { describe, expect, it } from "vitest";
import { contrastRatio, inkOn, TONE_CHIP } from "./contrast";
import { divergingColor } from "../../../../lib/worldSectors/types";

describe("contrast", () => {
  // 20/11/2026: bước 0,1 bỏ sót z = −2,01 (4,48:1 với chữ #f8fafc, bắt được trên dữ liệu thật) -> quét bước 0,005, cả ngoài ±2,5.
  it("inkOn: mọi mức z từ −3 đến +3 (bước 0,005) đạt ≥ 4,5:1", () => {
    for (let z = -3; z <= 3.0001; z += 0.005) {
      const bg = divergingColor(z);
      expect(contrastRatio(inkOn(bg), bg), `z=${z.toFixed(3)} ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("nhãn ngữ nghĩa nền nhạt trên nền khối #0E131F đạt ≥ 4,5:1 (chữ tô trên nền đã trộn)", () => {
    const mix = (rgba: string) => { const [r, g, b, a] = rgba.match(/[\d.]+/g)!.map(Number); const s = [14, 19, 31]; return `rgb(${[r, g, b].map((c, i) => Math.round(c * a + s[i] * (1 - a))).join(",")})`; };
    for (const t of Object.values(TONE_CHIP)) expect(contrastRatio(t.color, mix(t.background))).toBeGreaterThanOrEqual(4.5);
  });
});
