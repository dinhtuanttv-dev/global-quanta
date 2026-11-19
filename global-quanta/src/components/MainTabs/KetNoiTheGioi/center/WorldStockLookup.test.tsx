// W3 (19/11/2026): tra cứu cổ phiếu trong Truyền dẫn & kịch bản — khối Tác động (D4) + cảnh báo thanh khoản LQ-v1, không bịa phơi nhiễm.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMarketJson = vi.fn();
vi.mock("../../../../services/marketDataClient", () => ({ fetchMarketJson: (...a: unknown[]) => fetchMarketJson(...a) }));
vi.mock("../../../elite10/center/StockImpactCard", () => ({ default: ({ ticker }: { ticker: string }) => <div data-testid="impact-stub">{ticker}</div> }));
const { default: WorldStockLookup } = await import("./WorldStockLookup");

const RULES = { capitalBn: 10, absMinMedBn: 1, illiqMax: 2, illiqWarn: 1, densityMin: 15, stressRet: -0.05, stressFrac: 0.5 };
const liq = (tier: string, reasons: string[] = []) => ({ date: "2026-11-19", ticker: "X", sigma20: 0.02, rules: RULES,
  liq: { version: "LQ-v1", tier, reasons, n20: 20, n60: 60, med20: tier === "L4" ? 0.4 : 13.9, mean20: 16, p10: 3.3, min20: 6.3, max20: 41, density: 20, maxShare: 0.13, illiq: 0.12, stressDays: 0, capacityBn: 1.2, capitalMaxBn: 7.9, binding: "impact", impactPct: 0.33, dtl: 0.76 } });

const render = async () => {
  const el = document.createElement("div"); document.body.appendChild(el);
  await act(async () => { createRoot(el).render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><WorldStockLookup /></SWRConfig>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return el;
};

describe("WorldStockLookup (W3)", () => {
  afterEach(() => { document.body.innerHTML = ""; fetchMarketJson.mockReset(); });

  it("mặc định HPG: ghi rõ chưa có phơi nhiễm BCTC, hiện khối tác động và thanh khoản chuẩn (không cảnh báo)", async () => {
    fetchMarketJson.mockResolvedValue(liq("L2"));
    const el = await render();
    expect(fetchMarketJson).toHaveBeenCalledWith("/api/elite/liquidity/HPG");
    expect(el.querySelector('[data-testid="world-stock-exposure-note"]')?.textContent).toMatch(/chưa có nguồn BCTC/);
    expect(el.querySelector('[data-testid="impact-stub"]')?.textContent).toBe("HPG");
    const box = el.querySelector('[data-testid="world-stock-liq"]')!;
    expect(box.getAttribute("data-tier")).toBe("L2");
    expect(box.textContent).not.toContain("⚠");
  });

  it("thanh khoản thấp (L4) -> cảnh báo kèm lý do; đổi mã qua ô nhập", async () => {
    fetchMarketJson.mockResolvedValue(liq("L4", ["MED_ABS"]));
    const el = await render();
    expect(el.querySelector('[data-testid="world-stock-liq"]')?.textContent).toMatch(/⚠ Thanh khoản.*Trung vị GTGD 20 phiên/);
    const input = el.querySelector('[data-testid="world-stock-input"]') as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      set.call(input, "tng"); input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { (el.querySelector('[data-testid="world-stock-form"]') as HTMLFormElement).requestSubmit(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(el.querySelector('[data-testid="impact-stub"]')?.textContent).toBe("TNG");
    expect(fetchMarketJson).toHaveBeenCalledWith("/api/elite/liquidity/TNG");
  });

  it("không có số đo thanh khoản (404) -> cảnh báo thiếu số liệu, không vỡ", async () => {
    fetchMarketJson.mockRejectedValue(new Error("Market API lỗi 404"));
    const el = await render();
    expect(el.querySelector('[data-testid="world-stock-liq-missing"]')?.textContent).toMatch(/chưa có số đo thanh khoản/);
    expect(el.querySelector('[data-testid="impact-stub"]')).not.toBeNull();
  });
});
