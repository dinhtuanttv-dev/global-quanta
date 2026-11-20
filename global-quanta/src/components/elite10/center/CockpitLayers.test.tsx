// BUỒNG LÁI C1–C5 (20/11/2026): các khối trên Bảng quyết định — dữ liệu thật 18/11 (Command Deck) + lịch sử / nhật ký PZ thật.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import fixture from "../../../lib/elite10/__fixtures__/deck-2026-11-18.json";
import fx from "../../../lib/elite10/__fixtures__/cockpit-2026-11-19-20.json";
import type { EliteDecision } from "../../../lib/elite10/decisionTypes";

const d = fixture.decision as unknown as EliteDecision;
vi.mock("swr", () => ({ default: (key: unknown) => ({ data: key === "elite-hl-watch-log" ? { entries: fx.log } : Array.isArray(key) && key[0] === "elite-hl-history" ? fx.history : undefined }) }));
vi.mock("../../../services/marketDataClient", async (orig) => ({ ...(await orig<typeof import("../../../services/marketDataClient")>()), isMarketGatewayEnabled: () => true }));
vi.mock("../../../hooks/useSmartNews", () => ({ useSmartNews: () => ({ data: undefined, error: null, isLoading: false, enabled: true }) }));
vi.mock("../../../hooks/useRadarSignals", () => ({ useRadarSignals: () => ({ data: null, error: null, isLoading: false, enabled: true }) }));
vi.mock("../../../store/useAppStore", () => ({ useAppStore: (sel: (s: unknown) => unknown) => sel({ livePrices: {} }) }));
vi.mock("../../../hooks/elite10/useDeckData", () => ({ useDeckRisk: () => ({ data: fixture.risk }), useDeckPanel: () => ({ data: fixture.panel }), useEvidenceRegistry: () => ({ data: null }) }));
vi.mock("../../../hooks/useWorldStrategy", () => ({ useWorldStrategy: () => ({ data: { short: { rows: [] }, regime: fixture.world.regime } }) }));
vi.mock("../../../hooks/elite10/useHlLedger", () => ({ useHlLedger: () => ({ data: null }) }));
vi.mock("../../../hooks/elite10/useEliteTiming", () => ({ useEliteTiming: () => ({ data: { rows: [] }, sessions: [], meta: null, loading: false, error: null }) }));
vi.mock("../../../hooks/useGatewayBuyTimeline", () => ({ buyTimingFreshness: () => null }));
vi.mock("./CashGateCard", () => ({ default: () => null }));
vi.mock("./ToTickerCard", () => ({ default: () => null }));
vi.mock("../timing/TimingSimPanel", () => ({ default: () => null }));
vi.mock("../news/EliteNewsPanel", () => ({ default: () => null }));
vi.mock("../../../hooks/elite10/useProfileFa", () => ({ useProfileFaWarnings: () => ({ data: null }) }));
import EliteHlBoard from "./EliteHlBoard";

const text = (id: string) => (screen.getByTestId(id).textContent ?? "").replace(/\s+/g, " ");
beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

