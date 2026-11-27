// EC-1 (27/11/2026): dải chip Danh mục Elite HL trong Cycle Fingerprint — thứ tự hạng HL, hàng chờ ẩn mặc định, cờ độ tin thấp,
// bấm chip chọn mã, tự chọn mã hạng 1 khi chưa có mã; nút "Chu kỳ →" của bảng Elite HL mở tab Ngành đúng mã.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import type { EliteDecision } from "../../../lib/elite10/decisionTypes";
import type { CycleSummaryRow } from "../../../types/cycleFingerprintV2";

const hl = (rank: number, lane: string | null, status = "HOLD") => ({ rank, status, pz: lane ? { state: "IN_BASE", lane } : undefined });
const decision = {
  date: "2026-11-26",
  portfolio: [
    { ticker: "VJC", hl: hl(3, "RUNNER") },
    { ticker: "NT2", hl: hl(1, "CORE") },
    { ticker: "IDC", hl: hl(2, null, "NEW") },
    { ticker: "DCL" }, // không có hl -> không thuộc danh mục HL
  ],
  hl: { queue: [{ ticker: "HDA", hlRank: 13 }, { ticker: "NT2", hlRank: 1 }] },
} as unknown as EliteDecision;
const row = (symbol: string, median: number, mismatched: number): CycleSummaryRow => ({ symbol, asOf: "2026-11-26", n: 30, median, p10: median - 8, p90: median + 9, shareUp: 0.6, move: null, mismatched, neighbors: 30, nEff: 20 });

let current: EliteDecision | undefined = decision;
const summaryCalls: string[][] = [];
vi.mock("../../../hooks/elite10/useEliteCenter", () => ({ useEliteDecision: () => ({ data: current, error: null, isLoading: false }) }));
vi.mock("../../../hooks/useCycleSummary", () => ({
  useCycleSummary: (symbols: string[]) => { summaryCalls.push(symbols); return { data: { horizon: 20, rows: [row("NT2", 1.76, 5), row("VJC", -2.48, 21), row("HDA", 0.5, 0)] }, isLoading: false }; },
}));
vi.mock("../../../hooks/useCycleFingerprintV2", () => ({ useCycleFingerprintV2: () => ({ data: null, isLoading: false, error: null, refresh: () => {} }) }));
vi.mock("../../../hooks/useSectorRotation", () => ({ useSectorRrg: () => ({ data: null }) }));

import EliteCycleStrip, { cycleStripItems, fmtSigned, lowConfidence } from "./EliteCycleStrip";
import { CycleFingerprintTab } from "./CfTab";
import { useAppStore } from "../../../store/useAppStore";

beforeEach(() => { current = decision; summaryCalls.length = 0; useAppStore.setState({ selectedTicker: null as unknown as string }); });
afterEach(cleanup);

describe("EliteCycleStrip", () => {
  it("thứ tự theo hạng HL; hàng chờ bỏ mã đã giữ", () => {
    expect(cycleStripItems(decision, false).map((i) => i.ticker)).toEqual(["NT2", "IDC", "VJC"]);
    expect(cycleStripItems(decision, true).map((i) => `${i.ticker}${i.queue ? "*" : ""}`)).toEqual(["NT2", "IDC", "VJC", "HDA*"]);
    expect(cycleStripItems(undefined, true)).toEqual([]);
  });

  it("chip hiện hạng, nhánh, trung vị; cờ độ tin thấp khi > nửa giai đoạn lệch; hàng chờ ẩn tới khi bật", () => {
    render(<EliteCycleStrip />);
    expect(screen.getByTestId("cf-es-NT2").textContent).toMatch(/1NT2Lõi\+1,8%/);
    expect(screen.getByTestId("cf-es-IDC").textContent).toMatch(/Vào mới/);
    expect(screen.getByTestId("cf-es-low-VJC")).toBeTruthy();
    expect(screen.queryByTestId("cf-es-low-NT2")).toBeNull();
    expect(screen.queryByTestId("cf-es-HDA")).toBeNull();
    expect(summaryCalls[summaryCalls.length - 1]).toEqual(["NT2", "IDC", "VJC"]);
    fireEvent.click(screen.getByTestId("cf-es-queue"));
    expect(screen.getByTestId("cf-es-HDA").textContent).toMatch(/chờHDA/);
    expect(summaryCalls[summaryCalls.length - 1]).toEqual(["NT2", "IDC", "VJC", "HDA"]);
  });

  it("bấm chip chọn mã (đánh dấu đang chọn)", () => {
    render(<EliteCycleStrip />);
    fireEvent.click(screen.getByTestId("cf-es-VJC"));
    expect(useAppStore.getState().selectedTicker).toBe("VJC");
    expect(screen.getByTestId("cf-es-VJC").getAttribute("aria-pressed")).toBe("true");
  });

  it("không có quyết định -> không hiện dải", () => {
    current = undefined;
    render(<EliteCycleStrip />);
    expect(screen.queryByTestId("cf-elite-strip")).toBeNull();
  });

  it("helpers", () => {
    expect(fmtSigned(-2.48)).toBe("−2,5%");
    expect(fmtSigned(null)).toBe("—");
    expect(lowConfidence(row("X", 0, 16))).toBe(true);
    expect(lowConfidence(row("X", 0, 15))).toBe(false);
    expect(lowConfidence(undefined)).toBe(false);
  });
});

describe("Cycle Fingerprint + Elite HL", () => {
  it("chưa chọn mã -> tự chọn mã hạng 1 của danh mục", () => {
    render(<CycleFingerprintTab />);
    expect(useAppStore.getState().selectedTicker).toBe("NT2");
    expect(screen.getByTestId("cf-elite-strip")).toBeTruthy();
  });

  it("đã có mã -> giữ nguyên mã đang chọn", () => {
    useAppStore.setState({ selectedTicker: "VIC" });
    render(<CycleFingerprintTab />);
    expect(useAppStore.getState().selectedTicker).toBe("VIC");
  });

  it("focusCycle chọn mã và tăng nonce", () => {
    useAppStore.getState().focusCycle("IDC");
    const a = useAppStore.getState().cycleFocus!;
    useAppStore.getState().focusCycle("IDC");
    expect(useAppStore.getState().selectedTicker).toBe("IDC");
    expect(useAppStore.getState().cycleFocus!.nonce).toBe(a.nonce + 1);
  });
});
