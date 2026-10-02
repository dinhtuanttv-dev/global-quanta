import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScannerToolbar, { type GroupBy } from "./ScannerToolbar";
import WatchlistBar from "./WatchlistBar";
import { basketSummary, groupStats } from "./scannerTaxonomy";
import { parseTickerInput, resetWatchlistsForTest, useWatchlists } from "../../../hooks/useWatchlists";
import { useScannerBasket, type Basket } from "../../../hooks/useScannerBasket";
import type { SieuQuetStockItem } from "../../../hooks/useSieuQuetScanner";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item = (ticker: string, industry: string, sectorGroup: string, smartScore: number, extra: Partial<SieuQuetStockItem> = {}): SieuQuetStockItem => ({
  ticker, companyName: null, sector: industry, price: 10_000, changePct: 0, faScore: 50, taScore: 50, eventImpactScore: 0, smartScore,
  rsRating: 50, riskAdjustedMomentum: 0, riskRewardRatio: 1, trendTag: "Up-Trend", qualityTag: null, confluenceStatusCode: null,
  confluenceStatusLabel: null, confluenceBoost: 0, confluenceReasonCodes: [], breakoutBoostBadge: false, piotroskiFScore: 6, fScoreMax: 9,
  foreignNetBuyFlag: false, computedAt: "2026-10-01", industry, sectorGroup, ...extra,
});
const ITEMS = [
  item("VCB", "Ngân hàng", "Tài chính", 70), item("TCB", "Ngân hàng", "Tài chính", 60), item("SSI", "Chứng khoán", "Tài chính", 55),
  item("HPG", "Thép & Kim loại", "Xây dựng & Vật liệu", 65, { trendTag: "Down-Trend" }), item("FPT", "Công nghệ thông tin", "Công nghệ & Viễn thông", 80),
];

async function render(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{node}</SWRConfig>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { el, root };
}

