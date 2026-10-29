// 🔎 Bộ lọc Elite: bộ chọn sẵn, chip 3 trạng thái (yêu cầu -> loại trừ -> tắt), chỉ mã đủ điều kiện, mở hồ sơ, lưu theo tài khoản,
// danh mục "bộ lọc của tôi" tách khỏi danh mục chính thức.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";

const row = (ticker: string, values: Record<string, number | null>) => ({ ticker, icb: { l2: "8700" }, sector: null, values });
const score = (ticker: string, rank: number, Z: number, eligible = true) => ({ ticker, rank, Z, alpha5Pct: 0.1, pOutperform: 0.51, eligible, reason: eligible ? null : "adv", close: 20000, advBn: 30, sigma20: 0.02, sectorKey: "8700", contributions: [] });
const decision = {
  date: "2026-10-30", portfolio: [{ ticker: "A", weight: 0.5, Z: 2, rank: 1 }],
  scores: [score("A", 1, 2), score("B", 2, 1.5), score("C", 3, 1), score("D", 4, 0.5, false)],
  ledgerSummary: { horizons: { 5: { n: 0, meanExcess: null } } },
};
const panel = { date: "2026-10-30", rows: [row("A", { stealth20: 2, stealth5: 0 }), row("B", { stealth20: 0, stealth5: 2 }), row("C", { stealth20: -2, stealth5: 2 }), row("D", { stealth20: 3, stealth5: null })] };
const ev = { signals: [{ id: "stealth20", tab: "Siêu quét AI", labelVi: "Stealth 20", tier: "A" }, { id: "stealth5", tab: "Siêu quét AI", labelVi: "Stealth 5", tier: "A" }] };

vi.mock("../../../hooks/elite10/useEliteCenter", () => ({
  useEliteDecision: () => ({ data: decision }),
  useEliteEvidence: () => ({ data: ev }),
  useElitePanel: () => ({ data: panel }),
}));
vi.mock("../../../hooks/useGatewayBuyTimeline", () => ({ useGatewayBuyTimeline: () => ({ data: null }) }));
vi.mock("../../../lib/priceAlerts", () => ({ browserNotify: vi.fn() }));
const save = vi.fn(async () => ({}));
const my = { saved: null as unknown, savedError: null, portfolio: null as unknown, portfolioLoading: false, portfolioError: null, save };
vi.mock("../../../hooks/elite10/useMyFilter", () => ({ useMyFilter: () => my }));

import EliteScreener from "./EliteScreener";

const passed = () => screen.queryAllByTestId("scr-row-A").concat(screen.queryAllByTestId("scr-row-B"), screen.queryAllByTestId("scr-row-C"), screen.queryAllByTestId("scr-row-D")).map((el) => el.getAttribute("data-testid")!.slice(8));

describe("Bộ lọc Elite", () => {
  beforeEach(() => { localStorage.clear(); save.mockClear(); my.saved = null; my.portfolio = null; });
  afterEach(() => cleanup());

  it("bộ chọn 'Dòng tiền ẩn': ≥ 1 Stealth tích luỹ, loại phân phối, chỉ mã đủ điều kiện; chip 3 trạng thái", () => {
    const onOpen = vi.fn();
    render(<EliteScreener onOpenTicker={onOpen} refTicker={null} />);
    fireEvent.click(screen.getByTestId("preset-stealth"));
    expect(passed()).toEqual(["A", "B"]);
    expect(screen.getByTestId("screener-count").textContent).toBe("2 mã");
    expect(screen.getByTestId("screener-funnel").textContent).toContain("1 đang trong Elite 10");
    // st5: yêu cầu -> loại trừ: còn A (Stealth 20 ≥ 1,5 và Stealth 5 không ≥ 1,5)
    fireEvent.click(screen.getByTestId("chip-st5"));
    expect(screen.getByTestId("chip-st5").getAttribute("data-state")).toBe("not");
    expect(passed()).toEqual(["A"]);
    fireEvent.click(screen.getByTestId("chip-st5"));
    expect(screen.getByTestId("chip-st5").getAttribute("data-state")).toBe("off");
    // bỏ "chỉ mã đủ điều kiện" -> D (Stealth 20 = 3) vào
    fireEvent.click(screen.getByTestId("toggle-eligible"));
    expect(passed()).toContain("D");
    fireEvent.click(screen.getByTestId("scr-open-A"));
    expect(onOpen).toHaveBeenCalledWith("A");
  });

  it("lưu vào tài khoản gửi đúng bộ lọc; danh mục riêng hiện độ trùng với danh mục chính thức", async () => {
    render(<EliteScreener onOpenTicker={() => {}} refTicker={null} />);
    expect(screen.getByTestId("my-elite-empty")).toBeTruthy();
    fireEvent.click(screen.getByTestId("preset-stealth"));
    fireEvent.click(screen.getByTestId("screener-save"));
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(1);
    expect((save.mock.calls[0] as unknown[])[0]).toMatchObject({ name: "Dòng tiền ẩn", mode: "k", k: 1, eligibleOnly: true });
    cleanup();
    my.saved = { filter: { v: 1, name: "Dòng tiền ẩn", conds: [], mode: "all" }, hash: "h" };
    my.portfolio = { date: "2026-10-30", pass: ["A", "B"], portfolio: [{ ticker: "A", weight: 0.6, Z: 2, rank: 1 }, { ticker: "B", weight: 0.4, Z: 1.5, rank: 2 }], filter: { name: "Dòng tiền ẩn" }, savedAt: "2026-10-30T01:00:00Z", ledger: { startedAt: null, entries: [], summary: null } };
    render(<EliteScreener onOpenTicker={() => {}} refTicker={null} />);
    expect(screen.getByTestId("my-elite").textContent).toContain("trùng danh mục chính thức 1/2");
    expect(screen.getByTestId("my-elite-ledger").textContent).toContain("bắt đầu từ phiên dựng kế tiếp");
  });
});