describe("Buồng lái — Bảng quyết định Elite HL (dữ liệu thật 18/11)", () => {
  it("C1 thanh trạng thái: phiên, phiên bản, PZ chỉ hiển thị, THĂM DÒ, nguồn phụ kèm ngày, đếm theo trạng thái chính", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    const s = text("cockpit-status");
    expect(s).toMatch(/PHIÊN 18\/11.*E4-HL v1.*PZ-v2 CHỈ HIỂN THỊ.*THĂM DÒ/);
    expect(text("cockpit-counts")).toMatch(/Danh mục · lõi \d+/);
    expect(screen.getByTestId("cockpit-status").getAttribute("data-hl-layer")).toBe("cockpit");
    for (const bad of [/mua ngay/i, /chắc thắng/i, /tối ưu/i]) expect(s).not.toMatch(bad);
  });
  it("C2 đọc phễu: bước 2 và 3 song song; bước 6 chỉ hiển thị; bước 7 = giữ lại + mua mới; bấm lý do -> đánh dấu mã trên bản đồ", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    const f = text("cockpit-funnel");
    expect(f).toMatch(/Bước 2 \(165\) và bước 3 \(35\) đếm song song/);
    expect(f).toMatch(/Bước 6 Trong vùng mua \(7\) chỉ hiển thị/);
    expect(text("cockpit-branch")).toMatch(/Bước 7 Danh mục 7 = giữ lại 7 \+ mua mới 0/);
    const btn = document.querySelector('[data-testid^="cockpit-reason-q:"]') as HTMLElement;
    fireEvent.click(btn);
    expect(screen.getByTestId("cockpit-map").querySelectorAll("[data-testid^='cockpit-cell-'].ring-1").length).toBeGreaterThan(0);
  });
  it("C3 bản đồ trạng thái: mỗi mã một ô; tổng ô = tổng đếm; bấm ô -> chi tiết + chuỗi chuyển trạng thái + mở Hồ sơ", () => {
    const open = vi.fn();
    render(<EliteHlBoard d={d} onOpenTicker={open} />);
    const cells = screen.getByTestId("cockpit-map").querySelectorAll("[data-testid^='cockpit-cell-']");
    const ids = [...cells].map((c) => c.getAttribute("data-testid"));
    expect(new Set(ids).size).toBe(ids.length);
    const total = [...text("cockpit-counts").matchAll(/ (\d+)/g)].slice(0, 7).map((m) => Number(m[1]));
    expect(cells.length).toBeGreaterThan(0); expect(total.length).toBeGreaterThan(0);
    const held = d.portfolio.find((p) => (p as { hl?: unknown }).hl)!.ticker;
    fireEvent.click(screen.getByTestId(`cockpit-cell-${held}`));
    expect(text("cockpit-detail")).toMatch(new RegExp(`${held}.*Danh mục`));
    fireEvent.click([...screen.getByTestId("cockpit-detail").querySelectorAll("button")].find((b) => /Mở Hồ sơ/.test(b.textContent ?? ""))!);
    expect(open).toHaveBeenCalledWith(held);
  });
  it("C4 breadcrumb dưới mã ở bảng danh mục từ lịch sử thật (VPL vào danh mục 12/11)", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    expect(text("cockpit-crumb-VPL")).toMatch(/Vào danh mục 12\/11/);
  });
  it("C5 ma trận hàng chờ: mặc định đóng; mở -> đủ cột, nhóm chưa giao dịch được tách riêng không đánh số; nhớ lựa chọn", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    expect(screen.queryByTestId(`cockpit-qm-${d.hl!.queue[0].ticker}`)).toBeNull();
    fireEvent.click(screen.getByTestId("cockpit-qm-toggle"));
    const q0 = d.hl!.queue[0];
    const cells0 = [...screen.getByTestId(`cockpit-qm-${q0.ticker}`).querySelectorAll("td")].map((c) => c.textContent);
    expect(cells0.slice(0, 2)).toEqual(["1", q0.ticker]); expect(cells0.length).toBe(9);
    const ill = d.hl!.queueIlliquid![0];
    expect([...screen.getByTestId(`cockpit-qm-${ill.ticker}`).querySelectorAll("td")].map((c) => c.textContent).slice(0, 2)).toEqual(["—", ill.ticker]);
    expect(window.localStorage.getItem("gq.hl.queueMatrix.v1")).toBe("1");
  });
  it("tắt lớp Buồng lái -> không còn khối nào của buồng lái, không gọi nhật ký PZ", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    fireEvent.click(screen.getByTestId("hl-layer-cockpit"));
    for (const id of ["cockpit-status", "cockpit-funnel", "cockpit-map", "cockpit-queue-matrix"]) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.queryByTestId("cockpit-crumb-VPL")).toBeNull();
  });
});
