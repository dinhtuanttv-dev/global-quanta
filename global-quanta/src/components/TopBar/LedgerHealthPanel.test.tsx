import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../test/rtl-lite";
import type { LedgerHealthDoc, LedgerHealthItem } from "./LedgerHealthPanel";

const strip = (states: LedgerHealthItem["strip"][number]["state"][]) => states.map((state, i) => ({ date: `2026-10-${String(10 + i).padStart(2, "0")}`, state }));
const item = (over: Partial<LedgerHealthItem>): LedgerHealthItem => ({
  id: "cycles", name: "Cycle Fingerprint", tab: "Phân tích ngành", what: "w", cadence: "session", status: "ok", sessions: 9, firstDate: "2026-10-23", lastDate: "2026-11-04",
  missing: [], strip: strip(["before", "written", "written"]), horizon: 21, firstScore: { date: "2026-11-23", estimated: true }, matured: 0,
  backup: { backedUpSessions: 9, lastRun: null }, job: { name: "buildCycleLibrary", at: "16:05", lastRunDate: "2026-11-04", ok: true, finishedAt: "2026-11-04T09:06:00Z", error: null }, ...over,
});
const doc: LedgerHealthDoc = {
  generatedAt: "2026-11-05T03:00:00Z", calendarThrough: "2026-11-04", backup: { at: "2026-11-04T10:10:00Z", keys: 20, sent: 2, failed: 0 },
  summary: { total: 3, ok: 1, gap: 1, late: 0, jobError: 0, empty: 0, readError: 1 },
  ledgers: [
    item({}),
    item({ id: "alpha", name: "Radar Top 20", status: "gap", missing: ["2026-10-26"], strip: strip(["written", "missing", "written"]) }),
    item({ id: "elliott", name: "Kịch bản Elliott", cadence: "signal", status: "read_error", error: "hỏng", horizon: null, backup: null, job: null }),
  ],
  cycleLibrary: { mode: "worker", source: "disk", loadMs: 820, fileMb: 61.4, loaded: true, restarts: 0, lastError: null, info: { dataAsOf: "2026-11-04", windows: 87727, tickers: 273 }, worker: null },
};
vi.mock("../../services/marketDataClient", () => ({ fetchMarketJson: vi.fn(async () => doc) }));
const { default: LedgerHealthPanel, describeLedgers } = await import("./LedgerHealthPanel");
const { chartLayout } = await import("../MainTabs/LocNganh/MainChart");
afterEach(cleanup);

describe("Trang sức khoẻ sổ theo dõi", () => {
  it("tóm tắt, thẻ từng sổ, dải phiên có nhãn, phiên thiếu, ngày chấm đầu tiên, sao lưu, thư viện Cycle", async () => {
    const onClose = vi.fn();
    await act(async () => { render(<LedgerHealthPanel onClose={onClose} now={Date.parse("2026-11-05T03:00:00Z")} />); });
    expect(screen.getByTestId("ledger-summary").textContent).toContain("Thiếu phiên");
    expect(screen.getByTestId("ledger-card-alpha").getAttribute("data-status")).toBe("gap");
    expect(screen.getByTestId("ledger-card-alpha").querySelector('[data-testid="ledger-missing"]')!.textContent).toBe("26/10");
    expect(screen.getByTestId("ledger-strip-alpha").getAttribute("aria-label")).toContain("thiếu 26/10");
    expect(screen.getByTestId("ledger-strip-alpha").querySelectorAll('[data-state="missing"]')).toHaveLength(1);
    expect(screen.getByTestId("ledger-card-cycles").querySelector('[data-testid="ledger-first-score"]')!.textContent).toContain("23/11 (ước tính)");
    expect(screen.getByTestId("ledger-card-cycles").querySelector('[data-testid="ledger-backup"]')!.textContent).toBe("9/9 phiên");
    expect(screen.getByTestId("ledger-card-elliott").textContent).toContain("hỏng");
    expect(screen.getByTestId("ledger-cycle-lib").textContent).toContain("Worker riêng");
    expect(screen.getByTestId("ledger-cycle-lib").textContent).toContain("file trên Volume");
    fireEvent.click(screen.getByTestId("ledger-only-issues"));
    expect(screen.queryByTestId("ledger-card-cycles")).toBeNull();
    expect(screen.getByTestId("ledger-card-alpha")).toBeTruthy();
    fireEvent.click(screen.getByTestId("ledger-health-close"));
    expect(onClose).toHaveBeenCalled();
  });
  it("phiên thiếu ở năm khác ghi kèm năm", async () => {
    const old = { ...doc, ledgers: [item({ id: "signals", status: "gap", missing: ["2025-11-18"] })] };
    const { fetchMarketJson } = await import("../../services/marketDataClient");
    (fetchMarketJson as unknown as { mockResolvedValueOnce: (v: unknown) => void }).mockResolvedValueOnce(old);
    await act(async () => { render(<LedgerHealthPanel onClose={() => {}} />); });
    expect(screen.getByTestId("ledger-card-signals").querySelector('[data-testid="ledger-missing"]')!.textContent).toBe("18/11/2025");
  });
  it("dòng tóm tắt cho huy hiệu", () => {
    expect(describeLedgers(doc)).toEqual({ ok: false, text: "Sổ theo dõi: 2/3 cần chú ý" });
    expect(describeLedgers({ ...doc, summary: { ...doc.summary, ok: 3, gap: 0, readError: 0 } }).ok).toBe(true);
  });
});

describe("Cỡ chữ biểu đồ Cycle", () => {
  it("chữ trên màn hình luôn khoảng 11,5 px dù biểu đồ rộng hay hẹp; điện thoại dùng khung cao hơn", () => {
    for (const w of [320, 390, 720, 1400]) {
      const L = chartLayout(w);
      expect(L.font * (w / 720)).toBeGreaterThanOrEqual(11);
      expect(L.padL).toBeGreaterThanOrEqual(52);
    }
    expect(chartLayout(390).H).toBeGreaterThan(chartLayout(1000).H);
  });
});
