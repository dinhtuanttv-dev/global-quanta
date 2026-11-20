// NHỊP QUYẾT ĐỊNH — KP1 ĐỐI CHIẾU ĐẦU RA TRƯỚC / SAU (docs/elite-hl-pulse 03): với cùng tài liệu quyết định, MỌI giá trị hai khối cũ
// ("Hôm nay" + "Thay đổi hôm nay", lớp pulse tắt) đang hiện đều có mặt trong panel mới (lớp pulse bật). Ba đầu vào: 18/11 thật, 20/11 thật,
// 20/11 có mã vào / ra / đổi vùng. Kèm KP10 (ngôn ngữ) và rút gọn danh sách mã dài.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import deck from "../../../lib/elite10/__fixtures__/deck-2026-11-18.json";
import px from "../../../lib/elite10/__fixtures__/pulse-2026-11-20.json";
import type { EliteDecision } from "../../../lib/elite10/decisionTypes";
import type { PulseHistSession } from "../../../lib/elite10/decisionPulse";

vi.mock("../../../hooks/useSmartNews", () => ({ useSmartNews: () => ({ data: undefined, error: null, isLoading: false, enabled: true }) }));
vi.mock("../../../hooks/useRadarSignals", () => ({ useRadarSignals: () => ({ data: null, error: null, isLoading: false, enabled: true }) }));
vi.mock("../../../store/useAppStore", () => ({ useAppStore: (sel: (s: unknown) => unknown) => sel({ livePrices: {} }) }));
vi.mock("../../../hooks/elite10/useDeckData", () => ({ useDeckRisk: () => ({ data: deck.risk }), useDeckPanel: () => ({ data: deck.panel }), useEvidenceRegistry: () => ({ data: null }) }));
vi.mock("../../../hooks/useWorldStrategy", () => ({ useWorldStrategy: () => ({ data: { short: { rows: [] }, regime: deck.world.regime } }) }));
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
import DecisionPulse from "./DecisionPulse";

const LAYERS_KEY = "gq.hl.layers.v1";
const d18 = deck.decision as unknown as EliteDecision;
const d20 = px.decision as unknown as EliteDecision;
const hist = px.history.sessions as unknown as PulseHistSession[];
const moved = (): EliteDecision => {
  const d = JSON.parse(JSON.stringify(d20)) as EliteDecision;
  d.hl!.changes.added = ["VPI"];
  d.hl!.changes.exits = [{ ticker: "HSG", weight: 0.1, since: "2026-11-12", code: "ls", reasonVi: "LS-v1 dưới 60", hlRank: null, lsPct: null, taCount: null, rrg: null }];
  d.hl!.changes.kept = 6; d.hl!.changes.toWatch = ["VJC"]; d.hl!.changes.backToZone = ["MSH"];
  return d;
};
const txt = (id: string) => (screen.queryByTestId(id)?.textContent ?? "").replace(/\s+/g, " ");
/** Giá trị trong chữ: mã CK, số (kể cả % và dấu phẩy), ngày dd/mm/yyyy. */
const values = (s: string) => [...new Set(s.match(/\d{2}\/\d{2}\/\d{4}|\d+(?:,\d+)?%?|\b[A-Z][A-Z0-9]{2}\b/g) ?? [])];
afterEach(() => { cleanup(); window.localStorage.removeItem(LAYERS_KEY); });

