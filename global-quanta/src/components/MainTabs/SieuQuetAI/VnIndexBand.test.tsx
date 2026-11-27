// OV-1 (27/11/2026): dải VN-Index — bản rút gọn (tab Bảng giao dịch) và bản đầy đủ (mặc định như cũ / tab Thị trường).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";

vi.mock("../../../hooks/useResearch", () => ({ useResearchOverview: () => ({ data: null }) }));
vi.mock("./MarketCenterPanel", () => ({ default: () => <div data-testid="stub-mc" /> }));
import VnIndexBand from "./VnIndexBand";

const state = { trendLabel: "Tăng", trendBias: "uptrend", impulseScore: 70, rsi14: 61.2, breakoutProbability: 44 } as never;
beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("VnIndexBand", () => {
  it("mặc định (full): như trước — có Trung tâm thị trường, Chi tiết đóng, mở ra thấy 3 khối", () => {
    render(<VnIndexBand indexState={state} technical={<i data-testid="t" />} impulse={<i data-testid="i" />} aiPanel={null} toggle={null} />);
    expect(screen.getByTestId("stub-mc")).toBeTruthy();
    expect(screen.queryByTestId("t")).toBeNull();
    fireEvent.click(screen.getByText("Chi tiết ▾"));
    expect(screen.getByTestId("t")).toBeTruthy(); expect(screen.getByTestId("i")).toBeTruthy();
    expect(window.localStorage.getItem("gq.vnBandOpen")).toBe("1");
  });
  it("compact: 1 dòng chỉ số + nút sang tab Thị trường; không Trung tâm thị trường, không Chi tiết", () => {
    const open = vi.fn();
    render(<VnIndexBand variant="compact" indexState={state} onOpenMarket={open} />);
    expect(screen.getByTestId("vn-band-compact").textContent).toContain("RSI14");
    expect(screen.queryByTestId("stub-mc")).toBeNull();
    expect(screen.getByTestId("vn-band-compact").textContent).not.toContain("Chi tiết");
    fireEvent.click(screen.getByTestId("vn-band-open-market"));
    expect(open).toHaveBeenCalledTimes(1);
  });
  it("tab Thị trường: không lặp Trung tâm thị trường, Chi tiết mở sẵn và nhớ riêng; lỗi bảng quét báo rõ", () => {
    render(<VnIndexBand indexState={null} error="HTTP 503" technical={<i data-testid="t" />} showMarketCenter={false} openKey="gq.vnBandOpen.market" defaultOpen />);
    expect(screen.queryByTestId("stub-mc")).toBeNull();
    expect(screen.getByTestId("t")).toBeTruthy();
    expect(screen.getByTestId("vn-band").textContent).toContain("HTTP 503");
    fireEvent.click(screen.getByText("Thu gọn ▴"));
    expect(window.localStorage.getItem("gq.vnBandOpen.market")).toBe("0");
    expect(window.localStorage.getItem("gq.vnBandOpen")).toBeNull();
  });
});
