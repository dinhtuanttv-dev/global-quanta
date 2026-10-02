import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import real from "../../../../lib/cotuc/__fixtures__/fpt-seasonality.prod.json";
import { EarningsSeasonalityTab } from "./EarningsSeasonalityTab";
import { SeasonalOpportunityList } from "./SeasonalOpportunityList";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Phản hồi THẬT của Project A production (FPT, 03/10/2026) — giao diện phải hiển thị đúng dữ liệu thật.
function mockApi() {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const u = new URL(String(url));
    const q = u.searchParams.get("quarter");
    const tk = u.searchParams.get("ticker");
    if (tk && tk !== "FPT") return new Response("{}", { status: 404 });
    const body = u.pathname.endsWith("/earnings-cycle-stats") ? (real.stats as Record<string, unknown>)[q!]
      : u.pathname.endsWith("/earnings-cycle-paths") ? (real.paths as Record<string, unknown>)[q!]
      : u.pathname.endsWith("/annual-earnings-calendar") ? real.calendar
      : u.pathname.endsWith("/earnings-signals") ? real.signals : null;
    return body ? new Response(JSON.stringify(body), { status: 200 }) : new Response("{}", { status: 404 });
  }));
}

async function mount(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  await act(async () => { createRoot(el).render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{node}</SWRConfig>); });
  for (let i = 0; i < 5; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  return el;
}

describe("Mùa vụ KQKD (dữ liệu thật FPT)", () => {
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });

  it("kỳ tới + SUE, 4 ô quý, timeline 12 tháng, bảng 4 cửa sổ của quý sắp công bố; chọn quý khác; lưới 4 quý", async () => {
    mockApi();
    const el = await mount(<EarningsSeasonalityTab ticker="FPT" today="2026-10-03" />);
    const t = el.textContent ?? "";
    expect(t).toContain("📊 Mùa vụ KQKD");
    expect(t).toContain("Kỳ tới Q3/2026");
    expect(t).toContain("dự kiến 24/10");
    expect(t).toMatch(/SUE kỳ trước \+4[.,]31/);
    expect(el.querySelectorAll('[aria-pressed]').length).toBeGreaterThanOrEqual(4);
    expect(el.querySelector('[aria-label^="Chu kỳ mùa vụ KQKD cả năm"]')).not.toBeNull();
    expect(t).toContain("CỬA SỔ GIAO DỊCH QUANH CÔNG BỐ · Q3");
    for (const w of ["E1 · Chạy trước công bố", "E2 · Nắm qua công bố", "E3 · Ngắn sau công bố", "E4 · Trôi giá sau công bố (PEAD)"]) expect(t).toContain(w);
    expect(t).toMatch(/CHƯA ĐỦ MẪU|THEO DÕI|KHÔNG CÓ LỢI THẾ/); // dữ liệu thật: chưa cửa sổ nào đạt
    const q1 = [...el.querySelectorAll('[role="tab"]')].find((b) => b.textContent === "Q1") as HTMLButtonElement;
    await act(async () => { q1.click(); });
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(el.textContent).toContain("CỬA SỔ GIAO DỊCH QUANH CÔNG BỐ · Q1");
    const grid = [...el.querySelectorAll("button")].find((b) => /Lưới 4 quý/.test(b.textContent ?? "")) as HTMLButtonElement;
    await act(async () => { grid.click(); });
    for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(el.querySelectorAll('[data-testid^="quarter-card-"]')).toHaveLength(4);
    expect(el.textContent).toContain("không phải khuyến nghị đầu tư");
  });

  it("mã ngoài danh mục (404) -> thông báo rõ, không vỡ giao diện", async () => {
    mockApi();
    const el = await mount(<EarningsSeasonalityTab ticker="ZZZ" today="2026-10-03" />);
    expect(el.querySelector('[data-testid="seasonality-empty"]')).not.toBeNull();
  });

  it("danh sách cơ hội: đã đạt xếp theo cận dưới; ứng viên theo dõi kèm điều kiện còn thiếu; bấm mã -> chọn mã", async () => {
    const pick = vi.fn();
    const el = await mount(<SeasonalOpportunityList onSelectTicker={pick}
      items={[{ ticker: "AAA", quarter: 2, reactionProbabilityLowerBound: 0.61, reactionProbabilityMean: 0.8, expectedNetReturn: 0.012, nEvents: 9, window: { entryFrom: -5, entryTo: -2, exitOffset: 3 } }]}
      watchlist={[{ ticker: "PVT", quarter: 3, windowId: "e3", label: "E3 · Ngắn sau công bố", nEvents: 7, netExpectancy: 0.02, netExpectancyLcb: 0.018, winRate: 0.86, fdrQValue: 0.03, missing: ["cần ≥ 8 kỳ (đang 7)"] }]} />);
    expect(el.textContent).toContain("ĐÃ ĐẠT KIỂM ĐỊNH");
    expect(el.textContent).toContain("61%");
    expect(el.textContent).toContain("cần ≥ 8 kỳ (đang 7)");
    await act(async () => { ([...el.querySelectorAll("button")].find((b) => b.textContent === "PVT") as HTMLButtonElement).click(); });
    expect(pick).toHaveBeenCalledWith("PVT");
  });
});
