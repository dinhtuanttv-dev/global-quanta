// R6 — bảng kiểm định trong tab Backtest hiển thị ĐÚNG số liệu sinh tự động và nhãn theo kết luận.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import report from "../../../lib/ta-command-center/validation/chartSignalsReport.json";
import ChartSignalsValidation, { anyChartSignalPassed, chartSignalVerdict } from "./ChartSignalsValidation";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("R6 — kiểm định tín hiệu chart", () => {
  it("9 tín hiệu theo tiêu chí đặt trước; nhãn khớp kết luận; chưa đạt -> câu 'chỉ là MÔ TẢ'", () => {
    const ids = Object.keys(report.results);
    expect(ids).toEqual(["C1", "C2", "C3", "C4", "C5", "C6", "W1", "W3", "W4"]);
    expect(report.prereg).toContain("a914ae3");
    const el = document.createElement("div"); document.body.appendChild(el);
    const root = createRoot(el); act(() => root.render(<ChartSignalsValidation />));
    for (const id of ids) {
      const row = el.querySelector(`[data-testid="csv-row-${id}"]`)!;
      const v = chartSignalVerdict(id);
      expect(row.textContent).toContain(v === "PASS" ? "ĐÃ KIỂM ĐỊNH" : v === "FAIL" ? "THỰC NGHIỆM" : "THIẾU MẪU");
    }
    expect(el.textContent!.includes("chỉ là MÔ TẢ")).toBe(!anyChartSignalPassed);
    act(() => root.unmount());
  });
});
