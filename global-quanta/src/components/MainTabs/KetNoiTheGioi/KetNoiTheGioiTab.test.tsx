import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";

const { stub } = vi.hoisted(() => ({ stub: (id: string) => ({ default: () => <div data-testid={id} /> }) }));
vi.mock("./strategy/StrategyPanel", () => stub("f-strategy"));
vi.mock("./strategy/EvidenceLedgerPanel", () => stub("f-ledger"));
vi.mock("./worldSectors/WorldSectorPanel", () => stub("f-sectors"));
vi.mock("./CommodityPulseSubTab", () => stub("f-commodity"));
vi.mock("./StockImpactTable", () => stub("f-stocks"));
vi.mock("./AiAnalysisPanel", () => stub("f-ai"));
vi.mock("./WorldConfirmatoryPanel", () => stub("f-confirm"));
vi.mock("./WorldSourcePanel", () => stub("f-source"));
vi.mock("./center/SectorMap2D", () => stub("f-map"));
vi.mock("./center/TransmissionMap2D", () => stub("f-trans"));
vi.mock("./center/MarketMonitor", () => stub("f-monitor"));
vi.mock("./center/WorldNewsPanel", () => stub("f-news"));
vi.mock("../ChatXucTac/WorldTodayStrip", () => stub("f-today"));
vi.mock("../../../macro-center/src/ui/world/WorldTab", () => ({ WorldTab: ({ only }: { only: string }) => <div data-testid={`f-engine-${only}`} /> }));
vi.mock("../../../hooks/useGlobalStream", () => ({
  useGlobalStream: () => ({
    connected: true, source: "gateway", monthlyFromProjectA: true,
    data: {
      markets: [{ symbol: "^GSPC", name: "S&P 500", value: 6000, change_percent: 1 }],
      macro: { risk_status: "NEUTRAL", risk_on_score: 50, breakdown: { dxyScore: 50, vixScore: 50, treasuryScore: 50 }, dxy: 101, vix: 19, treasury_10y: 4.9, gold: 4000, oil_brent: 80, baltic_dry_index: null, quotes: {}, fetched_at: "2026-10-30T00:00:00Z" },
    },
  }),
}));
vi.mock("../../../services/marketDataClient", () => ({ fetchMarketJson: async () => ({}), isMarketGatewayEnabled: () => true }));
vi.mock("swr", () => ({ default: (key: unknown) => ({ data: key ? true : undefined }) }));

import KetNoiTheGioiTab from "./KetNoiTheGioiTab";

const open = (name: RegExp) => fireEvent.click(Array.from(document.querySelectorAll('[role="tab"]')).find((b) => name.test(b.textContent ?? ""))!);
const has = (id: string) => screen.queryByTestId(id) !== null;

beforeEach(() => { try { window.localStorage.clear(); } catch { /* */ } });
afterEach(cleanup);

describe("Trung tâm kinh tế thế giới — đủ tính năng ở đúng tab", () => {
  it("5 tab một tầng; mở đầu bằng Tổng quan, Risk-On không nằm ở đầu", () => {
    render(<KetNoiTheGioiTab />);
    expect(Array.from(document.querySelectorAll('[role="tab"]')).map((b) => b.textContent?.trim())).toEqual(["Tổng quan", "Ngành Việt Nam", "Hàng hoá & thị trường", "Cổ phiếu & kịch bản", "Bằng chứng & nguồn"]);
    for (const id of ["f-today", "f-news", "f-engine-overview", "f-map", "f-trans"]) expect(has(id)).toBe(true);
    expect(document.body.textContent).not.toContain("Risk-On Index");
  });

  it("mỗi tính năng cũ có mặt trong đúng một tab, tab chỉ tải khi mở, nhớ tab đang mở", () => {
    render(<KetNoiTheGioiTab />);
    open(/Ngành Việt Nam/);
    for (const id of ["f-strategy", "f-sectors", "f-engine-matrix"]) expect(has(id)).toBe(true);
    expect(has("f-map")).toBe(false);
    open(/Hàng hoá/);
    for (const id of ["f-monitor", "f-commodity", "f-engine-events", "f-engine-connect"]) expect(has(id)).toBe(true);
    open(/Cổ phiếu/);
    for (const id of ["f-stocks", "f-ai", "f-engine-scenario", "f-engine-stock"]) expect(has(id)).toBe(true);
    open(/Bằng chứng/);
    for (const id of ["f-ledger", "f-confirm", "f-source"]) expect(has(id)).toBe(true);
    expect(document.body.textContent).toContain("Risk-On Index");
    expect(window.localStorage.getItem("gq.world.tab.v1")).toBe("evidence");
    cleanup();
    render(<KetNoiTheGioiTab />);
    expect(has("f-ledger")).toBe(true);
  });

  it("phím mũi tên chuyển tab", () => {
    render(<KetNoiTheGioiTab />);
    const tab = document.querySelector('[role="tab"][aria-selected="true"]')!;
    act(() => { tab.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect(has("f-strategy")).toBe(true);
  });
});
