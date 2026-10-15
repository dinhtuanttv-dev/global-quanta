// Top 20 v2 (T4) — dữ liệu thật Gateway /api/market/alpha/top20 (2026-10-15) lưu làm fixture.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import fixture from "./__fixtures__/alpha-top20.json";
import Top20V2Panel, { fmtRaw } from "./Top20V2Panel";
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

  it("định dạng giá trị thô theo đơn vị của từng yếu tố", () => {
    expect(fmtRaw("trend", 5)).toBe("5/6");
    expect(fmtRaw("roe", 0.1834)).toBe("18,3%");
    expect(fmtRaw("valueTrend", Math.log(1.5))).toBe("1,50×");
    expect(fmtRaw("npYoY", null)).toBe("—");
    expect(fmtRaw("npYoY", 5)).toBe("≥ +500%");
  });
});
