// MTF v3 · S6 — bảng mới: 5 tab, ma trận ba khung, phát lại, kiểm định H1–H6 + sổ M1, không có chữ MUA / BÁN.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../../test/rtl-lite";
import Mtf3Panel from "./Mtf3Panel";
import { buildStructure3 } from "../../../../lib/quant-core/mtf3/doc";
import type { Structure3Doc } from "../../../../hooks/useStructure3";

function walk(n: number): { date: string; open: number; high: number; low: number; close: number; volume: number }[] {
  let s = 7, p = 30000;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const out: { date: string; open: number; high: number; low: number; close: number; volume: number }[] = [];
  for (let k = 0; out.length < n; k++) {
    const dt = new Date(Date.UTC(2021, 0, 4) + k * 86400000);
    if (dt.getUTCDay() % 6 === 0) continue;
    const o = p, c = p * (1 + 0.0006 + 0.017 * (rnd() + rnd() + rnd() - 1.5));
    out.push({ date: dt.toISOString().slice(0, 10), open: o, high: Math.max(o, c) * 1.005, low: Math.min(o, c) * 0.995, close: c, volume: 1e6 });
    p = c;
  }
  return out;
}
const doc = { ...buildStructure3(walk(1100), { elliott: false }), symbol: "TST", priceBasis: null, evidence: { label: "", note: "" } } as unknown as Structure3Doc;

describe("Mtf3Panel", () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* bỏ qua */ } });
  afterEach(() => cleanup());
  it("tab Tổng quan: thẻ quyết định + ma trận Ngày/Tuần/Tháng; các tab khác; không có chữ MUA / BÁN", () => {
    render(<Mtf3Panel doc={doc} mode="trade" onModeChange={() => {}} />);
    expect(screen.getByTestId("mtf3-title").textContent).toContain("MTF v3");
    expect(screen.getByTestId("decision3")).toBeTruthy();
    expect(screen.getByTestId("mtf3-matrix").textContent).toContain("Tháng");
    fireEvent.click(screen.getByTestId("mtf3-tab-trend"));
    expect(screen.getByTestId("ribbon-strip")).toBeTruthy();
    expect(screen.getByTestId("structure-frames")).toBeTruthy();
    fireEvent.click(screen.getByTestId("mtf3-tab-bases"));
    expect(screen.getByTestId("base-panel")).toBeTruthy();
    fireEvent.click(screen.getByTestId("mtf3-tab-elliott"));
    expect(screen.getByTestId("structure-panel").textContent).toContain("Elliott");
    fireEvent.click(screen.getByTestId("mtf3-tab-evidence"));
    expect(screen.getByTestId("mtf3-evidence").textContent).toContain("H6");
    expect(screen.getByTestId("mtf3-evidence").textContent).toContain("Sổ “đà tăng tiếp diễn”");
    expect(screen.getByTestId("structure-panel").textContent).not.toMatch(/\bMUA\b|\bBÁN\b/);
  });

  it("phát lại: ghi chú phát lại, không tính Elliott; tab được nhớ", () => {
    render(<Mtf3Panel doc={{ ...doc, elliott: null }} mode="overview" onModeChange={() => {}} replay={{ index: 500, min: 129, max: 1099, date: "2023-01-02", available: true, onChange: () => {} }} />);
    expect(screen.getByTestId("structure-replay-note")).toBeTruthy();
    fireEvent.click(screen.getByTestId("mtf3-tab-elliott"));
    expect(screen.getByTestId("structure-panel").textContent).toContain("không tính trong chế độ phát lại");
    cleanup();
    render(<Mtf3Panel doc={doc} mode="overview" onModeChange={() => {}} />);
    expect(screen.getByTestId("mtf3-tab-elliott").getAttribute("aria-selected")).toBe("true");
  });
});
