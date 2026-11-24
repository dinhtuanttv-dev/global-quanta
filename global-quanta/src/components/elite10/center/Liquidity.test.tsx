// LQ1 — huy hiệu thanh khoản, dòng năng lực danh mục, khối Hồ sơ "Thanh khoản & năng lực giao dịch" (ô vốn của người xem).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, render, screen } from "../../../test/rtl-lite";
import type { LiqStats } from "../../../lib/elite10/decisionTypes";
import { LQ_DEFAULT } from "../../../lib/elite10/liquidity";

const vcp: LiqStats = { version: "LQ-v1", tier: "L4", reasons: ["MED_ABS", "ILLIQ_MAX"], n20: 20, n60: 60, med20: 3.6, mean20: 5.5, p10: 0.3, min20: 0.02, max20: 18.7, density: 9, maxShare: 0.17, illiq: 3.17, stressDays: 1, capacityBn: 0.08, capitalMaxBn: 0.53, binding: "impact", impactPct: 1.6, dtl: 8.3 };
const vic: LiqStats = { ...vcp, tier: "L1", reasons: [], med20: 446.5, mean20: 490, p10: 366, min20: 310, max20: 1196, density: 20, maxShare: 0.12, illiq: 0.004, stressDays: 0, capacityBn: 44.6, capitalMaxBn: 297, binding: "in" };
const day = (i: number) => new Date(Date.UTC(2026, 8, 1) + i * 864e5).toISOString().slice(0, 10);
const series = Array.from({ length: 60 }, (_, i) => ({ d: day(i), v: i === 59 ? 18.7 : i % 6 === 0 ? 0.3 : 3.6, r: i === 40 ? -0.066 : 0.004 }));
let liqData: unknown = { date: "2026-11-17", ticker: "VCP", inPanel: true, sigma20: 0.042, liq: vcp, series, rules: LQ_DEFAULT };
vi.mock("../../../hooks/elite10/useEliteLiquidity", () => ({ useEliteLiquidity: () => ({ data: liqData, error: null, isLoading: false }) }));
vi.mock("../../../hooks/elite10/useAdjustedDaily", () => ({ useAdjustedDaily: () => ({ bars: [], priceBasis: null, isLoading: false, error: null }) }));
vi.mock("../../../services/marketDataClient", () => ({ fetchMarketJson: async () => ({ tickers: [] }) }));
import LiquidityBadge, { PortfolioLiquidityLine } from "./LiquidityBadge";
import LiquidityProfileBlock from "../profile/LiquidityProfileBlock";

afterEach(() => { cleanup(); try { localStorage.clear(); } catch { /* */ } });
const text = (id: string) => screen.getByTestId(id).textContent ?? "";

describe("LiquidityBadge", () => {
  it("bậc + trung vị + nhãn; mã đang giữ có cờ; chú thích đầy đủ; tài liệu cũ giữ chữ GTGD trung bình", () => {
    render(<LiquidityBadge liq={vcp} rules={LQ_DEFAULT} sigma20={0.042} weight={0.08} held testId="b" />);
    const el = screen.getByTestId("b");
    expect(el.getAttribute("data-tier")).toBe("L4"); expect(el.textContent).toMatch(/L4GTGD 3,6 tỷchỉ nghiên cứu⚠/);
    expect(el.getAttribute("title")).toMatch(/Đang giữ: 1 phiên giảm sâu mà cạn cầu/); expect(screen.getByTestId("b-flag")).toBeTruthy();
    cleanup(); render(<LiquidityBadge liq={null} rules={LQ_DEFAULT} fallbackAdvBn={8.28} testId="b" />);
    expect(text("b")).toBe("GTGD 8,28 tỷ");
  });
  it("dòng năng lực: đếm bậc và vốn tối đa, nêu mã giới hạn", () => {
    render(<PortfolioLiquidityLine rows={[{ ticker: "VIC", weight: 0.1, liq: vic, sigma20: 0.02 }, { ticker: "VCP", weight: 0.08, liq: vcp, sigma20: 0.042 }]} rules={LQ_DEFAULT} />);
    const t = text("hl-capacity");
    expect(t).toMatch(/L1 rất sâu · 1/); expect(t).toMatch(/L4 chỉ nghiên cứu · 1/); expect(t).toMatch(/Danh mục chịu được vốn tới 996 tr.*giới hạn bởi VCP: chi phí tác động/);
  });
});

describe("Hồ sơ · Thanh khoản & năng lực giao dịch", () => {
  it("bậc của hệ thống, biểu đồ 60 phiên, số đo, lý do có số, ô vốn tính lại và lưu riêng trình duyệt", async () => {
    await act(async () => { render(<LiquidityProfileBlock ticker="VCP" />); });
    expect(screen.getByTestId("pa-confirmation")).toBeTruthy();
    expect(text("pa-status")).toMatch(/Chưa đủ dữ liệu tin cậy/);
    expect(text("lq-tier")).toMatch(/L4 · Chỉ nghiên cứu/);
    expect(screen.getByTestId("lq-chart").querySelectorAll("rect").length).toBe(61);
    expect(text("lq-med")).toMatch(/3,6 tỷ.*Trung bình 5,5 tỷ — cao hơn trung vị 53% do đột biến/);
    expect(text("lq-illiq")).toMatch(/3,170%\/tỷ/); expect(text("lq-stress")).toMatch(/^Phiên giảm sâu mà cạn cầu1/);
    expect(text("lq-reasons")).toMatch(/Trung vị GTGD 20 phiên 3,6 tỷ < sàn 5,0 tỷ/);
    expect(text("lq-mine")).toMatch(/Bậc theo vốn này/);
    const input = screen.getByTestId("lq-capital") as HTMLInputElement;
    expect(input.value).toBe("5");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, "1"); input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(text("lq-whatif")).toMatch(/vị thế lớn nhất 15% = 150 tr/);
    expect(localStorage.getItem("gq:lq:capitalBn")).toBe("1");
    expect(text("lq-profile")).not.toMatch(/Mua ngay/);
  });
  it("không có chuỗi -> câu rõ ràng", () => {
    liqData = { date: "2026-11-17", ticker: "ZZZ", missing: true, rules: LQ_DEFAULT };
    render(<LiquidityProfileBlock ticker="ZZZ" />); expect(text("lq-missing")).toMatch(/Chưa có chuỗi GTGD của ZZZ/);
  });
});
