// D4 (19/11/2026) — khối "Tác động lên cổ phiếu": mỗi dòng có dấu bằng chứng từ Gateway, màu theo bằng chứng, không có tổng hợp.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fetchMarketJson = vi.fn();
vi.mock("../../../services/marketDataClient", () => ({ fetchMarketJson: (...a: unknown[]) => fetchMarketJson(...a) }));
const { default: StockImpactCard } = await import("./StockImpactCard");

const base = (id: string, labelVi: string, evidenceId: string, seal: string, extra: Record<string, unknown> = {}) => ({
  id, labelVi, evidenceId, seal, evidenceVi: `bằng chứng ${evidenceId}`, evidenceSrc: "src", available: true, value: null, direction: null, detailVi: null, source: "Gateway", at: null, ...extra,
});
const AGG = "Tổng hợp có trọng số: không hiển thị cho tới khi ≥ 1 lớp ĐẠT cổng gia tăng INC-r1 và được duyệt riêng (D5).";
const HPG = {
  version: "IMP-v1", ticker: "HPG", asOf: "2026-11-19T08:15:00Z", aggregate: null, aggregateVi: AGG, elite: "Không lớp nào cộng vào Điểm Elite.",
  layers: [
    base("earnings", "Kết quả kinh doanh", "KQ-r1", "THĂM DÒ", { value: { nowcastYoY: 0.18, est: 1.2e13, lo: 1.0e13, hi: 1.4e13, cumShare: 0.74, quarter: "2026Q3" }, direction: 1 }),
    base("commodity", "Hàng hoá dẫn dắt", "CT-r1", "CHƯA KIỂM ĐỊNH", { value: { items: [
      { id: "IRON_ORE", nameVi: "Quặng sắt 62% Fe", proxy: false, available: true, value: 90.72, unit: "USD/tấn", changePct: 0.15, basisVi: "so với phiên trước", speed: "slow" },
      { id: "STEEL_ASIA", nameVi: "Giá thép châu Á", proxy: true, available: true, value: 6.3, unit: "CNY/cổ phiếu", changePct: -0.32, basisVi: "so với phiên trước", speed: "slow" },
    ] } }),
    base("world_short", "Ngành thế giới — phiên tới", "WS-v1", "MỘT PHẦN", { value: { sector: "Kim loại công nghiệp (ICB 1750)", stance: "overweight", alphaBps: 4.2, pOutperform: 0.53 }, direction: 1 }),
    base("world_medium", "Ngành thế giới — 3 tháng", "WS-r2", "KHÔNG ĐẠT", { value: { stance: "adverse", ws3m: -0.8, rrg: "lagging", exposure: { betaPct: 0.62, weightPct: 41.5 } }, direction: -1 }),
    base("catalyst", "Chất xúc tác", "X6-F", "ĐANG TÍCH LUỸ", { value: { benefit: 2, harm: 1, compositeScore: 2.1, top: [{ title: "Giá thép tăng", direction: "benefit" }], stale: false }, direction: 1,
      progress: { n: 0, need: 30, signals: 191, clusters: 175, estimatedReadyOn: "2026-11-30" } }),
    base("events", "Sự kiện (Event Radar)", "ER-r1", "ĐANG TÍCH LUỸ", { value: { count: 1, positive: 1, negative: 0, days: 30, latest: [{ eventLabel: "Hợp đồng", official: true, corroboration: 3, publishedAt: "2026-11-18T03:00:00Z", title: "HPG ký hợp đồng" }] },
      progress: { earliestVerdict: "2027-05-20" } }),
    base("dilution", "Pha loãng ≥ 10%", "PX-r1", "KHÔNG ĐẠT", { value: { phase: "PRE_EX", sessionsTo: 4, ex: "2026-11-25", ratio: 20 } }),
  ],
};

