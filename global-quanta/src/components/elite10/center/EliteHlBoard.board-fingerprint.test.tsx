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
const ALL_OFF = { news: false, signals: false, buy: false, live: false, impact: false, trend: false, cockpit: false, timing: false, pulse: false };
// NHỊP QUYẾT ĐỊNH (20/11/2026, docs/elite-hl-pulse 03 — quyết định P1 của chủ dự án): lớp "pulse" (mặc định bật) THAY hai khối "Hôm nay"
// (deck-today) và "Thay đổi hôm nay" (hl-changes). Khi đó bảng gốc phải bằng TỆP NỀN KHÔNG ĐỔI trừ đúng hai khối đó. Mọi giá trị của hai
// khối được chứng minh có mặt trong panel mới ở DecisionPulse.test.tsx (KP1); lớp tắt -> giống hệt tệp nền (test thứ hai).
import base from "./__fingerprints__/hl-board-2026-11-18.json";
// GỘP NGƯỠNG BÁN (27/11/2026, quyết định chủ dự án): lớp cockpit bật -> khối "Khoảng cách tới ngưỡng bán" (deck-exit-radar) được THAY bằng
// bảng "Ngưỡng bán · 4 điều kiện" (exit-triggers, mang data-hl-layer). Mọi giá trị LS-v1 của khối cũ có trong bảng mới (BoardAudit.test).
const REPLACED = /^(deck-exit-radar|deck-exit-[A-Z0-9]+|deck-today|hl-kpi-rebalance|hl-kpi-names|hl-kpi-lanes|deck-pz-counts|hl-kpi-turnover|hl-changes|hl-added|hl-exit-|hl-pz-changes) :: /;
function baseWithoutReplaced(): { testIds: string[]; text: string } {
  const gone = base.testIds.filter((x) => /^(deck-exit-radar|deck-today|hl-changes) :: /.test(x)).map((x) => x.replace(/^[^:]+ :: /, ""));
  let text = base.text.replace(/s+/g, "");
  for (const g of gone) { const k = g.replace(/s+/g, ""); if (!text.includes(k)) throw new Error("tệp nền thiếu khối: " + g.slice(0, 40)); text = text.replace(k, ""); }
  return { testIds: base.testIds.filter((x) => !REPLACED.test(x)), text };
}
afterEach(() => { cleanup(); try { window.localStorage.removeItem(LAYERS_KEY); } catch { /* */ } });

describe("Vân tay toàn Bảng quyết định Elite HL (dữ liệu thật 18/11)", () => {
  it("lớp mặc định (pulse + cockpit bật): bảng gốc = tệp nền trừ đúng ba khối được thay; không thiếu, không thừa phần tử nào khác", () => {
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    const got = JSON.parse(boardFingerprint()) as { testIds: string[]; text: string };
    const want = baseWithoutReplaced();
    expect(got.testIds).toEqual(want.testIds);
    expect(got.text.replace(/s+/g, "")).toBe(want.text);
    expect(screen.getByTestId("decision-pulse").getAttribute("data-hl-layer")).toBe("pulse");
  });
  it("tắt mọi lớp: bảng gốc giống từng ký tự tệp nền", async () => {
    window.localStorage.setItem(LAYERS_KEY, JSON.stringify(ALL_OFF));
    render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
    await expect(boardFingerprint()).toMatchFileSnapshot("./__fingerprints__/hl-board-2026-11-18.json");
  });
});
