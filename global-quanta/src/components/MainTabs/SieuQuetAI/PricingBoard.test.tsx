import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import PricingBoard, { BOARD_COLUMNS, fmtPrice, fmtVol, priceColor } from "./PricingBoard";
import { mergeQuote, useBoardQuotes } from "../../../hooks/useBoardQuotes";
import type { MarketQuote } from "../../../services/marketDataClient";
import type { SieuQuetStockItem } from "../../../hooks/useSieuQuetScanner";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const quote = (symbol: string, price: number, extra: Partial<MarketQuote> = {}): MarketQuote => ({
  symbol, exchange: "HOSE", price, refPrice: 62_700, ceiling: 67_000, floor: 58_400, change: price - 62_700, changePct: ((price - 62_700) / 62_700) * 100,
  open: 62_700, high: 63_200, low: 62_600, totalVolume: 1_485_200, totalValue: 9.3e10,
  bid: [{ price: 62_800, volume: 53_000 }, { price: 62_700, volume: 99_500 }, { price: 62_600, volume: 101_300 }],
  ask: [{ price: 62_900, volume: 100_000 }, { price: 67_000, volume: 69_400 }, { price: 0, volume: 5_000 }],
  time: "2026-10-02T13:23:27+07:00", session: "LO",
  provenance: { source: "SSI_STREAM", asOf: null, fetchedAt: "", isStale: false, fallbackReason: null, attempts: [] } as unknown as MarketQuote["provenance"],
  ...extra,
});
const item = (ticker: string, smartScore = 55.5): SieuQuetStockItem => ({
  ticker, companyName: null, sector: null, price: 62_700, changePct: 0, faScore: 50, taScore: 50, eventImpactScore: 0, smartScore,
  rsRating: 50, riskAdjustedMomentum: 0, riskRewardRatio: 1, trendTag: null, qualityTag: null, confluenceStatusCode: null, confluenceStatusLabel: null,
  confluenceBoost: 0, confluenceReasonCodes: [], breakoutBoostBadge: false, piotroskiFScore: 5, fScoreMax: 9, foreignNetBuyFlag: false, computedAt: "",
});

const roots: ReturnType<typeof createRoot>[] = [];
async function render(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(node); });
  return { el, root };
}

