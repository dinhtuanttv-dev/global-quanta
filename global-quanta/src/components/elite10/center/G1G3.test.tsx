// G2 + G3 — danh mục đối chứng E3 ở tab Bằng chứng; khoảng cách tới danh mục Elite HL trong Hồ sơ (điều kiện quy tắc, không theo Z).
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "../../../test/rtl-lite";
import type { EliteDecision } from "../../../lib/elite10/decisionTypes";
import { hlGap } from "../../../lib/elite10/hlGap";
import type { HlResult } from "../../../lib/elite10/confluence";

const pick = (ticker: string, o: Record<string, unknown> = {}) => ({ ticker, weight: 0.1, Z: 1.2, rank: 3, alpha5Pct: 0.41, pOutperform: 0.52, sectorKey: "8700", close: 30000, stop: 27000, target: 34000, holdSessions: 10, retained: true, riskContribution: 0.1, ...o });
let doc: Partial<EliteDecision> | null = {
  date: "2026-11-17", hl: { version: "E4-HL v1" } as EliteDecision["hl"], portfolio: [pick("VIC", { hl: { rank: 1, cls: "STRONG" } })] as unknown as EliteDecision["portfolio"],
  flowVersion: "E3-v4", flowPortfolio: [pick("VIC", { rank: 1, Z: 2.1 }), pick("ORS", { rank: 2, Z: 1.8, alpha5Pct: -0.2 })] as EliteDecision["portfolio"],
  flowConstruction: { method: "erc", sessions: 120, retained: 8, previous: 10, turnover: 0.2 }, icComb: 0.034,
  weights: [{ id: "stealth20", labelVi: "Stealth 20", tab: "Siêu quét", tier: "A", mainH: 5, n: 40, icMeas: 0.031, icPrior: 0.02, icPost: 0.027, w: 0.6 }] as EliteDecision["weights"],
};
vi.mock("../../../hooks/elite10/useEliteCenter", () => ({ useEliteDecision: () => ({ data: doc }) }));
vi.mock("../../../hooks/useWorldStrategy", () => ({ useWorldStrategy: () => ({ data: { short: { rows: [{ icb: "8700", nameVi: "Dịch vụ tài chính" }] } } }) }));
import FlowBenchmarkPanel from "./FlowBenchmarkPanel";

afterEach(() => cleanup());
const text = (id: string) => screen.getByTestId(id).textContent ?? "";

describe("G2 — danh mục đối chứng E3 ở tab Bằng chứng", () => {
  it("bảng đối chứng: hạng Z, ngành, tỷ trọng, α, trùng với Elite HL; nói rõ không dùng để giao dịch; trọng số tín hiệu thu gọn", () => {
    render(<FlowBenchmarkPanel />);
    expect(text("flow-benchmark-note")).toMatch(/Danh mục chính thức là Elite HL.*không dùng để giao dịch/);
    expect(text("flow-benchmark-overlap")).toBe("1/2");
    expect(text("flow-benchmark-table")).toMatch(/1VICDịch vụ tài chính2,1.*có/);
    expect(text("flow-benchmark-table")).toMatch(/ORS.*−0,2.*—/);
    expect(text("flow-benchmark-weights")).toMatch(/IC tổ hợp 0,034.*Stealth 20.*Bậc A.*60/);
  });
  it("tài liệu cũ (không có Elite HL) hoặc không có danh mục đối chứng -> không hiện", () => {
    doc = { ...doc, hl: undefined }; render(<FlowBenchmarkPanel />); expect(screen.queryByTestId("flow-benchmark")).toBeNull();
  });
});

describe("G3 — khoảng cách tới danh mục Elite HL", () => {
  const r = (o: Partial<HlResult>): HlResult => ({ ticker: "AAA", lsPct: 85, lsPts: 3, taModels: Array.from({ length: 7 }, (_, i) => ({ id: `m${i}`, label: "m", ok: i < 3 })), taCount: 3, taKnown: 7, taPts: 3, t1: 8, pass1: true, rrg: 1, t2: 1, factors: [], t3: 1, cls: "CONFLUENCE", rank: 4, ...o });
  it("đạt mọi điều kiện -> câu 'vào khi có phiên cân bằng'; thiếu điều kiện -> đếm đúng, có số đo; chưa có số liệu -> '?'", () => {
    const ok = hlGap(r({}), { advBn: 30, close: 25000, sigma20: 0.02 }, { minAdvBn: 5, minPrice: 5000, minSigma20: 0.005 }, { lsLeaderPct: 80, taMin: 2, taModels: 7 })!;
    expect(ok.missing).toBe(0); expect(ok.verdictVi).toMatch(/Đạt mọi điều kiện/);
    const bad = hlGap(r({ lsPct: 62, taCount: 1, cls: "NOT_T1", pass1: false, rrg: -2, t2: -1 }), { advBn: 3.2, close: 4200, sigma20: 0.001 })!;
    expect(bad.missing).toBe(6);
    expect(bad.conds.map((c) => c.text)).toEqual([
      "Sức mạnh dẫn dắt LS-v1: phân vị 62 (cần ≥ 80)", "Mô hình TA đạt: 1/7 (cần ≥ 2)", "Ngành trên RRG: phản đối",
      "GTGD TB20 3,2 tỷ (cần ≥ 5 tỷ)", "Giá 4.200đ (cần ≥ 5.000đ)", "Biến động 20 phiên 0,1%/ngày (cần ≥ 0,5%)",
    ]);
    const unk = hlGap(r({ lsPct: null, rrg: null }), null)!;
    expect(unk.conds.find((c) => c.id === "ls")!.ok).toBeNull(); expect(unk.verdictVi).toMatch(/chưa có số liệu|Chưa đủ số liệu/);
    expect(hlGap(undefined, null)).toBeNull();
  });
});
