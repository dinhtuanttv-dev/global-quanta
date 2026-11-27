// OV-1 (27/11/2026): tab TỔNG QUAN 2 tab con — các điểm nối phải giữ đúng tính năng cũ.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import type { OverviewFilters } from "./overviewNav";

const h = vi.hoisted(() => ({
  store: { scannerFocus: null as null | { ticker: string; nonce: number }, scanSectorFocus: null as null | { code: string; nonce: number } },
  tab: null as null | { filters: OverviewFilters; onOpenMarket: () => void },
  market: null as null | { activeSector: string | null; onSector: (s: unknown) => void; onIndustry: (n: string | null) => void },
}));
vi.mock("../../../store/useAppStore", () => ({ useAppStore: (sel: (s: typeof h.store) => unknown) => sel(h.store) }));
vi.mock("../../../hooks/useSieuQuetScanner", () => ({ useSieuQuetScanner: () => ({ items: [{ ticker: "FPT" }, { ticker: "HPG" }], isLoading: false }) }));
vi.mock("../../../hooks/usePreopen", () => ({ usePreopen: () => ({ data: { lead: "mid", scenarios: [{ id: "mid", name: "Đi ngang" }] } }) }));
vi.mock("./SieuQuetAiTab", () => ({ default: (p: NonNullable<typeof h.tab>) => { h.tab = p; return <div data-testid="stub-bang">{p.filters.sectorScope?.code ?? ""}|{[...p.filters.industries].join(",")}</div>; } }));
vi.mock("./MarketView", () => ({ default: (p: NonNullable<typeof h.market>) => { h.market = p; return <div data-testid="stub-market">{p.activeSector ?? ""}</div>; } }));

import OverviewTab, { resetOverviewSwitches } from "./OverviewTab";
import { overviewShortcut, readOverviewView } from "./overviewNav";

const view = () => new URLSearchParams(window.location.search).get("view");
const sector = { code: "8300", name: "Ngân hàng", tickers: ["VCB", "BID"] } as never;

beforeEach(() => {
  window.localStorage.clear(); window.history.replaceState(null, "", "/?tab=tong-quan");
  h.store.scannerFocus = null; h.store.scanSectorFocus = null; h.tab = null; h.market = null; resetOverviewSwitches();
});
afterEach(cleanup);

describe("TỔNG QUAN · 2 tab con", () => {
  it("mặc định mở Bảng giao dịch, ghi ?view=bang, giữ tham số tab; nhãn trạng thái hai tab", () => {
    render(<OverviewTab />);
    expect(screen.getByTestId("stub-bang")).toBeTruthy();
    expect(view()).toBe("bang");
    expect(new URLSearchParams(window.location.search).get("tab")).toBe("tong-quan");
    expect(screen.getByTestId("overview-view-bang").textContent).toContain("Bảng giao dịch");
    expect(screen.getByTestId("overview-view-bang").textContent).toContain("2 mã");
    expect(screen.getByTestId("overview-view-thi-truong").textContent).toContain("Đi ngang");
  });

  it("đổi sang Thị trường: chỉ gắn tab con đang xem, ghi URL + nhớ; mở lại theo lựa chọn đã nhớ; URL ưu tiên hơn", () => {
    render(<OverviewTab />);
    fireEvent.click(screen.getByTestId("overview-view-thi-truong"));
    expect(screen.getByTestId("stub-market")).toBeTruthy();
    expect(screen.queryByTestId("stub-bang")).toBeNull();
    expect(view()).toBe("thi-truong");
    cleanup(); window.history.replaceState(null, "", "/?tab=tong-quan");
    render(<OverviewTab />);
    expect(screen.getByTestId("stub-market")).toBeTruthy();
    expect(readOverviewView("?view=bang")).toBe("bang");
    expect(readOverviewView("?view=xyz")).toBe("thi-truong");
  });

  it("bấm ngành ở tab Thị trường -> lọc bảng và chuyển sang Bảng giao dịch; bỏ chọn ngành thì ở lại", () => {
    window.history.replaceState(null, "", "/?tab=tong-quan&view=thi-truong");
    render(<OverviewTab />);
    act(() => { h.market!.onSector(null); });
    expect(screen.getByTestId("stub-market")).toBeTruthy();
    act(() => { h.market!.onSector(sector); });
    expect(screen.getByTestId("stub-bang").textContent).toBe("8300|");
    expect(view()).toBe("bang");
    // Quay lại Thị trường: bản đồ nhiệt vẫn tô ngành đang lọc; ghi chú "đang lọc" hiện trên thanh tab con.
    fireEvent.click(screen.getByTestId("overview-view-thi-truong"));
    expect(screen.getByTestId("stub-market").textContent).toBe("8300");
    expect(screen.getByTestId("overview-tabs").textContent).toContain("đang lọc ngành Ngân hàng");
    // Nhóm ngành (Index Impact / Kịch bản) -> bộ lọc ngành của thanh công cụ, xoá lọc ICB (loại trừ như cũ).
    act(() => { h.market!.onIndustry("Ngân hàng"); });
    expect(screen.getByTestId("stub-bang").textContent).toBe("|Ngân hàng");
  });

  it("lệnh tìm mã / chọn ngành mới -> về Bảng giao dịch; mở lại TỔNG QUAN với lệnh cũ giữ tab đã nhớ", () => {
    window.localStorage.setItem("gq.overview.view", "thi-truong");
    h.store.scannerFocus = { ticker: "FPT", nonce: 1 };
    render(<OverviewTab />);
    expect(screen.getByTestId("stub-bang")).toBeTruthy();
    fireEvent.click(screen.getByTestId("overview-view-thi-truong"));
    cleanup(); window.history.replaceState(null, "", "/?tab=tong-quan");
    render(<OverviewTab />);
    expect(screen.getByTestId("stub-market")).toBeTruthy();
    cleanup(); h.store.scanSectorFocus = { code: "8300", nonce: 1 };
    render(<OverviewTab />);
    expect(screen.getByTestId("stub-bang")).toBeTruthy();
  });

  it("nút 'Xem phân tích thị trường' của tab 1 mở tab 2; phím 1 / 2 đổi tab con, không khi đang gõ", () => {
    render(<OverviewTab />);
    act(() => { h.tab!.onOpenMarket(); });
    expect(screen.getByTestId("stub-market")).toBeTruthy();
    act(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "1" })); });
    expect(screen.getByTestId("stub-bang")).toBeTruthy();
    const input = document.createElement("input");
    expect(overviewShortcut({ key: "2", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, target: input })).toBeNull();
    expect(overviewShortcut({ key: "2", altKey: false, ctrlKey: true, metaKey: false, shiftKey: false, target: document.body })).toBeNull();
    expect(overviewShortcut({ key: "2", altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, target: document.body })).toBe("thi-truong");
  });
});
