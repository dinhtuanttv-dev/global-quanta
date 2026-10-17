import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "../../../test/rtl-lite";

const evidence = {
  version: "E2-v1", generatedAt: "x", calendarLast: "2026-10-16", tests: 20, counts: { A: 3, B: 2, C: 16 },
  signals: [
    { id: "log_rvol", tab: "Siêu quét AI", labelVi: "Khối lượng tương đối (log)", priorTier: "C", priorEvidenceVi: "Đặc trưng", tier: "C", change: "none", reasonVi: "Giữ bậc", mainH: 5, source: "hồi cứu",
      byH: { 1: { n: 236, mean: -0.0364, t: -5.24, pPos: 1, q: 1, stable: false, halves: null, from: "2025-09-17", to: "2026-10-14" }, 5: { n: 232, mean: -0.0214, t: -2.2, pPos: 1, q: 1, stable: false, halves: null, from: "a", to: "b" }, 10: { n: 0 }, 20: { n: 0 } } },
    { id: "stealth20", tab: "Siêu quét AI", labelVi: "Stealth 20", priorTier: "A", priorEvidenceVi: "Sổ cái", tier: "A", change: "none", reasonVi: "Giữ bậc", mainH: 5, source: "hồi cứu",
      byH: { 1: { n: 219, mean: 0.0069, t: 1.5, q: 0.22, stable: true }, 5: { n: 215, mean: 0.0159, t: 2.02, q: 0.2, stable: true }, 10: { n: 210, mean: 0.024, t: 2.12, q: 0.2, stable: true }, 20: { n: 200, mean: 0.0288, t: 1.74, q: 0.2, stable: true } } },
  ],
};
const ledger = {
  version: "E3-v2", updatedAt: "2026-10-17T09:00:00Z",
  summary: { label: "EXPERIMENTAL", labelVi: "THĂM DÒ — cần ≥ 60 phiên tiến (hiện 1 phiên)", criteria: { icPass: false, excessPass: false, sessions: 1 }, horizons: { 5: { n: 0, ic: { n: 0 }, curve: [] }, 10: { n: 0, ic: { n: 0 }, curve: [] } } },
  entries: [{ date: "2026-10-16", lockedAt: "x", holdings: [{ ticker: "ORS", weight: 0.14 }], universeSize: null, results: {} }],
};
const risk = {
  date: "2026-10-16", version: "E3-v2", generatedAt: "x", label: "EXPERIMENTAL", available: true, sessions: 250, from: "2025-10-10", to: "2026-10-16",
  shrinkage: { delta: 0.31, avgCorrelation: 0.35, method: "Ledoit–Wolf (2004), mục tiêu tương quan hằng số" },
  volatility: { daily: 0.014, annual: 0.222 },
  holdings: [{ ticker: "ORS", weight: 0.6, volAnnual: 0.4, riskContribution: 0.75, sector: "8700" }, { ticker: "NAB", weight: 0.4, volAnnual: 0.25, riskContribution: 0.25, sector: "8300" }],
  diversification: { ratio: 1.3, effectiveN: 1.92, enb: 1.6, hhi: 0.52 },
  var: { "0.95": { level: 0.95, historical: { var: 0.021, cvar: 0.03 }, gaussian: { var: 0.022, cvar: 0.028 }, cornishFisher: { var: 0.024 }, moments: { mean: 0.0005, sd: 0.014, skew: -0.4, exKurt: 2.1 } },
         "0.99": { level: 0.99, historical: { var: 0.035, cvar: 0.04 }, gaussian: { var: 0.032, cvar: 0.036 }, cornishFisher: { var: 0.038 }, moments: { mean: 0, sd: 0, skew: 0, exKurt: 0 } }, tenDayNoteVi: "√10" },
  beta: 1.12, corrWithVnIndex: 0.81, maxDrawdown: { value: -0.18, from: "2026-03-01", to: "2026-04-10" },
  stress: { worstVnIndexDays: [{ date: "2026-04-03", vnIndex: -0.064, portfolio: -0.071 }], worst10Sessions: { from: "2026-04-01", to: "2026-04-14", vnIndex: -0.12, portfolio: -0.14 } },
  sectors: [{ key: "8700", weight: 0.6 }, { key: "8300", weight: 0.4 }],
  correlation: { tickers: ["ORS", "NAB"], matrix: [[1, 0.42], [0.42, 1]] },
};
vi.mock("../../../hooks/elite10/useEliteCenter", () => ({
  useEliteEvidence: () => ({ data: evidence }), useEliteLedger: () => ({ data: ledger }), useEliteRisk: () => ({ data: risk, isLoading: false }),
}));
vi.mock("../../../hooks/useWorldStrategy", () => ({ useWorldStrategy: () => ({ data: { short: { rows: [{ icb: "8700", nameVi: "Dịch vụ tài chính" }] } } }) }));

import EvidenceLedgerTab from "./EvidenceLedgerTab";
import RiskTab from "./RiskTab";

afterEach(cleanup);

describe("Elite 10 E6 — Bằng chứng & Rủi ro", () => {
  it("bằng chứng: bậc A trước C, IC âm vẫn hiển thị công khai, kỳ hạn chưa đo ghi rõ; sổ theo dõi chưa chấm ghi 'chờ'", () => {
    render(<EvidenceLedgerTab />);
    const rows = screen.getByTestId("elite-ic-table").querySelectorAll("tbody tr");
    expect(rows[0].getAttribute("data-testid")).toBe("elite-ev-stealth20");
    const rv = screen.getByTestId("elite-ev-log_rvol").textContent ?? "";
    expect(rv).toContain("−0,036");
    expect(rv).toContain("chưa đo");
    expect(screen.getByTestId("elite-ledger-tab").textContent).toContain("chờ");
    expect(screen.getByTestId("elite-ledger-tab").textContent).toContain("Chưa đủ phiên đã chấm");
  });

  it("rủi ro: chỉ số chính, đóng góp rủi ro, tương quan, căng thẳng, tên ngành", () => {
    render(<RiskTab />);
    const tiles = screen.getByTestId("elite-risk-tiles").textContent ?? "";
    expect(tiles).toContain("22,2%");
    expect(tiles).toContain("2,10%");
    expect(tiles).toContain("1,12");
    expect(screen.getByTestId("elite-risk-rc").textContent).toContain("rủi ro 75,0%");
    expect(screen.getByTestId("elite-risk-corr").textContent).toContain("δ = 0,31");
    expect(screen.getByTestId("elite-risk-stress").textContent).toContain("−6,40%".replace("−", "-"));
    expect(screen.getByTestId("elite-risk-sectors").textContent).toContain("Dịch vụ tài chính");
    expect(screen.getByTestId("elite-risk-sectors").textContent).toContain("đuôi dày hơn");
  });
});
