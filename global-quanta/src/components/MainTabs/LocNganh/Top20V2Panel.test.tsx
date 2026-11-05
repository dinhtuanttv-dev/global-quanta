// Top 20 v2 (T4) — dữ liệu thật Gateway /api/market/alpha/top20 (2026-10-15) lưu làm fixture.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import fixture from "./__fixtures__/alpha-top20.json";
import Top20V2Panel, { fmtRaw, type Top20Context } from "./Top20V2Panel";
import type { AlphaTop20Response } from "../../../types/alphaTop20";

const data = fixture as unknown as AlphaTop20Response;
afterEach(cleanup);
const show = (sector: { code: string; name: string } | null = null, picked: string[] = []) =>
  render(<Top20V2Panel data={data} selectedSector={sector} onClearSector={() => {}} onSelectTicker={(t) => picked.push(t)} />);

describe("Radar Top 20 v2 (T4)", () => {
  it("nhãn T3: EXPERIMENTAL, 6 điều kiện (2 đạt), số liệu ngoài mẫu; nguồn dữ liệu", () => {
    show();
    const ev = screen.getByTestId("alpha-evidence").textContent ?? "";
    expect(ev).toContain("EXPERIMENTAL");
    expect(ev).toContain("KHÔNG ĐẠT (2/6)");
    expect(screen.getByTestId("alpha-checks").querySelectorAll('li[data-pass="true"]')).toHaveLength(2);
    expect(screen.getByTestId("alpha-source").textContent).toContain("VNDirect");
  });

  it("20 mã, tối đa 4 mã / ngành; bấm mã -> thẻ 18 yếu tố theo 4 nhóm (không mở biểu đồ) và vẫn chọn mã", () => {
    const picked: string[] = [];
    show(null, picked);
    const rows = screen.getAllByTestId("alpha-row");
    expect(rows).toHaveLength(20);
    const per = new Map<string, number>(); for (const s of data.top20) per.set(s.sector ?? "", (per.get(s.sector ?? "") ?? 0) + 1);
    expect(Math.max(...per.values())).toBeLessThanOrEqual(4);
    fireEvent.click(rows[0]);
    expect(screen.getAllByTestId("alpha-factor-row")).toHaveLength(18);
    expect(picked).toEqual([data.top20[0].ticker]);
    fireEvent.click(rows[0]);
    expect(screen.queryByTestId("alpha-detail")).toBeNull();
  });

  it("trọng số 18 yếu tố hiện khi bấm; sổ theo dõi chưa có kết quả -> ghi rõ đang chờ 21 phiên", () => {
    show();
    fireEvent.click(screen.getByTestId("alpha-weights-toggle"));
    expect(screen.getByTestId("alpha-weights").children).toHaveLength(18);
    expect(screen.getByTestId("alpha-ledger-empty").textContent).toContain("21 phiên");
  });

  it("lọc theo ngành: chỉ mã của ngành, kèm mã khác của ngành ngoài Top 20", () => {
    const code = data.top20[0].sector!;
    show({ code, name: "X" });
    const rows = screen.getAllByTestId("alpha-row");
    expect(rows.length).toBe(data.top20.filter((s) => s.sector === code).length);
  });

  it("bối cảnh từng mã: vùng RRG, cấu trúc kỳ hạn, thời điểm ngành, trung vị Cycle, thanh khoản; thẻ có ba khối và hai liên kết", () => {
    const s0 = data.top20[0], code = s0.sector!;
    const ctx = {
      rrgOf: new Map([[code, { code, quadrant: "LEADING", latestClosed: { ratio: 100.5, momentum: 101.2 } }]]),
      ladderOf: new Map([[code, { code, structure: { key: "UP_ALIGNED", label: "Đồng thuận tăng" }, rungs: [{ h: 20, rs: 2.1 }, { h: 65, rs: 5.4 }] }]]),
      timingOf: new Map([[code, { decision: { level: "WATCH", headline: "Chờ xác nhận" } }]]),
      cycleOf: new Map([[s0.ticker, { symbol: s0.ticker, median: 1.234, p10: -5, p90: 8, shareUp: 0.57, n: 30, mismatched: 4, neighbors: 30 }]]),
    } as unknown as Top20Context;
    const opened: string[] = [];
    render(<Top20V2Panel data={data} selectedSector={null} onClearSector={() => {}} onSelectTicker={() => {}} ctx={ctx} onOpenSector={(c) => opened.push(`s:${c}`)} onOpenCycle={(t) => opened.push(`c:${t}`)} />);
    const row = screen.getAllByTestId("alpha-row")[0];
    expect(row.querySelector('[data-testid="alpha-sector-cell"]')!.textContent).toContain("Dẫn dắt");
    expect(row.querySelector('[data-testid="alpha-sector-cell"]')!.textContent).toContain("Đồng thuận tăng");
    expect(row.querySelector('[data-testid="alpha-timing-cell"]')!.textContent).toBe("Quan sát");
    expect(row.querySelector('[data-testid="alpha-cycle-cell"]')!.textContent).toBe("+1,2% ⚠");
    expect(row.querySelector('[data-testid="alpha-liquidity-cell"]')!.textContent).toContain("tỷ");
    expect(screen.getAllByTestId("alpha-row")[1].querySelector('[data-testid="alpha-cycle-cell"]')!.textContent).toBe("—");
    fireEvent.click(row);
    for (const id of ["alpha-ctx-sector", "alpha-ctx-cycle", "alpha-ctx-liquidity"]) expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.getByTestId("alpha-ctx-cycle").textContent).toContain("không phải dự báo");
    // VIC: σ 2,45%/ngày, GTGD TB60 ≈ 1.044 tỷ -> lệnh 1 tỷ ≈ 2,45% × √(1/1.044) ≈ 0,08%
    expect(screen.getByTestId("alpha-impact").textContent).toContain("σ 2,5%/ngày");
    expect(screen.getByTestId("alpha-impact").textContent).toContain("lệnh 1 tỷ ≈ 0,08%");
    expect(screen.getAllByTestId("alpha-factor-row")).toHaveLength(18);
    fireEvent.click(screen.getByTestId("alpha-open-sector"));
    fireEvent.click(screen.getByTestId("alpha-open-cycle"));
    expect(opened).toEqual([`s:${code}`, `c:${s0.ticker}`]);
    expect(screen.getByTestId("alpha-context-note").textContent).toContain("không cộng vào điểm");
  });

  it("định dạng giá trị thô theo đơn vị của từng yếu tố", () => {
    expect(fmtRaw("trend", 5)).toBe("5/6");
    expect(fmtRaw("roe", 0.1834)).toBe("18,3%");
    expect(fmtRaw("valueTrend", Math.log(1.5))).toBe("1,50×");
    expect(fmtRaw("npYoY", null)).toBe("—");
    expect(fmtRaw("npYoY", 5)).toBe("≥ +500%");
  });
});
