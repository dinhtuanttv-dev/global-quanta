import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ScannerEvidence } from "./ScannerEvidence";
import type { ScannerValidation } from "../../../hooks/useSieuQuetScanner";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
afterEach(() => { host?.remove(); host = null; });
function render(v: ScannerValidation | null) {
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => createRoot(host!).render(<ScannerEvidence validation={v} />));
  return host.textContent ?? "";
}

const ic = (mean: number, lo: number, hi: number) => ({ is: { mean: 0.004, lo: -0.03, hi: 0.04, dates: 123 }, oos: { mean, lo, hi, dates: 85 } });
const base = (verdict: "PASS" | "FAIL", oos: ReturnType<typeof ic>): ScannerValidation => ({
  prereg: "SQ-v2-r1", status: "DONE", ranAt: "2026-10-22", primaryHorizon: 20, isEnd: "2024-12-31",
  sample: { dates: 208, from: "2022-07-21", to: "2026-09-17", symbols: 100, avgNames: 96 },
  verdicts: { smartScore: verdict }, ic: { smartScore: { "20": oos } },
});

describe("ScannerEvidence", () => {
  it("không đạt -> nhãn mô tả kèm IC ngoài mẫu và CI (không ẩn)", () => {
    const t = render(base("FAIL", ic(-0.0157, -0.0808, 0.0455)));
    expect(t).toContain("CHƯA ĐẠT KIỂM ĐỊNH");
    expect(t).toContain("không phải tín hiệu dự báo");
    expect(t).toContain("-0,016");
    expect(t).toContain("85 ngày");
    expect(t).toContain("VN100 2022–2026");
  });
  it("đạt -> 'ĐÃ KIỂM ĐỊNH'", () => {
    expect(render(base("PASS", ic(0.04, 0.01, 0.07)))).toContain("ĐÃ KIỂM ĐỊNH");
  });
  it("chưa có kiểm định -> chưa kiểm định", () => {
    expect(render(null)).toContain("chưa kiểm định");
  });
});
