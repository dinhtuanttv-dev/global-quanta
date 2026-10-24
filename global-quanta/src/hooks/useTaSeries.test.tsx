// A3 (D-07) — lỗi tải chuỗi giá được phân loại: mạng / không có mã / lỗi máy chủ / dữ liệu sai; provenance được giữ lại.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SeriesLoadError, useTaSeries } from "./useTaSeries";

vi.mock("../services/marketDataClient", () => ({ isMarketGatewayEnabled: () => true, marketUrl: (p: string, q: Record<string, unknown>) => `${p}?t=${q.ticker}` }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });

async function run(fetchImpl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(fetchImpl));
  let out: ReturnType<typeof useTaSeries> | null = null;
  const Probe = () => { out = useTaSeries("FPT"); return null; };
  const el = document.createElement("div"); document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => { root.render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false }}><Probe /></SWRConfig>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  act(() => root.unmount());
  return out!;
}
const json = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

describe("A3 — tải chuỗi giá", () => {
  it("phân loại lỗi", async () => {
    expect(((await run(async () => { throw new TypeError("Failed to fetch"); })).error as SeriesLoadError).kind).toBe("network");
    expect(((await run(json(404, { error: "x" }))).error as SeriesLoadError).kind).toBe("notFound");
    expect(((await run(json(503, {}))).error as SeriesLoadError).kind).toBe("server");
    expect(((await run(json(200, { nope: 1 }))).error as SeriesLoadError).kind).toBe("invalid");
  });
  it("giữ provenance + quality của Gateway", async () => {
    const r = await run(json(200, { bars: [{ date: "2026-10-23", open: 1, high: 1, low: 1, close: 1, volume: 1 }], priceBasis: "ADJUSTED_CUMULATIVE",
      provenance: { source: "SSI_FC_V2", asOf: "2026-10-23", fetchedAt: "2026-10-24T10:00:00Z", isStale: false, fallbackReason: null, partialToday: false }, quality: { eventsSkipped: 2 } }));
    expect(r.provenance).toMatchObject({ source: "SSI_FC_V2", asOf: "2026-10-23", isStale: false });
    expect(r.quality.eventsSkipped).toBe(2);
  });
});
