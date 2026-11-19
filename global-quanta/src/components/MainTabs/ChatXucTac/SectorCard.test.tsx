// V3 (19/11/2026): điểm ròng ngành không phải tỷ lệ; tỷ lệ thắng mặc định 50 (chưa có số liệu hiệu chỉnh) không hiển thị như số đo.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "../../../test/rtl-lite";
import SectorCard from "./SectorCard";
import { isDefaultWinRate, winRateText } from "./CatalystCardRow";
import type { CatalystCard, CatalystSector } from "../../../types/catalyst";

vi.mock("./DeepAnalysisDrawer", () => ({ default: () => null }));
afterEach(cleanup);

const card = (over: Partial<CatalystCard>): CatalystCard => ({
  ticker: "CTG", sourceId: "e1", sourceTitle: "CTG: hủy niêm yết trái phiếu", direction: "harm", netSignedImpact: -4.19, propagationDistance: "direct",
  hopCount: 1, horizon: "long", scheduled: false, daysRemaining: null, corroborationCount: 1, historicalWinRate: 50, priceInStatus: "not_reflected",
  volumeFlag: "none", foreignFlowDirection: "none", opportunityScore: -3.06, isBestPickInGroup: false, isConflicted: true, isWatchlisted: false,
  compositeScore: 38, trustScore: 59, ...over,
} as CatalystCard);

// payload thật /api/catalysts/latest 19/11/2026: ngành Ngân hàng netScore 35,55
const sector = (cards: CatalystCard[]): CatalystSector => ({ sector: "Ngan hang", netScore: 35.55107867610924, tickerCount: 23, primaryCards: cards, cascadeCards: [] } as unknown as CatalystSector);

describe("Thẻ ngành Chất xúc tác", () => {
  it("điểm ròng hiển thị đúng đơn vị (không nhân 100, không có %)", () => {
    const { container } = render(<SectorCard sector={sector([card({})])} />);
    const t = container.textContent ?? "";
    expect(t).toContain("Điểm ròng +35,55");
    expect(t).not.toMatch(/3555|%\s*23 mã|Net \+/);
  });
  it("tỷ lệ thắng mặc định 50 -> 'chưa đủ mẫu'; số đo thật vẫn hiện %", () => {
    const { container } = render(<SectorCard sector={sector([card({}), card({ ticker: "SSB", sourceId: "e2", historicalWinRate: 62 })])} />);
    const t = container.textContent ?? "";
    expect(t).toContain("Tỷ lệ thắng: chưa đủ mẫu");
    expect(t).toContain("Tỷ lệ thắng: 62%");
    expect(t).not.toContain("Tỷ lệ thắng: 50%");
    expect(isDefaultWinRate(50)).toBe(true);
    expect(winRateText(48)).toBe("48%");
  });
});