const render = async (ticker: string) => {
  const el = document.createElement("div"); document.body.appendChild(el);
  await act(async () => { createRoot(el).render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><StockImpactCard ticker={ticker} /></SWRConfig>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return el;
};

describe("StockImpactCard (D4)", () => {
  afterEach(() => { document.body.innerHTML = ""; fetchMarketJson.mockReset(); });

  it("mã đang giữ (HPG): 7 lớp, mỗi lớp một dấu từ Gateway, tiến độ X6-F, không có tổng hợp", async () => {
    fetchMarketJson.mockResolvedValue(HPG);
    const el = await render("HPG");
    expect(fetchMarketJson).toHaveBeenCalledWith("/api/elite/impact/HPG");
    const rows = el.querySelectorAll('[data-testid^="impact-layer-"]');
    expect(rows.length).toBe(7);
    for (const r of rows) expect(r.querySelector('[data-testid^="impact-seal-"]')?.getAttribute("data-seal")).toBe(r.getAttribute("data-seal"));
    const t = el.textContent ?? "";
    expect(t).toContain("Ước tính LNST cả năm 12.000 tỷ (+18,0% so với năm trước)");
    expect(t).toContain("Quặng sắt 62% Fe: 90,72 USD/tấn · +0,15% so với phiên trước · phản ánh chậm (~1 tháng)");
    expect(t).toContain("Giá thép châu Á (đại diện)");
    expect(t).not.toContain("(đại diện) (đại diện)");
    expect(t).toContain("RRG Tụt hậu");
    expect(el.querySelector('[data-testid="impact-progress-catalyst"]')?.textContent).toBe("0/30 tín hiệu đủ 20 phiên · dự kiến đủ 30/11/2026");
    expect(el.querySelector('[data-testid="impact-progress-events"]')?.textContent).toBe("chấm sớm nhất 20/05/2027");
    expect(t).toContain("còn 4 phiên tới GDKHQ 25/11/2026 (tỷ lệ 20%)");
    expect(el.querySelector('[data-testid="elite-impact-aggregate"]')?.textContent).toBe(AGG);
    expect(t).not.toMatch(/Mua ngay|chắc chắn/);
  });

  it("màu theo bằng chứng: lớp không ĐẠT không tô màu hướng; lớp yếu được đánh dấu mờ", async () => {
    fetchMarketJson.mockResolvedValue(HPG);
    const el = await render("HPG");
    expect(el.querySelector('[data-testid="impact-dir-earnings"]')?.className).toContain("text-slate-400");
    expect(el.querySelector('[data-testid="impact-dir-world_medium"]')?.className).toContain("text-slate-400");
    expect(el.querySelector('[data-testid="impact-layer-world_medium"]')?.getAttribute("data-weak")).toBe("true");
    expect(el.querySelector('[data-testid="impact-layer-earnings"]')?.getAttribute("data-weak")).toBe("false");
    // Lớp ĐẠT (giả định tương lai) mới được tô màu hướng.
    fetchMarketJson.mockResolvedValue({ ...HPG, layers: [{ ...HPG.layers[0], seal: "ĐẠT" }] });
    document.body.innerHTML = "";
    expect((await render("HPG")).querySelector('[data-testid="impact-dir-earnings"]')?.className).toContain("text-emerald-300");
  });

  it("mã thiếu nguồn: dòng vẫn có dấu, hiện lý do, không hiện hướng", async () => {
    const layers = HPG.layers.map((l) => ({ ...l, available: false, value: null, direction: null, reasonVi: `thiếu ${l.id}` }));
    fetchMarketJson.mockResolvedValue({ ...HPG, ticker: "ABC", layers });
    const el = await render("ABC");
    expect(el.querySelectorAll('[data-testid^="impact-seal-"]').length).toBe(7);
    expect(el.querySelectorAll('[data-testid^="impact-dir-"]').length).toBe(0);
    expect(el.textContent).toContain("thiếu world_short");
    expect(el.querySelector('[data-testid="impact-progress-catalyst"]')).not.toBeNull();
  });

  it("mã ngoài danh mục, sau GDKHQ; Gateway cũ (404) -> báo lỗi ngắn, không vỡ hồ sơ", async () => {
    const dil = { ...HPG.layers[6], value: { phase: "POST_EX", day: 3, ex: "2026-11-14", listed: false, listing: "2026-12-05" } };
    fetchMarketJson.mockResolvedValue({ ...HPG, ticker: "VND", layers: [dil] });
    expect((await render("VND")).textContent).toContain("Sau GDKHQ 14/11/2026, phiên thứ 3 · cổ phiếu mới dự kiến niêm yết 05/12/2026");
    document.body.innerHTML = "";
    fetchMarketJson.mockRejectedValue(new Error("Market API lỗi 404"));
    const el = await render("VND");
    expect(el.querySelector('[data-testid="elite-impact-error"]')?.textContent).toContain("404");
    expect(el.querySelector('[data-testid="elite-impact"]')).toBeNull();
  });
});
