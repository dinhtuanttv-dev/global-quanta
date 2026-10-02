import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import NewsFeed from "./NewsFeed";
import { resetWatchlistsForTest } from "../../hooks/useWatchlists";
import { useAppStore } from "../../store/useAppStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const news = {
  generatedAt: "2026-10-02T03:00:00Z", days: 14, tickers: ["TTF", "HPG"],
  items: [
    { id: "a", title: "TTF vào diện kiểm soát sau nhiều lần bị cảnh báo", summary: "HOSE quyết định…", url: "https://vietstock.vn/a", attachment: null,
      publishedAt: new Date(Date.now() - 2 * 3600_000).toISOString(), source: "VIETSTOCK", sourceLabel: "Vietstock", alsoIn: ["CafeF"], corroboration: 2,
      tickers: ["TTF"], eventType: "LEGAL", eventLabel: "Pháp lý / cảnh báo", sentiment: -1, sentimentHits: ["diện kiểm soát", "cảnh báo"],
      reaction: { sessions: 1, ret: -0.068, excess: -0.06, volumeRatio: 3.2, from: "2026-10-01", to: "2026-10-02" },
      insight: { tone: "down", text: "Giá đã phản ánh -6.0% so VN-Index" }, importance: 92 },
    { id: "b", title: "HPG: Nghị quyết HĐQT số 13", summary: "", url: null, attachment: "https://x/nq.pdf",
      publishedAt: new Date(Date.now() - 26 * 3600_000).toISOString(), source: "DISCLOSURE", sourceLabel: "Công bố HOSE", alsoIn: [], corroboration: 1,
      tickers: ["HPG"], eventType: "AGM", eventLabel: "ĐHĐCĐ / nghị quyết", sentiment: 0, sentimentHits: [], reaction: null, insight: null, importance: 38 },
    { id: "c", title: "Con trai tỷ phú muốn gom thêm 50 triệu cổ phiếu HPG", summary: "", url: "https://cafef.vn/c", attachment: null,
      publishedAt: new Date(Date.now() - 3 * 3600_000).toISOString(), source: "CAFEF", sourceLabel: "CafeF", alsoIn: [], corroboration: 1,
      tickers: ["HPG"], eventType: "INSIDER", eventLabel: "Giao dịch nội bộ / cổ đông lớn", sentiment: 0.5, sentimentHits: ["gom thêm"],
      reaction: { sessions: 0, ret: null, excess: null, volumeRatio: null }, insight: { tone: "watch", text: "Tin tích cực nhưng giá chưa phản ánh (-0.3% so VN-Index)" }, importance: 44 },
  ],
  perTicker: { TTF: { count: 1, avgSentiment: -1, top: "a" }, HPG: { count: 2, avgSentiment: 0.25, top: "c" } },
  sources: { VNDIRECT: { ok: true, items: 2 }, "https://cafef.vn/doanh-nghiep.rss": { ok: false, error: "HTTP 503" } },
};

const roots: ReturnType<typeof createRoot>[] = [];
async function mount() {
  vi.stubEnv("VITE_MARKET_GATEWAY_ENABLED", "true");
  window.localStorage.setItem("gq.watchlists.v1", JSON.stringify({ activeId: "default", lists: [{ id: "default", name: "Danh mục của tôi", tickers: ["TTF", "HPG"] }] }));
  const fetchMock = vi.fn(async (url: string) => (String(url).includes("/api/market/news") ? { ok: true, status: 200, json: async () => news } : { ok: false, status: 404, json: async () => ({ error: "không có" }) }));
  vi.stubGlobal("fetch", fetchMock);
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0, shouldRetryOnError: false, refreshInterval: 0 }}><NewsFeed /></SWRConfig>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { el, fetchMock };
}

describe("TIN TỨC THÔNG MINH — tin thật cho ★ Danh mục", () => {
  afterEach(() => {
    act(() => { for (const r of roots.splice(0)) r.unmount(); });
    vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.localStorage.clear(); resetWatchlistsForTest(); document.body.innerHTML = "";
  });

  it("gọi API tin theo các mã của danh mục, xếp theo mức quan trọng, hiện loại sự kiện, nguồn xác nhận chéo, nhận định phản ứng giá", async () => {
    const { el, fetchMock } = await mount();
    const call = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.includes("/api/market/news"))!;
    expect(decodeURIComponent(call)).toContain("tickers=HPG,TTF");
    const titles = [...el.querySelectorAll(".news-title")].map((t) => t.textContent);
    expect(titles[0]).toContain("TTF vào diện kiểm soát");
    expect(el.textContent).toContain("Pháp lý / cảnh báo");
    expect(el.textContent).toContain("Vietstock +1 nguồn");
    expect(el.textContent).toContain("Giá đã phản ánh -6.0% so VN-Index");
    expect(el.textContent).toContain("◆ Tin tích cực nhưng giá chưa phản ánh");
    expect(el.textContent).toContain("1 nguồn tạm lỗi");
    expect(el.textContent).toContain("HPG ▲2");
  });

  it("lọc Công bố / Tiêu cực; mở chi tiết thấy phản ứng giá và link bài gốc; bấm mã chọn mã toàn trang", async () => {
    const { el } = await mount();
    const tab = (name: string) => [...el.querySelectorAll('[role="tab"]')].find((b) => b.textContent === name) as HTMLButtonElement;
    await act(async () => { tab("Công bố").click(); });
    expect([...el.querySelectorAll(".news-title")].map((t) => t.textContent)).toEqual(["●HPG: Nghị quyết HĐQT số 13"]);
    await act(async () => { tab("Tiêu cực").click(); });
    const row = el.querySelector(".news-item") as HTMLElement;
    await act(async () => { row.click(); });
    expect(el.textContent).toContain("so VN-Index -6.0%");
    expect(el.textContent).toContain("KL phiên sau tin ×3.2 TB20");
    expect((el.querySelector('a[href="https://vietstock.vn/a"]') as HTMLAnchorElement).target).toBe("_blank");
    await act(async () => { (el.querySelector("button.news-tag") as HTMLButtonElement).click(); });
    expect(useAppStore.getState().selectedTicker).toBe("TTF");
  });
});
