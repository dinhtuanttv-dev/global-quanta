// RÀ SOÁT NGƯỢC Bảng quyết định (20/11/2026) — chốt chặn hồi quy trên dữ liệu SỐNG 20/11: không số hỏng, không trùng testid,
// radar 4 điều kiện bán và thành phần nhóm lõi (lớp Buồng lái) đúng; tắt lớp Buồng lái -> không còn hai khối đó.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "../../../test/rtl-lite";
import deck from "../../../lib/elite10/__fixtures__/deck-2026-11-18.json";
import px from "../../../lib/elite10/__fixtures__/pulse-2026-11-20.json";
import type { EliteDecision } from "../../../lib/elite10/decisionTypes";

vi.mock("swr", () => ({ default: (key: unknown) => ({ data: Array.isArray(key) && key[0] === "elite-hl-history" ? px.history : undefined }) }));
vi.mock("../../../services/marketDataClient", async (orig) => ({ ...(await orig<typeof import("../../../services/marketDataClient")>()), isMarketGatewayEnabled: () => true }));
vi.mock("../../../hooks/useSmartNews", () => ({ useSmartNews: () => ({ data: undefined, error: null, isLoading: false, enabled: true }) }));
vi.mock("../../../hooks/useRadarSignals", () => ({ useRadarSignals: () => ({ data: null, error: null, isLoading: false, enabled: true }) }));
vi.mock("../../../store/useAppStore", () => ({ useAppStore: (sel: (s: unknown) => unknown) => sel({ livePrices: {} }) }));
vi.mock("../../../hooks/elite10/useDeckData", () => ({ useDeckRisk: () => ({ data: null }), useDeckPanel: () => ({ data: null }), useEvidenceRegistry: () => ({ data: null }) }));
vi.mock("../../../hooks/useWorldStrategy", () => ({ useWorldStrategy: () => ({ data: { short: { rows: [] }, regime: deck.world.regime } }) }));
vi.mock("../../../hooks/elite10/useHlLedger", () => ({ useHlLedger: () => ({ data: null }) }));
vi.mock("../../../hooks/elite10/useEliteTiming", () => ({ useEliteTiming: () => ({ data: { rows: [] }, sessions: [], meta: null, loading: false, error: null }) }));
vi.mock("../../../hooks/useGatewayBuyTimeline", () => ({ buyTimingFreshness: () => null }));
vi.mock("./CashGateCard", () => ({ default: () => null }));
vi.mock("./ToTickerCard", () => ({ default: () => null }));
vi.mock("../timing/TimingSimPanel", () => ({ default: () => null }));
vi.mock("../news/EliteNewsPanel", () => ({ default: () => null }));
vi.mock("../../../hooks/elite10/useProfileFa", () => ({ useProfileFaWarnings: () => ({ data: null }) }));
import EliteHlBoard from "./EliteHlBoard";

const d = px.decision as unknown as EliteDecision;
afterEach(() => { cleanup(); window.localStorage.removeItem("gq.hl.layers.v1"); });

describe("Rà soát ngược — Bảng quyết định Elite HL (dữ liệu thật 20/11)", () => {
  it("không có NaN / undefined / Infinity / [object …] trong toàn bảng; mọi data-testid là duy nhất; kiểm tra nhất quán không bật", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    const root = screen.getByTestId("elite-hl-board");
    expect((root.textContent ?? "").match(/NaN|undefined|Infinity|\[object/g)).toBeNull();
    const ids = [...root.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid"));
    expect(ids.filter((x, i) => ids.indexOf(x) !== i)).toEqual([]);
    expect(screen.queryByTestId("deck-invariants")).toBeNull();
  });
  it("radar 4 điều kiện bán: đủ 7 mã đang giữ; HSG sát ngưỡng LS (66 < 70) và TA cần theo dõi (2/7)", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    const box = screen.getByTestId("exit-triggers");
    expect(box.querySelectorAll("tr[data-near]").length).toBe(7);
    expect(screen.getByTestId("exit-trig-ls-HSG").getAttribute("data-level")).toBe("NEAR");
    expect(screen.getByTestId("exit-trig-ta-HSG").getAttribute("data-level")).toBe("WATCH");
    expect(box.getAttribute("data-hl-layer")).toBe("cockpit");
  });
  it("nhóm lõi theo vị trí giá ghi rõ mã chưa có nền (AAS, HSG) dù tiêu đề là “trong nền và vùng mua”", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    expect(screen.getByTestId("hl-core-mix").textContent).toMatch(/Chưa có nền 2 \(AAS, HSG\)/);
  });
  it("tắt lớp Buồng lái -> không còn radar 4 điều kiện và dòng nhóm lõi", () => {
    window.localStorage.setItem("gq.hl.layers.v1", JSON.stringify({ cockpit: false }));
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    expect(screen.queryByTestId("exit-triggers")).toBeNull();
    expect(screen.queryByTestId("hl-core-mix")).toBeNull();
  });
});
