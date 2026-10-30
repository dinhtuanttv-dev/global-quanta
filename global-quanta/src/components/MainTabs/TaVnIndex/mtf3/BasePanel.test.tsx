// MTF v3 · S4 — thẻ vùng củng cố + mức giá.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "../../../../test/rtl-lite";
import BasePanel from "./BasePanel";
import type { Base3View } from "../../../../hooks/useStructure3";

const base: Base3View = {
  from: "2026-07-01", to: "2026-10-29", bars: 85, weeks: 17, leftHigh: 100, low: 76, lowDate: "2026-07-29", depthPct: 24,
  contractions: [{ hiDate: "2026-07-01", hi: 100, loDate: "2026-07-29", lo: 76, depthPct: 24 }, { hiDate: "2026-08-26", hi: 96, loDate: "2026-09-15", lo: 86, depthPct: 10.4 }, { hiDate: "2026-10-03", hi: 95, loDate: "2026-10-15", lo: 90, depthPct: 5.3 }],
  vcp: true, footprint: "17W 24/5 3T", pivot: 95, pivotDate: "2026-10-03", dryUp: 0.52, dry: true, undercuts: ["2026-09-12"], vShape: false,
  valid: true, reasons: [], pattern: "VCP", patternLabel: "VCP · thu hẹp biến động", baseCount: 2, breakout: { date: "2026-10-29", volRatio: 2.1 },
};

describe("BasePanel", () => {
  afterEach(() => cleanup());
  it("VCP: mô hình, dấu chân, nhịp co, KL cạn, phá vỡ, nền thứ 2; mức giá có vai trò + khung + đổi vai; Tuần không có nền", () => {
    render(<BasePanel D={base} W={null} close={96} levels={[
      { price: 100, lo: 99.5, hi: 100.4, strength: 7, touches: 3, frames: ["D", "W"], role: "resistance", flipped: false, lastTouch: "2026-07-01" },
      { price: 86, lo: 85.8, hi: 86.2, strength: 3, touches: 2, frames: ["D"], role: "support", flipped: true, lastTouch: "2026-09-15" },
    ]} />);
    expect(screen.getByTestId("base-pattern").textContent).toContain("VCP");
    expect(screen.getByTestId("base-D").textContent).toContain("17W 24/5 3T");
    expect(screen.getByTestId("base-D").textContent).toContain("−24% → −10,4% → −5,3%");
    expect(screen.getByTestId("base-D").textContent).toContain("cạn");
    expect(screen.getByTestId("base-breakout").textContent).toContain("29/10/2026");
    expect(screen.getByTestId("base-D").textContent).toContain("Nền thứ 2");
    expect(screen.getByTestId("base-sketch")).toBeTruthy();
    expect(screen.getByTestId("base-panel").textContent).toContain("Tuần: giá đang ở đỉnh mới");
    const rows = screen.getAllByTestId("level3-row");
    expect(rows[0].textContent).toContain("Kháng cự");
    expect(rows[1].textContent).toContain("đổi vai");
  });
});
