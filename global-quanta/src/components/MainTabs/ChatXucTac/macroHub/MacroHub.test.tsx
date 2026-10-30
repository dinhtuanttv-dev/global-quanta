import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "../../../../test/rtl-lite";
import { buildPulseTiles, factorCoverage, fmtDelta, sparkPath, upcomingEvents, type MacroSeriesResponse } from "./macroHubData";

const pts = (vals: number[]) => vals.map((value, i) => ({ period: `2026-0${i + 1}`, value }));
const res: MacroSeriesResponse = { asOf: "2026-10-31", series: [
  { id: "CPI", nameVi: "CPI", role: "factor", n: 200, last: "2026-09", points: [{ period: "2026-08", value: 4.88 }, { period: "2026-09", value: 5.08 }] },
  { id: "OIL", nameVi: "Dầu", role: "factor", n: 200, last: "2026-02", points: pts([80, 88]) },
  { id: "M2", nameVi: "Cung tiền M2", role: "factor", n: 0, last: null, points: [] },
  { id: "VNINDEX", nameVi: "VN-Index", role: "target", n: 120, last: "2026-09", points: [{ period: "2026-08", value: 1800 }, { period: "2026-09", value: 1755 }] },
] };

vi.mock("swr", () => ({ default: (key: string[]) => ({
  data: key[0] === "macro-pulse" ? res : { mode: "real", asOf: "2026-10-31", caveat: "Ước tính.", events: [
    { id: "b", kind: "release", title: "GSO công bố CPI", date: "2026-11-06", daysRemaining: 6, estimated: true },
    { id: "a", kind: "fomc", title: "FOMC", date: "2026-12-09", daysRemaining: 39, estimated: false },
    { id: "al", kind: "alert", title: "CPI cao bất thường", date: "2026-10-31", daysRemaining: 0, estimated: false },
    { id: "old", kind: "fomc", title: "Đã qua", date: "2026-10-28", daysRemaining: -3 },
  ] }, error: undefined, isLoading: false }) }));
vi.mock("../../../../services/marketDataClient", () => ({ fetchMarketJson: async () => ({}), isMarketGatewayEnabled: () => true }));

import MacroPulse from "./MacroPulse";
import MacroUpcoming from "./MacroUpcoming";

afterEach(cleanup);

describe("Trung tâm vĩ mô — dữ liệu", () => {
  it("thẻ: rate tính chênh điểm %, level tính %; số liệu cũ hơn 3 tháng gắn nhãn cũ; chuỗi rỗng không có thẻ", () => {
    const t = buildPulseTiles(res);
    expect(t.map((x) => x.id)).toEqual(["CPI", "VNINDEX", "OIL"]);
    expect(t[0].delta).toBeCloseTo(0.2);
    expect(t[0].deltaUnit).toBe("pp");
    expect(t[1].delta).toBeCloseTo(-2.5);
    expect(t[1].stale).toBe(false);
    expect(t[2].stale).toBe(true);
    expect(fmtDelta(0.2, "pp")).toBe("+0,2 đ%");
    expect(fmtDelta(-2.5, "%")).toBe("−2,5%");
    expect(fmtDelta(null, "%")).toBe("—");
  });
  it("độ phủ nêu rõ biến còn thiếu; sparkline cần ít nhất 2 điểm; lịch bỏ sự kiện đã qua, sớm nhất trước", () => {
    expect(factorCoverage(res)).toEqual({ total: 3, have: 2, missing: ["Cung tiền M2"] });
    expect(sparkPath([{ period: "a", value: 1 }])).toBe("");
    expect(sparkPath(pts([1, 2]), 100, 20)).toBe("0.0,18.0 100.0,2.0");
    expect(upcomingEvents({ mode: "real", asOf: "x", events: [{ id: "z", kind: "k", title: "z", date: "d", daysRemaining: 9 }, { id: "y", kind: "k", title: "y", date: "d", daysRemaining: 1 }, { id: "x", kind: "k", title: "x", date: "d", daysRemaining: -1 }] }).map((e) => e.id)).toEqual(["y", "z"]);
  });
});

describe("Trung tâm vĩ mô — giao diện", () => {
  it("Nhịp vĩ mô hiện thẻ có số liệu và nói rõ biến thiếu", () => {
    render(<MacroPulse />);
    expect(screen.getByTestId("pulse-CPI").textContent).toContain("5,08");
    expect(screen.getByTestId("pulse-coverage").textContent).toContain("2/3");
    expect(screen.getByTestId("pulse-missing").textContent).toContain("Cung tiền M2");
    expect(screen.getByTestId("pulse-OIL").textContent).toContain("cũ");
  });
  it("Lịch phân biệt ngày ước tính / chính thức", () => {
    render(<MacroUpcoming />);
    const rows = screen.getAllByTestId("macro-upcoming-row").map((r) => r.textContent ?? "");
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("Tín hiệu từ số liệu");
    expect(rows[1]).toContain("Ngày ước tính");
    expect(rows[2]).toContain("Ngày chính thức");
  });
});
