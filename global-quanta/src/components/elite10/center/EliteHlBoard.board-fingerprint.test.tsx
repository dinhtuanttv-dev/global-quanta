// BUỒNG LÁI C0 (20/11/2026, docs/elite-hl-cockpit/08 B2) — VÂN TAY TOÀN BỘ Bảng quyết định Elite HL (mọi khối: thanh lệnh, đồng hồ, phễu,
// thay đổi hôm nay, danh mục, không gian quy tắc, chờ nền, hàng chờ, ngành…) trên dữ liệu thật 18/11. Tệp nền ghi từ main fb27ea40
// CHƯA SỬA. Nâng cấp buồng lái chỉ được THÊM phần tử mang data-hl-layer: gỡ chúng ra thì bảng phải giống từng ký tự, lớp bật hay tắt.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "../../../test/rtl-lite";
import fixture from "../../../lib/elite10/__fixtures__/deck-2026-11-18.json";
import type { EliteDecision } from "../../../lib/elite10/decisionTypes";

const d = fixture.decision as unknown as EliteDecision;
vi.mock("../../../hooks/useSmartNews", () => ({ useSmartNews: () => ({ data: undefined, error: null, isLoading: false, enabled: true }) }));
vi.mock("../../../hooks/useRadarSignals", () => ({ useRadarSignals: () => ({ data: null, error: null, isLoading: false, enabled: true }) }));
vi.mock("../../../store/useAppStore", () => ({ useAppStore: (sel: (s: unknown) => unknown) => sel({ livePrices: {} }) }));
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

/** Chữ + testId của TOÀN bảng sau khi gỡ mọi phần tử lớp nâng cấp (data-hl-layer). */
function boardFingerprint(): string {
  const root = screen.getByTestId("elite-hl-board").cloneNode(true) as HTMLElement;
  root.querySelectorAll("[data-hl-layer]").forEach((e) => e.remove());
  const ids = [...root.querySelectorAll("[data-testid]")].map((e) => `${e.getAttribute("data-testid")} :: ${(e.textContent ?? "").replace(/\s+/g, " ").trim()}`);
  return JSON.stringify({ testIds: ids, text: (root.textContent ?? "").replace(/\s+/g, " ").trim() }, null, 1);
}
const LAYERS_KEY = "gq.hl.layers.v1";
const ALL_OFF = { news: false, signals: false, buy: false, live: false, impact: false, trend: false, cockpit: false };
afterEach(() => { cleanup(); try { window.localStorage.removeItem(LAYERS_KEY); } catch { /* */ } });

describe("Vân tay toàn Bảng quyết định Elite HL (dữ liệu thật 18/11)", () => {
  it("lớp mặc định: bảng gốc giống từng ký tự tệp nền", async () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    await expect(boardFingerprint()).toMatchFileSnapshot("./__fingerprints__/hl-board-2026-11-18.json");
  });
  it("tắt mọi lớp: bảng gốc giống từng ký tự tệp nền", async () => {
    window.localStorage.setItem(LAYERS_KEY, JSON.stringify(ALL_OFF));
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    await expect(boardFingerprint()).toMatchFileSnapshot("./__fingerprints__/hl-board-2026-11-18.json");
  });
});
