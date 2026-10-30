// MTF v3 · S2 — thẻ Dow + giai đoạn ba khung và "chân dưới đổi theo chân trên".
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "../../../../test/rtl-lite";
import StructureFrames from "./StructureFrames";
import type { Context3, FrameSnapshot } from "../../../../hooks/useStructure3";

const f = (tf: "D" | "W" | "M", o: Partial<FrameSnapshot> = {}): FrameSnapshot => ({
  tf, date: "2026-10-29", dow: "UP", dowLabel: "Tăng", protectedLow: 95, pullbackHigh: null, lastHigh: 110, lastLow: 98, lastEvent: null,
  stage: "S2", stageLabel: "Giai đoạn 2", stageAge: 40, templateScore: 7, template: Array.from({ length: 7 }, (_, i) => ({ key: `c${i}`, ok: true, text: `đk ${i}` })), ...o,
});

describe("StructureFrames", () => {
  afterEach(() => cleanup());
  it("giai đoạn + Dow + đáy bảo vệ + sự kiện; tín hiệu đồng pha L với 2 bước đạt", () => {
    const ctx = {
      ribbon: {} as Context3["ribbon"],
      D: f("D", { dow: "BROKEN_DOWN", lastEvent: { type: "CHOCH_UP", label: "Đổi tính chất ↑", ago: 2, date: "2026-10-27", close: 101 }, protectedLow: null }),
      W: f("W", { stage: "NA", template: [], templateScore: 0 }),
      M: f("M", { stage: "S4", dow: "DOWN", pullbackHigh: 130, protectedLow: null, stageAge: 5 }),
      trigger: { side: "L", ago: 2, steps: [{ key: "w", ok: true, text: "Tuần tăng" }, { key: "d", ok: true, text: "Ngày CHoCH" }] },
    } as Context3;
    render(<StructureFrames ctx={ctx} />);
    expect(screen.getByTestId("frame-stage-D").textContent).toBe("GĐ 2 · Tăng · 40");
    expect(screen.getByTestId("frame-stage-W").textContent).toBe("Chưa đủ MA200");
    expect(screen.getByTestId("frame-stage-M").textContent).toContain("GĐ 4 · Giảm");
    expect(screen.getByTestId("frame-dow-M").textContent).toBe("Dow giảm");
    expect(screen.getByTestId("frame-M").textContent).toContain("Đỉnh hồi");
    expect(screen.getByTestId("frame-event-D").textContent).toContain("2 phiên trước (27/10/2026)");
    expect(screen.getByTestId("mtf-trigger-side").textContent).toContain("TĂNG cùng Tuần · 2 phiên");
  });
});
