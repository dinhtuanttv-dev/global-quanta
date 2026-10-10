// Lọc ngành (L4) — panel Xoay vòng ngành + 4 cột thời điểm ngành trong Top 20; dữ liệu thật (Gateway sector-rrg/L1,
// Project A locnganh-timing/L2) lưu làm fixture.
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../../test/rtl-lite";
import fixture from "../__fixtures__/sector-rotation.json";
import type { GatewaySectorRrgDoc, SectorCycleDetail, SectorTimingSignalV2 } from "../../../../lib/locnganh/types";

const rrg = fixture.rrg as unknown as GatewaySectorRrgDoc;
const signals = fixture.timing.signals as unknown as SectorTimingSignalV2[];
const cycle = fixture.cycle8300 as unknown as SectorCycleDetail;
vi.mock("../../../../hooks/useSectorRotation", () => ({
  useSectorRrg: () => ({ data: rrg, error: undefined, isLoading: false }),
  useSectorTaxonomy: () => ({ VCB: { l2: "8300" }, HPG: { l2: "1700" } }),
  useSectorCycle: (code: string | null) => ({ data: code === "8300" ? cycle : undefined, error: undefined, isLoading: false }),
  useSectorTracking: () => ({ data: fixture.tracking, error: undefined }),
}));
vi.mock("../../../../hooks/useSectorTimingSignals", () => ({
  useSectorTimingSignals: () => ({ bySector: new Map(signals.map((s) => [s.sectorKey, s])), data: fixture.timing, status: "ready", error: null, isValidating: false, isStale: false, refresh: async () => {} }),
}));
const { default: SectorRotationPanel } = await import("./SectorRotationPanel");
const { default: LocNganhPanel } = await import("../LocNganhPanel");

afterEach(cleanup);

describe("Xoay vòng ngành ICB (L4–L5)", () => {
  it("L5: bản đồ dòng tiền (dịch chuyển 4 tuần, thay đổi thị phần, tích lũy/phân phối âm thầm), cột Trạng thái & Dòng tiền, bằng chứng L3", () => {
    render(<SectorRotationPanel />);
    const l2 = rrg.sectors.filter((s) => s.level === 2);
    expect(screen.getByTestId("sector-flow-map")).toBeTruthy();
    expect(screen.getByTestId("sector-transfers").querySelectorAll("li").length).toBe(Math.min(6, rrg.rotation!["2"].transfers.length));
    expect(screen.getAllByTestId("sector-state")).toHaveLength(l2.filter((s) => s.state).length);
    expect(screen.getAllByTestId("sector-flow-cell")).toHaveLength(l2.length);
    expect(screen.getByTestId("sector-evidence").textContent).toContain("KHÔNG ĐẠT");
  });

  it("L5: bảng phụ có dòng tiền & sức khỏe ngành, cổ phiếu dẫn dắt (★), sổ theo dõi; nút lọc Top 20 gọi đúng mã ngành", () => {
    const filtered: string[] = [];
    render(<SectorRotationPanel onFilterSector={(c) => filtered.push(c)} />);
    fireEvent.click(screen.getAllByTestId("sector-row").find((r) => r.textContent?.includes("Ngân hàng"))!);
    expect(screen.getByTestId("sector-flow-card").textContent).toContain("CMF-20");
    expect(screen.getByTestId("sector-share-spark")).toBeTruthy();
    const bank = rrg.sectors.find((s) => s.code === "8300")!;
    expect(screen.getAllByTestId("sector-leader-row")).toHaveLength(bank.flow!.leaders.length);
    expect(screen.getByTestId("sector-tracking").textContent).toBeTruthy();
    fireEvent.click(screen.getByTestId("sector-filter-top20"));
    expect(filtered).toEqual(["8300"]);
  });

  it("đồng hồ RRG + bảng đủ ngành cấp 2; mỗi dòng có 4 cột thời điểm và quyết định; EXPERIMENTAL", () => {
    render(<SectorRotationPanel />);
    const l2 = rrg.sectors.filter((s) => s.level === 2);
    expect(screen.getAllByTestId("sector-row")).toHaveLength(l2.length);
    for (const s of l2) expect(screen.getByTestId(`rrg-sector-${s.code}`)).toBeTruthy();
    expect(screen.getAllByTestId("sector-window-cell")).toHaveLength(l2.length);
    expect(screen.getAllByTestId("sector-prob-cell")).toHaveLength(l2.length);
    expect(screen.getAllByTestId("sector-decision")).toHaveLength(l2.length);
    expect(screen.getByTestId("sector-rotation-panel").textContent).toContain("EXPERIMENTAL");
    fireEvent.click(screen.getByTestId("sector-level-3"));
    expect(screen.getAllByTestId("sector-row")).toHaveLength(rrg.sectors.filter((s) => s.level === 3).length);
  });

  it("bấm ngành -> bảng phụ: thanh quyết định, CycleTimeline quanh lần vào Cải thiện, rổ chỉ số; bấm lại -> đóng", () => {
    render(<SectorRotationPanel />);
    const bank = screen.getAllByTestId("sector-row").find((r) => r.textContent?.includes("Ngân hàng"))!;
    fireEvent.click(bank);
    const deep = screen.getByTestId("sector-deep-panel");
    expect(screen.getByTestId("decision-bar").getAttribute("data-level")).toBe(cycle.decision.level);
    expect(screen.getByTestId("sector-cycle-timeline").querySelector("svg")).toBeTruthy();
    expect(screen.getByTestId("sector-constituents").textContent).toContain("VCB");
    expect(deep.textContent).toContain("KHÔNG ĐẠT");
    fireEvent.click(bank);
    expect(screen.queryByTestId("sector-deep-panel")).toBeNull();
  });

  it("chấm ngành trên đồng hồ cũng mở bảng phụ", () => {
    render(<SectorRotationPanel />);
    fireEvent.click(screen.getByTestId("rrg-sector-8300"));
    expect(screen.getByTestId("sector-deep-panel")).toBeTruthy();
  });

  it("Top 20 có 4 cột thời điểm theo NGÀNH ICB của từng mã (không có tín hiệu thì để trống)", () => {
    const bank = signals.find((s) => s.sectorKey === "8300")!;
    const stock = (ticker: string) => ({ ticker, sectorKey: "x", sectorQuadrant: "Leading", rs3m: null, volumeSpikeRatio: null, pvtScore: null, adScore: null, rrgScore: 50, rsScore: 50, volumeScore: 50, pvtScoreNormalized: 50, adScoreNormalized: 50, weightsUsed: { rrg: 0.2, rs: 0.2, volume: 0.2, pvt: 0.2, ad: 0.2 }, confluenceScore: 60 });
    act(() => {});
    render(<LocNganhPanel top20={[stock("VCB"), stock("ZZZ")]} totalAnalyzed={2} riskOnScore={50} selectedSector={null} onClearSector={() => {}} onSelectTicker={() => {}}
      timingOf={(t) => (t === "VCB" ? bank : null)} />);
    expect(screen.getAllByTestId("sector-window-cell")).toHaveLength(1);
    expect(screen.getByText("Cửa sổ ngành")).toBeTruthy();
  });
});
