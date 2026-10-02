import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import PanelResizer, { clampInsightWidth, defaultInsightWidth, INSIGHT_DEFAULT, INSIGHT_MIN } from "./PanelResizer";
import { TickerSearch } from "./TopBar/TickerSearch";
import { useAppStore } from "../store/useAppStore";
import { LEGACY_LIST_NAME, hasLegacyList, resetWatchlistsForTest, watchlistActions, useWatchlists } from "../hooks/useWatchlists";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(node: React.ReactNode, wrapClass?: string) {
  const host = document.createElement("div");
  if (wrapClass) host.className = wrapClass;
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{node}</SWRConfig>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { host, root };
}

describe("Bố cục toàn chiều rộng (gỡ cột Danh sách mã)", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.localStorage.clear(); resetWatchlistsForTest(); document.body.innerHTML = ""; });

  /** Dựng trạng thái như trình duyệt đã chuyển danh sách cũ ở bản trước (PR #13). */
  const seed = (lists: { id: string; name: string; tickers: string[]; notes?: Record<string, string>; pinned?: string[] }[], activeId: string, radarId?: string) =>
    window.localStorage.setItem("gq.watchlists.v1", JSON.stringify({ lists, activeId, radarId }));
  async function snapshot() {
    let snap: ReturnType<typeof useWatchlists> | null = null;
    function Spy() { snap = useWatchlists(); return null; }
    await render(<Spy />);
    return snap!;
  }

  it("gộp \"Danh sách mã (cũ)\" vào \"Danh mục của tôi\": hợp mã (không trùng), giữ ghi chú + ghim, rồi xoá danh sách cũ", async () => {
    seed([
      { id: "default", name: "Danh mục của tôi", tickers: ["SSI", "FPT"], notes: { FPT: "của tôi" }, pinned: ["SSI"] },
      { id: "legacy", name: LEGACY_LIST_NAME, tickers: ["VNM", "FPT", "HPG"], notes: { FPT: "cũ", VNM: "Cổ tức" }, pinned: ["HPG"] },
    ], "legacy", "legacy");
    expect(hasLegacyList((await snapshot()).lists)).toBe(true);
    watchlistActions.mergeLegacy();
    const s = await snapshot();
    expect(s.lists.map((l) => l.name)).toEqual(["Danh mục của tôi"]);
    expect(s.active.tickers).toEqual(["SSI", "FPT", "VNM", "HPG"]);
    expect(s.active.notes).toEqual({ FPT: "của tôi", VNM: "Cổ tức" }); // ghi chú của tôi được ưu tiên
    expect(s.active.pinned).toEqual(["SSI", "HPG"]);
    expect(s.radar.id).toBe("default"); // Radar đang trỏ danh sách cũ -> chuyển sang Danh mục của tôi
  });

  it("chưa có \"Danh mục của tôi\": danh sách cũ được đổi tên thành danh mục đó", async () => {
    seed([{ id: "legacy", name: LEGACY_LIST_NAME, tickers: ["VCB"] }, { id: "wl-x", name: "Ngân hàng", tickers: ["TCB"] }], "wl-x");
    watchlistActions.mergeLegacy();
    const s = await snapshot();
    expect(s.lists.map((l) => [l.id, l.name, l.tickers.join()])).toEqual([["default", "Danh mục của tôi", "VCB"], ["wl-x", "Ngân hàng", "TCB"]]);
    expect(s.active.id).toBe("wl-x"); // không đổi danh mục đang chọn
  });

  it("xoá hẳn danh sách cũ; Radar mặc định theo \"Danh mục của tôi\" và đổi được danh mục", async () => {
    seed([{ id: "default", name: "Danh mục của tôi", tickers: ["SSI"] }, { id: "legacy", name: LEGACY_LIST_NAME, tickers: ["VNM"] }, { id: "wl-b", name: "B", tickers: ["ACB"] }], "legacy");
    watchlistActions.removeLegacy();
    let s = await snapshot();
    expect(s.lists.map((l) => l.id)).toEqual(["default", "wl-b"]);
    expect(s.active.id).toBe("default");
    expect(s.radar.id).toBe("default");
    watchlistActions.setRadarList("wl-b");
    s = await snapshot();
    expect(s.radar.tickers).toEqual(["ACB"]);
  });

  it("vạch kéo: kẹp bề rộng, thu gọn khi kéo hẳn sang phải, phím tắt, nhớ bề rộng", async () => {
    vi.stubGlobal("innerWidth", 1536);
    expect(clampInsightWidth(150)).toBe(0);
    expect(clampInsightWidth(250)).toBe(INSIGHT_MIN);
    expect(clampInsightWidth(5000)).toBe(Math.round(1536 * 0.45));
    const { host } = await render(<PanelResizer />, "app");
    const app = host as HTMLElement;
    const sep = host.querySelector('[role="separator"]') as HTMLElement;
    expect(app.style.getPropertyValue("--insight-w")).toBe(`${INSIGHT_DEFAULT}px`);
    await act(async () => { sep.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })); });
    expect(app.style.getPropertyValue("--insight-w")).toBe(`${INSIGHT_DEFAULT + 24}px`);
    expect(window.localStorage.getItem("gq.insightWidth")).toBe(String(INSIGHT_DEFAULT + 24));
    await act(async () => { sep.dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true })); });
    expect(app.hasAttribute("data-insight-collapsed")).toBe(true);
    await act(async () => { sep.dispatchEvent(new MouseEvent("dblclick", { bubbles: true })); });
    expect(app.style.getPropertyValue("--insight-w")).toBe(`${INSIGHT_DEFAULT}px`);
    expect(app.hasAttribute("data-insight-collapsed")).toBe(false);
  });

  it("màn hình laptop (< 1440px): cột phải mặc định 320px để Bảng giá vừa khung", async () => {
    vi.stubGlobal("innerWidth", 1366);
    expect(defaultInsightWidth()).toBe(320);
    const { host } = await render(<PanelResizer />, "app");
    expect((host as HTMLElement).style.getPropertyValue("--insight-w")).toBe("320px");
    vi.stubGlobal("innerWidth", 1920);
    expect(defaultInsightWidth()).toBe(INSIGHT_DEFAULT);
  });

  it("tìm mã trên thanh trên: phím '/', gợi ý từ Bảng Siêu Quét, Enter -> chọn mã + yêu cầu mở trong bảng", async () => {
    vi.stubEnv("VITE_MARKET_GATEWAY_ENABLED", "true");
    vi.stubEnv("VITE_SCANNER_SOURCE", "gateway");
    const items = [
      { ticker: "HPG", companyName: "Hoa Phat Group", industry: "Thép & Kim loại", smartScore: 47.4 },
      { ticker: "HAG", companyName: "Hoang Anh Gia Lai", industry: "Bất động sản", smartScore: 49.2 },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ items, indexState: null, generatedAt: "", totalCount: 2 }) })));
    useAppStore.setState({ scannerFocus: null, selectedTicker: null });
    const { host } = await render(<TickerSearch />);
    const input = host.querySelector("input") as HTMLInputElement;
    await act(async () => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true })); });
    expect(document.activeElement).toBe(input);
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => { setValue.call(input, "hp"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    const options = [...host.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    expect(options[0]).toContain("HPG");
    await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(useAppStore.getState().scannerFocus?.ticker).toBe("HPG");
    expect(useAppStore.getState().selectedTicker).toBe("HPG");
    // Mã ngoài danh sách quét: vẫn mở được (bảng sẽ thêm vào danh mục để chấm điểm).
    await act(async () => { setValue.call(input, "abc"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(host.textContent).toContain("Mở ABC");
    const nonce = useAppStore.getState().scannerFocus!.nonce;
    await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(useAppStore.getState().scannerFocus).toEqual({ ticker: "ABC", nonce: nonce + 1 });
  });
});

describe("Xoá Danh sách mã (cũ) khi mở trang", () => {
  afterEach(() => { vi.unstubAllGlobals(); window.localStorage.clear(); resetWatchlistsForTest(); document.body.innerHTML = ""; });
  it("MarketFeed xoá danh sách cũ, giữ nguyên Danh mục của tôi", async () => {
    vi.stubGlobal("EventSource", class { addEventListener() {} close() {} onerror = null; });
    const { default: MarketFeed } = await import("./MarketFeed");
    window.localStorage.setItem("gq.watchlists.v1", JSON.stringify({ activeId: "legacy", lists: [
      { id: "default", name: "Danh mục của tôi", tickers: ["SSI"] }, { id: "legacy", name: LEGACY_LIST_NAME, tickers: ["VNM", "FPT"] }] }));
    await render(<MarketFeed />);
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const saved = JSON.parse(window.localStorage.getItem("gq.watchlists.v1")!);
    expect(saved.lists.map((l: { name: string }) => l.name)).toEqual(["Danh mục của tôi"]);
    expect(saved.lists[0].tickers).toEqual(["SSI"]);
    expect(saved.activeId).toBe("default");
  });
});
