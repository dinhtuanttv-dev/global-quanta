// Radar Top 20 (T0) — nhãn bằng chứng, nguồn dữ liệu, thẻ chi tiết phân rã điểm khi bấm mã.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import LocNganhPanel from "./LocNganhPanel";
import type { ConfluenceStock } from "../../../hooks/useTop20Radar";

const stock = (ticker: string, over: Partial<ConfluenceStock> = {}): ConfluenceStock => ({
  ticker, sectorKey: "8300", sectorQuadrant: "Leading", icbCode: "8300", icbName: "Ngân hàng", rs3m: 9.1, volumeSpikeRatio: 1.23, pvtScore: 96, adScore: 81,
  rrgScore: 100, rsScore: 73, volumeScore: 29, pvtScoreNormalized: 98, adScoreNormalized: 91,
  weightsUsed: { rrg: 0.216, rs: 0.266, volume: 0.167, pvt: 0.175, ad: 0.175 }, confluenceScore: 77, ...over,
});
const src = { provider: "GATEWAY_TOP20_INPUTS", priceBasis: "ADJUSTED_CUMULATIVE", dataAsOf: "2026-10-09", universe: 276, liquid: 170 };
const ev = { label: "EXPERIMENTAL", reason: "Điểm hội tụ chưa qua kiểm định đặt trước." };
afterEach(cleanup);

describe("Radar Top 20 (T0)", () => {
  it("hiện nhãn EXPERIMENTAL và nguồn Gateway (giá điều chỉnh, số mã đủ thanh khoản)", () => {
    render(<LocNganhPanel top20={[stock("NT2")]} totalAnalyzed={170} riskOnScore={67} selectedSector={null} onClearSector={() => {}} onSelectTicker={() => {}} dataSource={src} evidence={ev} />);
    expect(screen.getByTestId("top20-evidence").textContent).toContain("EXPERIMENTAL");
    expect(screen.getByTestId("top20-source").textContent).toContain("170/276");
    expect(screen.getByTestId("top20-source").textContent).toContain("09/10/2026");
  });

  it("bấm mã -> thẻ chi tiết 5 thành phần (giá trị, điểm, trọng số, đóng góp) + vẫn chọn mã; bấm lại -> đóng", () => {
    const picked: string[] = [];
    render(<LocNganhPanel top20={[stock("NT2"), stock("VCB", { rs3m: -0.7 })]} totalAnalyzed={170} riskOnScore={67} selectedSector={null} onClearSector={() => {}} onSelectTicker={(t) => picked.push(t)} dataSource={src} evidence={ev} />);
    const row = screen.getAllByTestId("top20-row")[0];
    fireEvent.click(row);
    const d = screen.getByTestId("top20-detail");
    expect(d.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(d.textContent).toContain("+9,1 điểm %");
    expect(d.textContent).toContain("1,23×");
    expect(picked).toEqual(["NT2"]);
    fireEvent.click(row);
    expect(screen.queryByTestId("top20-detail")).toBeNull();
  });

  it("nguồn dự phòng Yahoo được cảnh báo rõ", () => {
    render(<LocNganhPanel top20={[]} totalAnalyzed={0} riskOnScore={50} selectedSector={null} onClearSector={() => {}} onSelectTicker={() => {}} dataSource={{ ...src, provider: "YAHOO_LEGACY", fallbackReason: "HTTP 503" }} />);
    expect(screen.getByTestId("top20-source").textContent).toContain("kém tin cậy");
  });
});
