// MTF v3 · S5 — thẻ quyết định: tiêu đề theo trạng thái, thiết lập, cổng chặn, kế hoạch R:R; không có chữ MUA / BÁN.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "../../../../test/rtl-lite";
import DecisionCard from "./DecisionCard";
import type { Decision3View } from "../../../../hooks/useStructure3";

const base: Decision3View = {
  setups: [
    { key: "pullback", label: "Mua điều chỉnh — chân dưới đổi theo chân trên", on: false, why: "" },
    { key: "breakout", label: "Phá vỡ nền trong giai đoạn 2", on: true, why: "Phá vỡ 17W 24/5 3T" },
    { key: "expansion", label: "Nén → mở rộng theo xếp lớp", on: false, why: "" },
    { key: "reversal", label: "Đảo chiều — đổi tính chất ↑ sau nền", on: false, why: "" },
  ],
  gates: [
    { key: "over", label: "Quá đà: lệch ≥ 3 ATR trên EMA50", hit: false, detail: "lệch 1,2 ATR" },
    { key: "htfResistance", label: "Kháng cự Tuần / Tháng ngay phía trên (≤ 1 ATR)", hit: true, detail: "D/W 100 (3 lần chạm)" },
    { key: "spent", label: "Dải MA đã mở hết", hit: false, detail: null },
    { key: "againstWeek", label: "Ngược khung Tuần", hit: false, detail: "UP" },
  ],
  active: "breakout", late: false,
  plan: { entry: 96, stop: 89, stopBasis: "đáy nhịp co cuối của nền", target1: 100, target1Basis: "kháng cự D/W 100", target2: 117, rr1: 0.57, ok: false, trail: 88 },
  state: "blocked", headline: "Có thiết lập nhưng KHÔNG nên vào: Kháng cự Tuần / Tháng ngay phía trên (≤ 1 ATR)",
};

describe("DecisionCard", () => {
  afterEach(() => cleanup());
  it("trạng thái bị chặn: cổng kháng cự khung lớn, R:R không đạt, kế hoạch đủ số; không có chữ MUA / BÁN", () => {
    render(<DecisionCard d={base} />);
    expect(screen.getByTestId("decision3-headline").textContent).toContain("KHÔNG nên vào");
    expect(screen.getByTestId("gate-htfResistance").textContent).toContain("D/W 100");
    expect(screen.getByTestId("decision3-rr").textContent).toBe("1 : 0,57");
    expect(screen.getByTestId("decision3-plan").textContent).toContain("không đạt");
    expect(screen.getByTestId("decision3").textContent).not.toMatch(/\bMUA\b|\bBÁN\b/);
    expect(screen.getByTestId("decision3-evidence").textContent).toBe("MÔ TẢ · chưa kiểm định");
  });

  it("có kết quả kiểm định: nhãn KHÔNG ĐẠT, số ngoài mẫu cạnh thiết lập, ghi chú H5 khi nhóm bị chặn tốt hơn", () => {
    const ev = {
      label: "MÔ TẢ", note: "…", verdicts: { H1: "FAIL", H2: "FAIL", H3: "FAIL", H4: "FAIL", H5: "FAIL", H6: "FAIL" } as const,
      H: {
        H3: { verdict: "FAIL" as const, q: 0.9, IS: null, OOS: { n: 76, mean: -2.8, ci: [-5.3, -0.46] as [number, number], p: 0.98 } },
        H5: { verdict: "FAIL" as const, q: 0.9, IS: null, OOS: { n: 1237, nF: 565, nA: 672, mean: 0.86, ci: [-0.4, 2.16] as [number, number], p: 0.9 } },
      },
    };
    render(<DecisionCard d={base} evidence={ev} />);
    expect(screen.getByTestId("decision3-evidence").textContent).toContain("KHÔNG ĐẠT");
    expect(screen.getByTestId("setup-breakout").textContent).toContain("H3 -2,8%");
    expect(screen.getByTestId("decision3-h5").textContent).toContain("TỐT hơn");
  });
});
