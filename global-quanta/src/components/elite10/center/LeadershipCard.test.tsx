import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LeadershipTicker } from "../../../lib/elite10/decisionTypes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const base: LeadershipTicker = {
  version: "LS-v1", prereg: "x", ticker: "VCP", date: "2026-11-11", ls: 2.55, pct: 99.5, band: "Dẫn dắt mạnh (top 10%)",
  components: [
    { id: "rs64", labelVi: "RS 64 phiên", value: 0.312, pct: 98 }, { id: "resMom", labelVi: "Động lượng riêng (trừ VN-Index)", value: 1.4, pct: 90 },
    { id: "hi52", labelVi: "Gần đỉnh 52 tuần", value: 0.97, pct: 95 }, { id: "resil", labelVi: "Chống chịu ngày VN-Index giảm", value: 0.004, pct: 80 },
    { id: "stage", labelVi: "Giai đoạn xu hướng (0–3)", value: 3, pct: 85 },
  ],
  market: { regime: "WEAK", regimeVi: "Thị trường yếu", bias: "defensive", breadth: 41.5, guard: false },
  evidence: { tier: "C", reasonVi: "Giữ bậc", main: { n: 1353, mean: 0.0103, t: 0.92, q: 0.5, stable: false }, weighting: { n: 1353, icDec: 0.022, neff: 688, icRegime: -0.019, neffRegime: 192, icRegPost: -0.003 }, icPost: null, gateLive: false },
  gate: null,
  scanner: { dataAsOf: "2026-11-11", consensusCode: "DAN_DAT_NGUOC_DONG", consensus: "Dẫn dắt ngược dòng (Leader)", trendTag: "Up-Trend", rsRating: 98.6, breakout: true, smartScore: 80.3, fScore: 4, fScoreMax: 6, fScoreApplicable: true, foreignNetBuy: false },
};
let current: LeadershipTicker = base;
vi.mock("../../../hooks/elite10/useEliteCenter", () => ({ useEliteLeadership: () => ({ data: current, error: null, isLoading: false }) }));
vi.mock("./DecisionBoard", () => ({ TierChip: ({ tier }: { tier: string }) => <span>Bậc {tier}</span> }));
const { default: LeadershipCard, integrationState } = await import("./LeadershipCard");

describe("LeadershipCard (LS-r1)", () => {
  afterEach(() => { document.body.innerHTML = ""; });
  it("hiển thị LS-v1, 5 thành phần, nhãn Siêu quét, trạng thái thị trường, bằng chứng và trạng thái tích hợp", async () => {
    current = base;
    const el = document.createElement("div"); document.body.appendChild(el);
    await act(async () => { createRoot(el).render(<LeadershipCard ticker="VCP" />); });
    const t = el.textContent ?? "";
    expect(el.querySelector('[data-testid="elite-leadership-ls"]')?.textContent).toBe("+2,55");
    expect(t).toContain("Dẫn dắt mạnh (top 10%)");
    expect(t).toContain("+31,2%"); expect(t).toContain("97% đỉnh"); expect(t).toContain("3/3");
    expect(t).toContain("Dẫn dắt ngược dòng (Leader)"); expect(t).toContain("⚡ Breakout"); expect(t).toContain("F-Score 4/6");
    expect(t).toContain("Thị trường yếu"); expect(t).toContain("CHƯA ổn định hai nửa");
    expect(el.querySelector('[data-testid="elite-leadership-state"]')?.textContent).toMatch(/Chưa chạy cổng H4/);
  });
  it("integrationState: cổng trượt / bậc C / chốt chặn / IC ≤ 0 -> trọng số 0; đủ điều kiện -> đang góp", () => {
    expect(integrationState({ ...base, gate: { pass: false, ranAt: "2026-11-12", verdictVi: "x" } }).text).toMatch(/KHÔNG ĐẠT/);
    const passGate = { ...base, gate: { pass: true, ranAt: "2026-11-12", verdictVi: "x" } };
    expect(integrationState(passGate).text).toMatch(/bậc C/);
    const tierB = { ...passGate, evidence: { ...base.evidence!, tier: "B" as const, icPost: 0.012 } };
    expect(integrationState({ ...tierB, market: { ...base.market!, guard: true } }).text).toMatch(/Chốt chặn/);
    expect(integrationState({ ...tierB, evidence: { ...tierB.evidence, icPost: -0.001 } }).text).toMatch(/≤ 0/);
    expect(integrationState(tierB)).toEqual({ tone: "on", text: "Đang góp vào Điểm Elite (E3-v5) với IC hậu nghiệm 0,012." });
  });
});
