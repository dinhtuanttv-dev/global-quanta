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
  });

  it("không có nhãn M khi thị trường thuận", () => {
    const el = render(<EvidenceCard evidence={{ ...evidence, label: "VALIDATED" }} marketUp />);
    expect(el.textContent).not.toContain("M chưa thuận");
    expect(el.querySelector('[data-testid="evidence-label"]')?.textContent).toBe("VALIDATED");
  });
});
