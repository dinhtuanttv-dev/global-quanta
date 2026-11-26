import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../../test/rtl-lite";
import PortfolioRail from "./PortfolioRail";
import type { EliteDecision } from "../../../../lib/elite10/decisionTypes";

const pick = (ticker: string, rank: number, weight: number, extra: Record<string, unknown> = {}) => ({
  ticker, weight, Z: 0, rank, alpha5Pct: null, pOutperform: 0.5, sectorKey: "1750", close: 10000, stop: 9000, target: 12000, holdSessions: null,
  hl: { rank, cls: "STRONG", t1: 9, t2: 1, t3: 2, lsPct: 90, lsPts: 5, taCount: 3, taPts: 3, rrg: 1, status: "HOLD", since: "2026-11-12", advBn: 20, sigma20: 0.02,
    exitBufferLs: 20, warnings: [], sinceRet: 0.031, pz: { state: "BUY_ZONE", lane: "CORE" }, ...extra },
});
const decision = (over: Record<string, unknown> = {}) => ({
  date: "2026-11-26",
  portfolio: [pick("VPL", 3, 0.15), pick("NAF", 1, 0.1, { sinceRet: -0.024, warnings: ["LS-v1 phân vị 65"], pz: { state: "EXTENDED", lane: "RUNNER" } }), pick("HPG", 2, 0.099)],
  hl: { invested: 0.724, cash: 0.276, dataGuard: { frozen: false, reasonsVi: [] },
    queue: [{ ticker: "VPI", hlRank: 11, reasonVi: "Chờ phiên cân bằng kế tiếp (thứ Hai hoặc thứ Năm)" }, { ticker: "TCH", hlRank: 12, reasonVi: "Ngành đã đủ 3 mã" }] },
  ...over,
}) as unknown as EliteDecision;
afterEach(() => cleanup());

describe("Danh mục Elite HL trong khối trái Phòng họp AI", () => {
  it("xếp theo hạng HL; hiện tỷ trọng, lãi/lỗ từ phiên khoá, làn và vị trí giá; mã đang xem được đánh dấu", () => {
    render(<PortfolioRail decision={decision()} current="HPG" onPick={() => {}} />);
    const rows = screen.getAllByTestId("eb-portfolio-rail")[0].querySelectorAll(".eb-pf-list > li > button");
    expect([...rows].map((r) => r.getAttribute("data-testid"))).toEqual(["eb-pf-NAF", "eb-pf-HPG", "eb-pf-VPL"]);
    const naf = screen.getByTestId("eb-pf-NAF").textContent ?? "";
    expect(naf).toContain("Chạy lãi · Tăng nóng"); expect(naf).toContain("10%"); expect(naf).toContain("−2,4%");
    expect(screen.getByTestId("eb-pf-NAF").getAttribute("title")).toBe("LS-v1 phân vị 65");
    expect(screen.getByTestId("eb-pf-HPG").getAttribute("aria-current")).toBe("true");
    expect(screen.getByTestId("eb-portfolio-meta").textContent).toBe("Phiên 26/11 · Cổ phiếu 72,4% · Tiền mặt 27,6% · Chọn mã để phân tích");
  });
  it("bấm mã -> phân tích mã đó; đang tranh luận -> khoá chọn mã", () => {
    const onPick = vi.fn();
    render(<PortfolioRail decision={decision()} current="HPG" onPick={onPick} />);
    fireEvent.click(screen.getByTestId("eb-pf-VPL"));
    expect(onPick).toHaveBeenCalledWith("VPL");
    cleanup();
    const blocked = vi.fn();
    render(<PortfolioRail decision={decision()} current="HPG" onPick={blocked} busy />);
    fireEvent.click(screen.getByTestId("eb-pf-VPL"));
    expect(blocked).not.toHaveBeenCalled();
    expect(screen.getByTestId("eb-pf-VPL").getAttribute("aria-disabled")).toBe("true");
  });
  it("hàng chờ thu gọn mặc định; mở ra thấy lý do và bấm để phân tích", () => {
    const onPick = vi.fn();
    render(<PortfolioRail decision={decision()} current={null} onPick={onPick} />);
    expect(screen.queryByTestId("eb-pf-q-VPI")).toBeNull();
    fireEvent.click(screen.getByTestId("eb-pf-queue-toggle"));
    expect(screen.getByTestId("eb-pf-q-TCH").textContent).toContain("Ngành đã đủ 3 mã");
    fireEvent.click(screen.getByTestId("eb-pf-q-VPI"));
    expect(onPick).toHaveBeenCalledWith("VPI");
  });
  it("chốt dữ liệu -> nhãn ĐÓNG BĂNG; chưa có danh mục -> thông báo, không lỗi", () => {
    render(<PortfolioRail decision={decision({ hl: { invested: 0.7, cash: 0.3, dataGuard: { frozen: true, reasonsVi: ["Thiếu nguồn Siêu quét"] }, queue: [] } })} current={null} onPick={() => {}} />);
    expect(screen.getByTestId("eb-portfolio-rail").textContent).toContain("ĐÓNG BĂNG");
    cleanup();
    render(<PortfolioRail decision={null} current={null} onPick={() => {}} loading />);
    expect(screen.getByTestId("eb-portfolio-rail").textContent).toContain("Đang tải danh mục…");
  });
});