describe("Bảng giá trực tuyến (kiểu SSI)", () => {
  // Gỡ component sau mỗi test: hook bảng giá có setInterval, để lại sẽ chạy sau khi môi trường test bị huỷ.
  afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); vi.unstubAllGlobals(); vi.unstubAllEnvs(); document.body.innerHTML = ""; });

  it("quy ước màu bảng giá VN và đơn vị hiển thị", () => {
    const q = quote("FPT", 62_800);
    expect(priceColor(67_000, q)).toBe("#e879f9");
    expect(priceColor(58_400, q)).toBe("#22d3ee");
    expect(priceColor(62_700, q)).toBe("#facc15");
    expect(priceColor(63_000, q)).toBe("#22c55e");
    expect(priceColor(62_000, q)).toBe("#f43f5e");
    expect(fmtPrice(62_800)).toBe("62.80");
    expect(fmtVol(1_485_200)).toBe("1,485,200");
    expect(fmtPrice(0)).toBe("");
  });

  it("hiển thị 23 cột: trần/sàn/TC, 3 bước mua, khớp lệnh, 3 bước bán, tổng KL, cao/thấp, Smart; ATC; nháy ô khi giá đổi; gom nhóm; mở dòng phụ", async () => {
    const onToggle = vi.fn(), onStar = vi.fn();
    const { el } = await render(
      <PricingBoard sections={[["Tài chính", [item("FPT"), item("SSI", 61)]]]} grouped
        quotes={{ FPT: quote("FPT", 62_800, { session: "ATC" }) }} flash={{ FPT: { dir: "up", at: 1000 } }} now={1500}
        expandedTicker="FPT" starred={new Set(["FPT"])} onToggle={onToggle} onStar={onStar} observe={() => {}}
        renderDetail={(t, span) => <tr data-detail={t}><td colSpan={span}>chi tiết {t}</td></tr>} emptyText="trống" />,
    );
    const rows = [...el.querySelectorAll("tbody tr[data-ticker]")];
    expect(rows.map((r) => r.getAttribute("data-ticker"))).toEqual(["FPT", "SSI"]);
    const cells = [...rows[0].querySelectorAll("td")].map((c) => c.textContent);
    expect(cells.length).toBe(BOARD_COLUMNS);
    expect(cells.slice(1, 4)).toEqual(["67.00", "58.40", "62.70"]);
    expect(cells.slice(4, 10)).toEqual(["62.60", "101,300", "62.70", "99,500", "62.80", "53,000"]);
    expect(cells.slice(10, 13)).toEqual(["62.80", "+0.10", "+0.16%"]);
    expect(cells.slice(13, 19)).toEqual(["62.90", "100,000", "67.00", "69,400", "ATC", "5,000"]);
    expect(cells.slice(19, 23)).toEqual(["1,485,200", "63.20", "62.60", "55.5"]);
    const matchCell = rows[0].querySelectorAll("td")[10] as HTMLElement;
    expect(matchCell.style.background).toContain("34, 197, 94");
    expect((rows[0].querySelectorAll("td")[15] as HTMLElement).style.color).toBe("#e879f9"); // giá bán 2 = trần -> tím
    expect(el.textContent).toContain("Tài chính · 2 mã");
    expect(el.querySelector('[data-detail="FPT"]')?.textContent).toBe("chi tiết FPT");
    // Mã chưa có giá: ô trống, vẫn có Smart Score.
    expect([...rows[1].querySelectorAll("td")].map((c) => c.textContent).slice(-1)).toEqual(["61.0"]);
    await act(async () => { (rows[0].querySelector("button") as HTMLButtonElement).click(); });
    expect(onStar).toHaveBeenCalledWith("FPT");
    await act(async () => { rows[1].dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); });
    expect(onToggle).toHaveBeenCalledWith("SSI");
  });

  it("mergeQuote giữ trường cũ khi bản tin stream thiếu trường", () => {
    const merged = mergeQuote(quote("FPT", 62_800), { ...quote("FPT", 62_900), ceiling: null, bid: [] } as unknown as MarketQuote);
    expect(merged.price).toBe(62_900);
    expect(merged.ceiling).toBe(67_000);
    expect(merged.bid.length).toBe(3);
  });

  it("useBoardQuotes: ảnh chụp REST rồi cập nhật theo stream, ghi nhận hướng giá để nháy ô", async () => {
    vi.stubEnv("VITE_MARKET_GATEWAY_ENABLED", "true");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ quotes: { FPT: quote("FPT", 62_800) } }) })));
    const listeners: Record<string, (e: MessageEvent) => void> = {};
    class FakeES {
      onerror: (() => void) | null = null;
      constructor(public url: string) {}
      addEventListener(type: string, fn: (e: MessageEvent) => void) { listeners[type] = fn; }
      close() {}
    }
    vi.stubGlobal("EventSource", FakeES);
    let snap: ReturnType<typeof useBoardQuotes> | null = null;
    function Harness() { snap = useBoardQuotes(["FPT"], { flushMs: 20 }); return null; }
    await render(<Harness />);
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(snap!.quotes.FPT.price).toBe(62_800);
    await act(async () => {
      listeners.quote(new MessageEvent("quote", { data: JSON.stringify({ ...quote("FPT", 62_600), ceiling: null }) }));
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(snap!.quotes.FPT.price).toBe(62_600);
    expect(snap!.quotes.FPT.ceiling).toBe(67_000);
    expect(snap!.flash.FPT.dir).toBe("down");
  });
});
