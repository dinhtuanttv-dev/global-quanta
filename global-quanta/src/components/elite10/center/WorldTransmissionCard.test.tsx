import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMarketJson = vi.fn();
vi.mock("../../../services/marketDataClient", () => ({ fetchMarketJson: (...a: unknown[]) => fetchMarketJson(...a) }));
vi.mock("../../../hooks/useWorldStrategy", () => ({ useWorldStrategy: () => ({ data: { regime: { stressed: false, vix: 17.2, vixChg: -3.1, dxy: 102.4, dxyChg: 0.2, us10y: 4.1, date: "2026-11-10", noteVi: "" } } }) }));
vi.mock("../../../hooks/useCommoditySnapshot", () => ({ useCommoditySnapshot: () => ({ data: { items: [
  { id: "BRENT", nameVi: "Dầu Brent", value: 71.3, change: { pct: 1.2, basisVi: "phiên" } }, { id: "HRC", nameVi: "Thép HRC", value: 900, change: { pct: -0.8, basisVi: "phiên" } },
] } }) }));
const { default: WorldTransmissionCard } = await import("./WorldTransmissionCard");

const render = async (ticker: string) => {
  const el = document.createElement("div"); document.body.appendChild(el);
  await act(async () => { createRoot(el).render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><WorldTransmissionCard ticker={ticker} /></SWRConfig>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return el;
};

describe("WorldTransmissionCard (WS-r2 T1)", () => {
  afterEach(() => { document.body.innerHTML = ""; fetchMarketJson.mockReset(); });
  it("ngành phiên kế tiếp + bối cảnh trung hạn + phơi nhiễm + hàng hoá có dấu + vĩ mô; ghi rõ mô tả, không cộng điểm", async () => {
    fetchMarketJson.mockResolvedValue({ ok: true, data: {
      ticker: "HPG", icb: { l1: "1000", l2: "1700", l3: "1750" }, sector: { icb: "1750", nameVi: "Kim loại công nghiệp" },
      sectorShort: { stance: "overweight", alphaBps: 4.2, pOutperform: 0.53, z: 1.1 }, sectorMedium: { stance: "adverse", ws3m: -0.8, rrg: "lagging" },
      stockExposure: { weightPct: 41.5, betaPct: 0.62, corr: 0.31, d1Pct: 1.2, m1Pct: -3.4, m3Pct: 5.6 },
      drivers: [{ id: "HRC", nameVi: "Thép HRC", sign: 1 }, { id: "IRON", nameVi: "Quặng sắt", sign: -1 }], note: null,
    } });
    const el = await render("HPG");
    expect(fetchMarketJson).toHaveBeenCalledWith("/api/world-sectors/tools/ws_stock", {}, expect.objectContaining({ method: "POST", body: JSON.stringify({ ticker: "HPG" }) }));
    const t = el.textContent ?? "";
    expect(t).toContain("Kim loại công nghiệp (ICB 1750)");
    expect(t).toContain("α +4,2 đcb"); expect(t).toContain("P vượt VN-Index 53,0%");
    expect(t).toContain("β với ngành thế giới 0,62"); expect(t).toContain("3 tháng +5,6%");
    expect(t).toContain("Thép HRC -0,8% phiên"); expect(t).toContain("Quặng sắt (chi phí đầu vào)");
    expect(t).toContain("VIX 17,2"); expect(t).toContain("Brent 71,3 USD");
    expect(t).toContain("không cộng vào Điểm Elite");
    expect(el.querySelector('[data-testid="elite-world-evidence"]')?.textContent).toMatch(/WS-r2.*KHÔNG ĐẠT/);
  });
  it("mã ngoài 22 ngành: báo rõ; lỗi công cụ: không hiện khối", async () => {
    fetchMarketJson.mockResolvedValueOnce({ ok: true, data: { ticker: "XYZ", icb: null, sector: null, sectorShort: null, sectorMedium: null, stockExposure: null, drivers: [], note: "Ngành ICB của mã không có ánh xạ." } });
    expect((await render("XYZ")).textContent).toContain("Ngành ICB của mã không có ánh xạ.");
    document.body.innerHTML = "";
    fetchMarketJson.mockResolvedValueOnce({ ok: false, error: "x" });
    expect((await render("ABC")).querySelector('[data-testid="elite-world"]')).toBeNull();
  });
});
