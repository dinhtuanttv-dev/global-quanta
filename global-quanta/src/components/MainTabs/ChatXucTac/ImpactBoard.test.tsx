import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";

const strategy = {
  vnLast: "2026-10-16", version: "S1",
  evidence: { short: { label: "EVIDENCE", ic: 0.0203, t: 2.5, version: "WS-v1", sample: "x" }, medium: { label: "EXPERIMENTAL", reasonVi: "không đạt" } },
  regime: { stressed: true, vix: 19.99, vixChg: 21.45, date: "2026-10-16", noteVi: "Biến động cao." },
  short: { n: 2, rows: [
    { icb: "1750", nameVi: "Kim loại công nghiệp", parent: null, stance: "overweight", alphaBps: 3.5, pOutperform: 0.51, constituents: [{ ticker: "HPG", weight: 0.25 }] },
    { icb: "8600", nameVi: "Bất động sản", parent: null, stance: "underweight", alphaBps: -4, pOutperform: 0.49, constituents: [{ ticker: "VHM", weight: 0.3 }] },
  ] },
  medium: [{ icb: "8600", stance: "adverse" }],
};
vi.mock("../../../hooks/useWorldStrategy", () => ({ useWorldStrategy: () => ({ data: strategy }) }));
vi.mock("../../../hooks/useWorldSectorScores", () => ({ useWorldSectorScores: () => ({ data: { rows: [{ icb: "1750", drivers: [{ id: "HRC", nameVi: "Thép HRC", sign: 1, short: { z: 1, pct: 5.6 }, medium: null }] }] } }) }));
vi.mock("../../../hooks/useCommoditySnapshot", () => ({ useCommoditySnapshot: () => ({ data: { items: [] } }) }));
vi.mock("../../../hooks/useCatalystData", () => ({ useCatalystData: () => ({ snapshot: { scannedAt: "2026-10-10T22:56:25Z", sectors: [{ sector: "Thep", netScore: 1 }], tickerImpacts: { HPG: { direction: "benefit", compositeScore: 20 } } } }) }));
vi.mock("../KetNoiTheGioi/worldSectors/WorldSectorDrawer", () => ({ default: () => null }));

import ImpactBoard from "./ImpactBoard";

afterEach(cleanup);

describe("ImpactBoard (Z3)", () => {
  it("ghép chiến lược + hàng hoá + xúc tác theo ICB, báo engine xúc tác cũ, nút Hỏi AI gửi câu hỏi mồi", () => {
    const asks: string[] = [];
    render(<ImpactBoard onAsk={(q) => asks.push(q)} />);
    expect(screen.getByTestId("impact-catalyst-stale").textContent).toContain("10/10/2026");
    const steel = screen.getByTestId("impact-row-1750").textContent ?? "";
    expect(steel).toContain("Ưu tiên");
    expect(steel).toContain("Thép HRC");
    expect(steel).toContain("▲ HPG");
    expect(screen.getByTestId("impact-row-8600").textContent).toContain("Bối cảnh bất lợi");
    fireEvent.click(screen.getByTestId("impact-row-8600").querySelector("button")!);
    expect(asks[0]).toContain("ICB 8600");
  });
});
