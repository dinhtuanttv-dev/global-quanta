// HL-RADAR (20/11/2026, tài liệu 20 mục 6) — VÂN TAY bảng "Danh mục Elite HL": khoá chữ của mọi phần tử có data-testid và toàn bộ chữ
// của khối `elite-portfolio` (bảng máy tính + thẻ điện thoại) trên dữ liệu thật 18/11. Tệp nền được ghi từ mã TRƯỚC nâng cấp.
// Nâng cấp chỉ được THÊM phần tử mang data-hl-layer: gỡ chúng đi thì bảng phải giống từng ký tự — cả khi lớp mới tắt lẫn bật.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "../../../test/rtl-lite";
import fixture from "../../../lib/elite10/__fixtures__/deck-2026-11-18.json";
import type { EliteDecision } from "../../../lib/elite10/decisionTypes";

const d = fixture.decision as unknown as EliteDecision;
const NEWS = { generatedAt: "2026-11-18T10:00:00Z", days: 14, tickers: [], perTicker: {}, sources: {}, items: [
  { id: "n1", title: "VPL công bố kết quả kinh doanh quý 3", summary: "", url: "https://example.com/n1", attachment: null, publishedAt: "2026-11-18T03:00:00Z", source: "CAFEF", sourceLabel: "CafeF", alsoIn: ["VIETSTOCK"], corroboration: 2, tickers: ["VPL"], eventType: "EARNINGS", eventLabel: "KQKD", sentiment: 0.6, sentimentHits: [], reaction: { sessions: 1, ret: 0.012, excess: 0.01, volumeRatio: 2.1, abnormal: { method: "x", sessions: 1, classification: "repricing" } }, insight: { tone: "up", text: "Lợi nhuận vượt kỳ vọng" }, importance: 80 },
  { id: "n2", title: "HSG giảm giá bán thép", summary: "", url: null, attachment: null, publishedAt: "2026-11-16T03:00:00Z", source: "VIETSTOCK", sourceLabel: "Vietstock", alsoIn: [], corroboration: 1, tickers: ["HSG"], eventType: "OTHER", eventLabel: "Khác", sentiment: -0.5, sentimentHits: [], reaction: null, insight: null, importance: 50 },
] };
const SIG = { items: { VIC: { stealth20: { on: true, z: 2.4, direction: 1 }, intent: null } }, evidence: { STEALTH_20: { verdict: "edge" } } };
let newsData: unknown = NEWS, sigData: unknown = SIG;
vi.mock("../../../hooks/useSmartNews", () => ({ useSmartNews: () => ({ data: newsData, error: null, isLoading: false, enabled: true }) }));
vi.mock("../../../hooks/useRadarSignals", () => ({ useRadarSignals: () => ({ data: sigData, error: null, isLoading: false, enabled: true }) }));
vi.mock("../../../store/useAppStore", () => ({ useAppStore: (sel: (s: unknown) => unknown) => sel({ livePrices: { VPL: { price: 96500, changePct: 0.8 } } }) }));
vi.mock("../../../hooks/elite10/useDeckData", () => ({ useDeckRisk: () => ({ data: fixture.risk }), useDeckPanel: () => ({ data: fixture.panel }), useEvidenceRegistry: () => ({ data: null }) }));
vi.mock("../../../hooks/useWorldStrategy", () => ({ useWorldStrategy: () => ({ data: { short: { rows: [] }, regime: fixture.world.regime } }) }));
vi.mock("../../../hooks/elite10/useHlLedger", () => ({ useHlLedger: () => ({ data: null }) }));
vi.mock("../../../hooks/elite10/useEliteTiming", () => ({ useEliteTiming: () => ({ data: { rows: [] }, sessions: [], meta: null, loading: false, error: null }) }));
vi.mock("../../../hooks/useGatewayBuyTimeline", () => ({ buyTimingFreshness: () => null }));
vi.mock("swr", () => ({ default: () => ({ data: undefined }) }));
vi.mock("./CashGateCard", () => ({ default: () => null }));
vi.mock("./ToTickerCard", () => ({ default: () => null }));
vi.mock("../timing/TimingSimPanel", () => ({ default: () => null }));
vi.mock("../news/EliteNewsPanel", () => ({ default: () => null }));
vi.mock("../../../hooks/elite10/useProfileFa", () => ({ useProfileFaWarnings: () => ({ data: null }) }));
import EliteHlBoard from "./EliteHlBoard";

/** Chữ của khối danh mục sau khi gỡ mọi phần tử của lớp nâng cấp (data-hl-layer). */
function fingerprint(): string {
  const root = screen.getByTestId("elite-portfolio").cloneNode(true) as HTMLElement;
  root.querySelectorAll("[data-hl-layer]").forEach((e) => e.remove());
  const ids = [...root.querySelectorAll("[data-testid]")].map((e) => `${e.getAttribute("data-testid")} :: ${(e.textContent ?? "").replace(/\s+/g, " ").trim()}`);
  const ths = [...root.querySelectorAll("th")].map((e) => (e.textContent ?? "").trim());
  return JSON.stringify({ headers: ths, testIds: ids, text: (root.textContent ?? "").replace(/\s+/g, " ").trim() }, null, 1);
}
const LAYERS_KEY = "gq.hl.layers.v1";
afterEach(() => { cleanup(); newsData = NEWS; sigData = SIG; try { window.localStorage.removeItem(LAYERS_KEY); } catch { /* */ } });

describe("Vân tay bảng Danh mục Elite HL (dữ liệu thật 18/11)", () => {
  it("lớp nâng cấp mặc định (bật): bảng gốc giống từng ký tự tệp nền", async () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    await expect(fingerprint()).toMatchFileSnapshot("./__fingerprints__/hl-portfolio-2026-11-18.json");
  });
  it("tắt mọi lớp nâng cấp: bảng gốc giống từng ký tự tệp nền, không còn phần tử lớp nào", async () => {
    window.localStorage.setItem(LAYERS_KEY, JSON.stringify({ news: false, signals: false, buy: false, live: false, impact: false, trend: false }));
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    await expect(fingerprint()).toMatchFileSnapshot("./__fingerprints__/hl-portfolio-2026-11-18.json");
    expect(screen.getByTestId("elite-portfolio").querySelectorAll("[data-hl-layer]:not([data-hl-layer='toggles'])").length).toBe(0);
  });
  it("nguồn mới lỗi / rỗng: bảng gốc vẫn giống tệp nền", async () => {
    newsData = undefined; sigData = null;
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    await expect(fingerprint()).toMatchFileSnapshot("./__fingerprints__/hl-portfolio-2026-11-18.json");
  });
});
