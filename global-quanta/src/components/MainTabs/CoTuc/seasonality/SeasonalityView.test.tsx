import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import real from "../../../../lib/cotuc/__fixtures__/fpt-seasonality.prod.json";
import { clearPrimed, primeSeasonality, takePrimed } from "../../../../lib/cotuc/seasonality-bundle";
import { buildEarningsCycleStatsUrl } from "../../../../lib/cotuc/seasonality.api";
import type { SeasonalityBundle } from "../../../../lib/kqkd/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const BASE = "https://tuan-quant-scanner-psi.vercel.app";
const items: SeasonalityBundle["items"] = { calendar: { status: 200, body: real.calendar } };
for (const q of ["1", "2", "3", "4"]) { items[`stats:${q}`] = { status: 200, body: (real.stats as Record<string, unknown>)[q] }; items[`paths:${q}`] = { status: 200, body: (real.paths as Record<string, unknown>)[q] }; }
const bundle: SeasonalityBundle = {
  version: "SB-v1", ticker: "FPT", fetchedAt: "2026-11-06T12:00:00Z", cached: false, stale: false, source: BASE, items,
  audit: { 3: { rows: [{ used: "2025-10-24", fiscal: "2025-09-30", precise: "2025-10-21", source: "DISCLOSURE", days: 3, sessions: 3 }, { used: "2024-10-24", fiscal: "2024-09-30", precise: "2024-10-24", source: "DATA", days: 0, sessions: 0 }], checked: 1, offBy2: 1, maxOff: 3 } },
  context: { next: { quarter: "Q4/2026", fiscal: "2026-12-31", deadlineConsolidated: "2027-02-14", status: "UPCOMING", date: null, expected: "2027-01-26", band: ["2027-01-19", "2027-01-26"], pNext: null, medianLag: 26, ownN: 6, lateShare: 0 },
    last: { quarter: "Q3/2026", date: "2026-10-21", source: "DISCLOSURE", result: { npatYoY: { value: 0.12, status: "NORMAL" }, ytd: null, sueCore: -2.1, sueNpat: 8.2, flags: [] }, reaction: { kind: "EVENT", carAnn: -0.035, scarAnn: -1.2, avAnn: 0.1, carPre: -0.016, avPre: -0.7, sessionsAfter: 12, source: "DISCLOSURE" } },
    nowcast: { growth: 0.141, est: 10695e9, lo: 10425e9, hi: 11919e9 }, nowcastLabel: "THĂM DÒ", plan: null, live: { asOf: "2026-11-06", car10: -0.09, scar10: -2.4, av10: 2.7 } },
};
vi.mock("../../../../hooks/useKqkd", () => ({
  useSeasonalityBundle: (t: string | null) => ({ data: t === "FPT" ? bundle : null, error: null, isLoading: t !== "FPT" }),
  useKqkdCalendar: () => ({ data: null, error: null, isLoading: false }),
}));
import SeasonalityView, { pickDefaultTicker, SEASON_TICKER_KEY } from "./SeasonalityView";

async function mount(node: React.ReactNode) {
  const el = document.createElement("div"); document.body.appendChild(el);
  await act(async () => { createRoot(el).render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{node}</SWRConfig>); });
  for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  return el;
}

describe("S1/S3/S5/S7 Mùa vụ KQKD", () => {
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; clearPrimed(); try { localStorage.removeItem(SEASON_TICKER_KEY); } catch { /* */ } });

  it("S1 mã mở sẵn: xem gần nhất -> ghim -> sắp công bố -> FPT", () => {
    const list = ["AAA", "FPT", "HPG"];
    expect(pickDefaultTicker(list, { last: "HPG", pinned: ["AAA"], upcoming: [] })).toBe("HPG");
    expect(pickDefaultTicker(list, { last: null, pinned: ["ZZZ", "AAA"], upcoming: ["HPG"] })).toBe("AAA");
    expect(pickDefaultTicker(list, { last: null, pinned: [], upcoming: ["HPG"] })).toBe("HPG");
    expect(pickDefaultTicker(list, { last: null, pinned: [], upcoming: [] })).toBe("FPT");
  });

  it("S7 kiểm schema bằng hàm cũ khi nạp gói; mục sai schema không nạp (hook sẽ gọi mạng như cũ)", async () => {
    const n = await primeSeasonality("FPT", { ...items, "stats:2": { status: 200, body: { sai: true } } }, BASE);
    expect(n).toBe(8);
    expect(takePrimed(buildEarningsCycleStatsUrl("FPT", 1, BASE))).toBeTruthy();
    expect(takePrimed(buildEarningsCycleStatsUrl("FPT", 2, BASE))).toBeUndefined();
  });

  it("S7 + S5 + S3: mở FPT từ gói (không gọi Project A cho 9 API), bối cảnh kỳ tới, kiểm ngày làm mốc", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(String(url)); return String(url).includes("earnings-signals") ? new Response(JSON.stringify(real.signals), { status: 200 }) : new Response("{}", { status: 500 }); }));
    let value: string | null = "FPT";
    const el = await mount(<SeasonalityView tickers={["AAA", "FPT", "HPG"]} value={value} onChange={(t) => { value = t; }} />);
    const txt = el.textContent ?? "";
    expect(txt).toContain("Mùa vụ KQKD · FPT"); // component cũ hiển thị với dữ liệu từ gói
    expect(calls.filter((u) => /earnings-cycle|annual-earnings-calendar/.test(u))).toEqual([]);
    expect(el.querySelector('[data-testid="season-context"]')!.textContent).toContain("26/01/2027");
    expect(el.querySelector('[data-testid="season-ctx-live"]')!.textContent).toContain("⚡");
    expect(el.querySelector('[data-testid="season-ctx-last"]')!.textContent).toContain("−3,5%");
    expect(el.querySelector('[data-testid="season-audit"]')!.textContent).toContain("1 kỳ lệch ≥ 2 phiên");
    expect(el.querySelector('[data-testid="season-audit-q3"]')!.textContent).toContain("+3 phiên");
    expect(localStorage.getItem(SEASON_TICKER_KEY)).toBe("FPT");
    await act(async () => { (el.querySelector('[data-testid="season-next"]') as HTMLButtonElement).click(); });
    expect(value).toBe("HPG");
  });
});
