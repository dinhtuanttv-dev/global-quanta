// N1 — Tin thông minh Elite 10: cùng thân với cột phải; danh sách mã = mã đang xem + danh mục Elite (bỏ chỉ số); huy hiệu ESA tin.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";

const asked: string[][] = [];
const item = (o: Record<string, unknown>) => ({
  id: "x", title: "HPG: Kết quả kinh doanh 9 tháng đầu năm 2026", summary: "", url: null, attachment: null, publishedAt: new Date().toISOString(),
  source: "DISCLOSURE", sourceLabel: "Công bố HOSE", alsoIn: [], corroboration: 1, tickers: ["HPG"], eventType: "EARNINGS", eventLabel: "Kết quả kinh doanh",
  sentiment: 0.4, sentimentHits: [], insight: null, importance: 80,
  reaction: { sessions: 1, ret: 0.0217, excess: 0.0279, volumeRatio: 2.04, from: "2026-10-28", to: "2026-10-29",
    abnormal: { method: "CW96", sessions: 1, classification: "repricing", from: "2026-10-29", to: "2026-10-29", estimation: { n: 110, beta: 0.704 },
      sav0: 2.29, volumeMultiple0: 2.14, cav: 0.76, zVolume: 2.29, car: 0.0271, zReturn: 2.07 } },
  ...o,
});
vi.mock("../../../hooks/useSmartNews", () => ({
  useSmartNews: (t: string[]) => { asked.push(t); return { data: { generatedAt: "", days: 14, tickers: t, items: [item({}), item({ id: "y", tickers: ["VPI"], title: "VPI tin thường", reaction: null })], perTicker: {}, sources: {} }, error: null, isLoading: false, enabled: true }; },
}));
vi.mock("../../../hooks/elite10/useEliteCenter", () => ({ useEliteDecision: () => ({ data: { portfolio: [{ ticker: "VPI" }, { ticker: "FPT" }] } }) }));

import EliteNewsPanel from "./EliteNewsPanel";

beforeEach(() => { vi.stubEnv("VITE_MARKET_GATEWAY_ENABLED", "true"); asked.length = 0; });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("EliteNewsPanel", () => {
  it("mã đang xem + danh mục Elite; nhãn liên quan; huy hiệu ESA tin cho phản ứng định giá lại; mở tin thấy chi tiết", () => {
    const open: string[] = [];
    render(<EliteNewsPanel ticker="HPG" onTicker={(t) => open.push(t)} />);
    expect(asked[asked.length - 1]).toEqual(["HPG", "VPI", "FPT"]);
    const el = screen.getByTestId("elite-news-panel");
    expect(el.textContent).toContain("● Đang xem");
    expect(el.textContent).toContain("● Elite 10");
    expect(screen.getAllByTestId("esa-news-badge")).toHaveLength(1);
    expect(screen.getAllByTestId("esa-news-badge")[0].textContent).toContain("ESA KL ×2.1 · định giá lại");
    fireEvent.click(el.querySelector(".news-item")!);
    expect(screen.getByTestId("esa-news-detail").textContent).toContain("z KL 2.29");
    fireEvent.click(el.querySelector(".news-tag")!);
    expect(open).toEqual(["HPG"]);
  });
  it("đang xem chỉ số (VNINDEX) -> chỉ lấy tin các mã Elite", () => {
    render(<EliteNewsPanel ticker="VNINDEX" onTicker={() => {}} />);
    expect(asked[asked.length - 1]).toEqual(["VPI", "FPT"]);
  });
});
