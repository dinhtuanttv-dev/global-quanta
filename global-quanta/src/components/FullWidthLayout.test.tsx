import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import PanelResizer, { clampInsightWidth, INSIGHT_DEFAULT, INSIGHT_MIN } from "./PanelResizer";
import { TickerSearch } from "./TopBar/TickerSearch";
import { useAppStore } from "../store/useAppStore";
import { LEGACY_LIST_NAME, isLegacyMigrated, migrateLegacyWatchlist, resetWatchlistsForTest, watchlistActions, useWatchlists } from "../hooks/useWatchlists";

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

  it("chuyển danh sách mã cũ sang ★ Danh mục một lần, giữ ghi chú và mã ghim", () => {
    const legacy = [
      { ticker: "FPT", reason: "Dẫn dắt công nghệ", pinned: true },
      { ticker: "hpg", reason: null, pinned: false },
      { ticker: "VNM", reason: "Cổ tức", pinned: false },
    ];
    expect(isLegacyMigrated()).toBe(false);
    expect(migrateLegacyWatchlist(legacy)).toBe(true);
    let snap: ReturnType<typeof useWatchlists> | null = null;
    function Spy() { snap = useWatchlists(); return null; }
    return render(<Spy />).then(() => {
      expect(snap!.lists.map((l) => l.name)).toEqual([LEGACY_LIST_NAME]); // danh mục mặc định trống được thay
      expect(snap!.active.tickers).toEqual(["FPT", "HPG", "VNM"]);
      expect(snap!.active.notes).toEqual({ FPT: "Dẫn dắt công nghệ", VNM: "Cổ tức" });
      expect(snap!.active.pinned).toEqual(["FPT"]);
      expect(isLegacyMigrated()).toBe(true);
      expect(migrateLegacyWatchlist(legacy)).toBe(false); // chỉ một lần
    });
  });

  it("đã có danh mục riêng: danh sách cũ được thêm thành danh mục mới, KHÔNG đổi danh mục đang chọn", async () => {
    watchlistActions.add(["SSI"]);
    migrateLegacyWatchlist([{ ticker: "VCB" }]);
    let snap: ReturnType<typeof useWatchlists> | null = null;
    function Spy() { snap = useWatchlists(); return null; }
    await render(<Spy />);
    expect(snap!.lists.map((l) => l.name)).toEqual(["Danh mục của tôi", LEGACY_LIST_NAME]);
    expect(snap!.active.tickers).toEqual(["SSI"]);
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
