import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import EvidenceCard from "./EvidenceCard";
import type { TechnicalFilterEvidence } from "../../../hooks/useTechnicalFilter";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Số liệu từ lần chạy chỉ-đọc trên dữ liệu thật 08/10/2026 (Base Breakout v2, 156 mã).
const evidence: TechnicalFilterEvidence = {
  label: "EXPERIMENTAL",
  reason: "Ngoài mẫu chưa đạt PF ≥ 1,1 / kỳ vọng dương / vượt nền.",
  period: { from: "2024-10-22", to: "2026-10-08", oosFrom: "2026-03-07" },
  rules: "Vào giá mở cửa T+1 · T+2,5",
  all: { n: 998, winRate: 33.67, avgNetPct: 0.71, medianNetPct: -2.72, profitFactor: 1.21, expectancyR: 0.12 },
  inSample: { n: 810, winRate: 36.67, avgNetPct: 1.42, medianNetPct: -2.32, profitFactor: 1.43, expectancyR: 0.22 },
  outOfSample: { n: 173, winRate: 20.23, avgNetPct: -2.25, medianNetPct: -3.04, profitFactor: 0.37, expectancyR: -0.3 },
  byGrade: { A: { n: 570, profitFactor: 1.4 }, B: { n: 250, profitFactor: 1.07 }, C: { n: 178, profitFactor: 0.73 } },
  baseline: { holdBars: 10, all: -0.36, outOfSample: -1.46 },
};

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });

function render(ui: React.ReactElement) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root!.render(ui));
  return el;
}

describe("EvidenceCard", () => {
  it("hiển thị trung thực nhãn EXPERIMENTAL và PF ngoài mẫu, kể cả khi xấu", () => {
    const el = render(<EvidenceCard evidence={evidence} marketUp={false} />);
    expect(el.querySelector('[data-testid="evidence-label"]')?.textContent).toBe("EXPERIMENTAL");
    expect(el.textContent).toContain("Ngoài mẫu PF 0,37 · 173 lệnh");
    expect(el.textContent).toContain("M chưa thuận");
    expect(el.textContent).toContain("Hạng A");
    expect(el.querySelector("details")?.open).toBe(false);
    expect(el.querySelector('[data-testid="evidence-small-sample"]')).toBeNull();
  });

  it("cảnh báo mẫu nhỏ khi < 100 lệnh", () => {
    const el = render(<EvidenceCard evidence={{ ...evidence, all: { ...evidence.all, n: 57 } }} marketUp />);
    expect(el.querySelector('[data-testid="evidence-small-sample"]')?.textContent).toContain("57 lệnh");
  });

  it("phần kiểm định: KTC 95%, t so với nền, số cấu hình đã thử, bảng nửa năm", () => {
    const el = render(<EvidenceCard marketUp evidence={{ ...evidence, validation: {
      ciAll: { mean: [-0.5, 0.2], pf: [0.8, 1.1], clusters: 300 }, ciOutOfSample: { mean: [-3.1, -1.4], pf: [0.25, 0.5], clusters: 80 },
      tVsBaseline: 0.4, tVsBaselineOos: -1.9, trials: 26,
      periods: [{ period: "H2/2024", n: 120, profitFactor: 0.9 }, { period: "H1/2025", n: 300, profitFactor: 1.4 }],
    } }} />);
    const v = el.querySelector('[data-testid="evidence-validation"]')!.textContent!;
    expect(v).toContain("-3,10% … -1,40%");
    expect(v).toContain("26");
    expect(v).toContain("thiên lệch tối ưu");
    expect(v).toContain("H1/2025");
  });

  it("theo dõi thực tế: chưa có dữ liệu -> giải thích; có -> trúng / nền + kết luận", () => {
    let el = render(<EvidenceCard evidence={evidence} marketUp />);
    expect(el.querySelector('[data-testid="live-tracking"]')!.textContent).toContain("Đang ghi nhận tín hiệu mỗi phiên");
    act(() => root?.unmount()); root = null;
    const stat = { n: 34, hitRate: 0.62, baseline: 0.5, hitLow: 0.45, hitHigh: 0.76, z: 2.1, avgSignedExcess: 0.01, verdict: "edge" as const };
    el = render(<EvidenceCard evidence={evidence} marketUp live={{ generatedAt: null, breakout: { h3: null, h5: stat, h10: null }, setup: { h3: null, h5: null, h10: null } }} />);
    const t = el.querySelector('[data-testid="live-tracking"]')!.textContent!;
    expect(t).toContain("62% / 50%");
    expect(t).toContain("có lợi thế · n=34");
  });

  it("không có nhãn M khi thị trường thuận", () => {
    const el = render(<EvidenceCard evidence={{ ...evidence, label: "VALIDATED" }} marketUp />);
    expect(el.textContent).not.toContain("M chưa thuận");
    expect(el.querySelector('[data-testid="evidence-label"]')?.textContent).toBe("VALIDATED");
  });
});