describe("KP1 — đối chiếu đầu ra trước (hai khối cũ) / sau (panel)", () => {
  for (const [name, d] of [["18/11 thật", d18], ["20/11 thật", d20], ["20/11 có vào / ra / đổi vùng", moved()]] as [string, EliteDecision][]) {
    it(`${name}: mọi giá trị của "Hôm nay" + "Thay đổi hôm nay" có trong panel; hai khối cũ không còn khi lớp bật`, () => {
      window.localStorage.setItem(LAYERS_KEY, JSON.stringify({ pulse: false }));
      render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
      const before = `${txt("deck-today")} ${txt("hl-changes")}`;
      expect(before.length).toBeGreaterThan(50);
      expect(values(before).length).toBeGreaterThanOrEqual(12); // phép đối chiếu có thực chất (≥ 12 giá trị)
      if (d.hl!.changes.exits.length) expect(values(before)).toEqual(expect.arrayContaining(["HSG", "VPI", "VJC", "MSH", "10,0%", "12/11/2026"]));
      expect(screen.queryByTestId("decision-pulse")).toBeNull();
      cleanup(); window.localStorage.removeItem(LAYERS_KEY);
      render(<EliteHlBoard d={d} onOpenTicker={() => {}} />);
      const after = txt("decision-pulse");
      const missing = values(before).filter((v) => !after.includes(v));
      expect(missing).toEqual([]);
      expect(screen.queryByTestId("deck-today")).toBeNull();
      expect(screen.queryByTestId("hl-changes")).toBeNull();
    });
  }
});

describe("Panel Nhịp quyết định — dữ liệu 20/11", () => {
  it("đủ 8 trạng thái PZ + độ bao phủ 37/37; hai mốc đối chiếu ghi rõ; pha loãng tách đã / chưa giao dịch; không chữ khuyến nghị", () => {
    render(<DecisionPulse d={d20} history={hist} onOpenTicker={() => {}} />);
    expect(txt("pulse-baseline")).toBe("so với phiên 19/11/2026");
    expect(document.querySelectorAll("[data-testid^='pulse-pz-'][data-testid$='_ZONE'], [data-testid^='pulse-pz-']").length).toBeGreaterThanOrEqual(8);
    expect(txt("pulse-pz-NO_SETUP")).toMatch(/8/); expect(txt("pulse-pz-FAILED")).toMatch(/1/);
    expect(txt("pulse-pz-coverage")).toMatch(/tổng 37\/37 mã theo dõi · 37 đã định giá · 35 có nền/);
    expect(txt("pulse-pz-moves")).toMatch(/so với ảnh chụp vị trí giá trước/);
    expect(txt("pulse-delta-queue")).toMatch(/phiên 19\/11\/2026: 3 mã/);
    expect(txt("pulse-cur-dilution")).toMatch(/15 mã toàn thị trường: 13 chưa giao dịch.*2 đã giao dịch CP mới \(HDB, PVS\)/);
    expect(txt("pulse-delta-dilution")).toMatch(/VPI/);
    const all = txt("decision-pulse");
    for (const bad of [/mua ngay/i, /bán ngay/i, /chắc thắng/i]) expect(all).not.toMatch(bad);
  });
  it("đóng băng: không bao giờ hiện ỔN ĐỊNH ở hàng danh mục; chip tổng = ĐÓNG BĂNG", () => {
    const d = JSON.parse(JSON.stringify(d20)) as EliteDecision; d.hl!.dataGuard = { frozen: true, reasonsVi: ["Thiếu RRG ngành"] };
    render(<DecisionPulse d={d} history={hist} onOpenTicker={() => {}} />);
    expect(screen.getByTestId("pulse-row-portfolio").textContent).toMatch(/ĐÓNG BĂNG/);
    expect(screen.getByTestId("pulse-row-portfolio").textContent).not.toMatch(/ỔN ĐỊNH/);
  });
  it("danh sách mã dài (> 6) rút gọn, có 'Xem tất cả (N)'; bấm mã mở Hồ sơ", () => {
    const open = vi.fn();
    render(<DecisionPulse d={d20} history={hist} onOpenTicker={open} />);
    const btn = screen.getByTestId("pulse-more-queue-in");
    expect(btn.textContent).toMatch(/Xem tất cả \(\d+\)/);
    fireEvent.click(btn); expect(btn.textContent).toBe("Thu gọn");
    fireEvent.click([...screen.getByTestId("pulse-queue-in").querySelectorAll("button")][0]);
    expect(open).toHaveBeenCalled();
  });
});
