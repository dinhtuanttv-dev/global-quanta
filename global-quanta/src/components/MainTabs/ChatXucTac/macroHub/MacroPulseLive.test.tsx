// MV-L1 (27/11/2026): thẻ Nhịp vĩ mô — cảnh báo nguồn chậm công bố + dòng "Hiện tại" (giá ngày) bên cạnh số tháng đã đóng.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "../../../../test/rtl-lite";
import { releaseNote, type MacroLiveSeries } from "./macroHubData";

const series = { asOf: "2026-11-27", series: [
  { id: "CPI", nameVi: "Lạm phát", role: "factor", n: 261, last: "2026-09", points: [{ period: "2026-08", value: 4.88 }, { period: "2026-09", value: 5.08 }] },
  { id: "OIL", nameVi: "Dầu Brent", role: "factor", n: 262, last: "2026-10", points: [{ period: "2026-09", value: 115.91 }, { period: "2026-10", value: 120.15 }] },
] };
const live = { asOf: "2026-11-27T05:00:00Z", today: "2026-11-27",
  series: {
    CPI: { last: { period: "2026-09", value: 5.08, source: "IMF" }, release: { nextPeriod: "2026-10", expected: "2026-11-06", overdueDays: 18 }, overdue: true, live: null },
    OIL: { last: { period: "2026-10", value: 120.15, source: "FRED" }, release: { nextPeriod: "2026-11", expected: "2026-12-01", overdueDays: 0 }, overdue: false,
      live: { date: "2026-11-24", value: 92.81, source: "FRED:DCOILBRENTEU · giao ngay, ngày", vsClosePct: (92.81 / 120.15 - 1) * 100, closedPeriod: "2026-10" } },
  },
  overdue: [{ id: "CPI", nameVi: "Lạm phát (CPI, so cùng kỳ)", nextPeriod: "2026-10", expected: "2026-11-06", overdueDays: 18 }] };

vi.mock("swr", () => ({ default: (key: string[]) => ({ data: key[0] === "macro-live" ? live : series, error: undefined, isLoading: false }) }));
vi.mock("../../../../services/marketDataClient", () => ({ fetchMarketJson: async () => ({}), isMarketGatewayEnabled: () => true }));
import MacroPulse from "./MacroPulse";

afterEach(cleanup);

describe("Nhịp vĩ mô · trạng thái công bố và giá hiện tại", () => {
  it("CPI quá hạn: nhãn 'Chậm 18 ngày' + dòng cảnh báo đầu khối; số chính vẫn là kỳ đã có", () => {
    render(<MacroPulse />);
    expect(screen.getByTestId("pulse-release-CPI").textContent).toBe("Chậm 18 ngày");
    expect(screen.getByTestId("pulse-overdue").textContent).toContain("kỳ 10/2026 (18 ngày)");
    expect(screen.getByTestId("pulse-CPI").textContent).toContain("5,08");
    expect(screen.queryByTestId("pulse-live-CPI")).toBeNull();
  });
  it("Brent: số chính tháng 10 (120,2) + 'Hiện tại 92,8 · 24/11 · −22,8%'", () => {
    render(<MacroPulse />);
    const tile = screen.getByTestId("pulse-OIL").textContent ?? "";
    expect(tile).toContain("120,2");
    const line = screen.getByTestId("pulse-live-OIL").textContent ?? "";
    expect(line).toContain("92,8");
    expect(line).toContain("24/11");
    expect(line).toContain("−22,8%");
    expect(screen.getByTestId("pulse-release-OIL").textContent).toBe("Kỳ tới 01/12");
  });
  it("releaseNote: không có lịch -> null", () => {
    expect(releaseNote(undefined)).toBeNull();
    expect(releaseNote({ release: null } as unknown as MacroLiveSeries)).toBeNull();
  });
});