describe("Bảng Siêu Quét — rổ, lọc ngành, danh mục tự chọn", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.localStorage.clear(); resetWatchlistsForTest(); document.body.innerHTML = ""; });

  it("thống kê ngành 2 cấp và tóm tắt rổ", () => {
    const g = groupStats(ITEMS);
    expect(g.map((x) => x.name)).toEqual(["Tài chính", "Xây dựng & Vật liệu", "Công nghệ & Viễn thông"]);
    expect(g[0].industries.map((i) => [i.name, i.count])).toEqual([["Ngân hàng", 2], ["Chứng khoán", 1]]);
    expect(g[0].avgScore).toBeCloseTo(61.67, 1);
    const s = basketSummary(ITEMS);
    expect(s.n).toBe(5);
    expect(s.top).toEqual(["FPT", "VCB", "HPG"]);
    expect(s.upTrend).toBe(4);
    expect(s.groups[0]).toEqual({ name: "Tài chính", share: 0.6 });
  });

  it("nhập mã cho danh mục: chữ hoa, bỏ trùng, báo mã sai định dạng", () => {
    expect(parseTickerInput("fpt, hpg ; vnm fpt 12 A")).toEqual({ valid: ["FPT", "HPG", "VNM"], invalid: ["12", "A"] });
  });

  it("bộ lọc ngành: chọn cả nhóm (tri-state), từng ngành; gom nhóm; chọn rổ", async () => {
    let lastSet = new Set<string>();
    let lastBasket: Basket = "ALL";
    function Harness() {
      const [sel, setSel] = useState<Set<string>>(new Set());
      const [g, setG] = useState<GroupBy>("none");
      return (
        <ScannerToolbar basket="ALL" onBasket={(b) => { lastBasket = b; }} watchlistCount={3} gatewayReady items={ITEMS}
          industries={sel} onIndustries={(s) => { lastSet = s; setSel(s); }} groupBy={g} onGroupBy={setG} />
      );
    }
    const { el } = await render(<Harness />);
    expect(el.textContent).toContain("★ Danh mục (3)");
    const btn = [...el.querySelectorAll("button")].find((b) => b.textContent?.includes("Tất cả ngành"))!;
    await act(async () => { btn.click(); });
    const dialog = el.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain("Tài chính3 · 61.7");
    expect(dialog.textContent).toContain("Ngân hàng2 · 65.0");
    const groupBox = [...dialog.querySelectorAll("label")].find((l) => l.textContent?.startsWith("Tài chính"))!.querySelector("input")!;
    await act(async () => { groupBox.click(); });
    expect([...lastSet].sort()).toEqual(["Chứng khoán", "Ngân hàng"]);
    const bankBox = [...dialog.querySelectorAll("label")].find((l) => l.textContent?.startsWith("Ngân hàng"))!.querySelector("input")!;
    await act(async () => { bankBox.click(); });
    expect([...lastSet]).toEqual(["Chứng khoán"]);
    expect((groupBox as HTMLInputElement).indeterminate).toBe(true);
    expect(el.textContent).toContain("Chứng khoán ▾");
    const vn30 = [...el.querySelectorAll('[role="tab"]')].find((b) => b.textContent === "VN30") as HTMLButtonElement;
    await act(async () => { vn30.click(); });
    expect(lastBasket).toBe("VN30");
  });

  it("rổ VN30: lấy thành phần từ Gateway; mã chưa có trong bảng được chấm qua /scanner/custom, sắp như bảng", async () => {
    vi.stubEnv("VITE_MARKET_GATEWAY_ENABLED", "true");
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (String(url).includes("/components")
        ? { symbols: ["VCB", "FPT", "MWG"] }
        : { dataAsOf: "2026-10-01", items: [item("MWG", "Bán lẻ", "Tiêu dùng", 75, { inUniverse: false })], notFound: [], insufficient: [], fundamentalsFetched: 0 }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    let seen: string[] = [];
    function Harness() {
      const b = useScannerBasket(ITEMS, "VN30", []);
      seen = b.items.map((i) => i.ticker);
      return null;
    }
    await render(<Harness />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(seen).toEqual(["FPT", "MWG", "VCB"]);
    const customCall = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.includes("/scanner/custom"))!;
    expect(customCall).toContain("tickers=MWG");
  });

  it("thanh danh mục: thêm nhiều mã một lần, báo mã sai, bỏ mã, tạo danh mục mới", async () => {
    let active: string[] = [];
    function Spy() { const w = useWatchlists(); active = w.active.tickers; return <span data-name={w.active.name} />; }
    const { el } = await render(<><WatchlistBar notFound={["ZZZ"]} insufficient={[]} loading={false} gatewayReady /><Spy /></>);
    expect(el.textContent).toContain("Danh mục trống");
    const input = el.querySelector('input[aria-label="Thêm mã vào danh mục"]') as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setValue.call(input, "fpt, hpg zzz 1"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { (el.querySelector("form") as HTMLFormElement).requestSubmit(); });
    expect(active).toEqual(["FPT", "HPG", "ZZZ"]);
    expect(el.textContent).toContain("Đã thêm 3 mã.");
    expect(el.textContent).toContain("Sai định dạng: 1.");
    expect(el.textContent).toContain("ZZZ ⚠");
    await act(async () => { (el.querySelector('button[aria-label="Bỏ HPG khỏi danh mục"]') as HTMLButtonElement).click(); });
    expect(active).toEqual(["FPT", "ZZZ"]);
    expect(JSON.parse(window.localStorage.getItem("gq.watchlists.v1")!).lists[0].tickers).toEqual(["FPT", "ZZZ"]);
    await act(async () => { ([...el.querySelectorAll("button")].find((b) => b.textContent === "＋ Mới") as HTMLButtonElement).click(); });
    expect(active).toEqual([]);
    expect(el.querySelector("[data-name]")!.getAttribute("data-name")).toBe("Danh mục 2");
  });
});
