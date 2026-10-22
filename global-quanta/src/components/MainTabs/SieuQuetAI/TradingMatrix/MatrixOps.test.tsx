import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { ForecastBlock } from "./MatrixOps";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let el: HTMLDivElement;
afterEach(() => el?.remove());

describe("Trading Matrix M5", () => {
  it("xác suất luôn kèm kỳ hạn, tỷ lệ nền, cỡ mẫu, holdout, phiên bản; champion chưa thăng hạng -> MÔ TẢ", async () => {
    el = document.createElement("div"); document.body.appendChild(el);
    await act(async () => createRoot(el).render(<ForecastBlock f={{ date: "2026-10-21", target: "VN-Index sau 10 phiên cao hơn hôm nay", horizon: 10, p: 0.61, modelId: "B0-breadth", kind: "B0", baseRate: 0.55, trainN: 760, trainedTo: null, holdout: { n: 436, baseRate: 0.573, brier: 0.2441 }, gate: "KEEP_CHAMPION", label: "MÔ TẢ", note: "Tần suất lịch sử" }} />));
    const t = el.textContent ?? "";
    expect(t).toContain("61%"); expect(t).toContain("tỷ lệ nền 55%"); expect(t).toContain("kỳ hạn 10 phiên");
    expect(t).toContain("huấn luyện 760 phiên"); expect(t).toContain("holdout 436 phiên"); expect(t).toContain("B0-breadth");
    expect(t).toContain("MÔ TẢ"); expect(t).not.toContain("ĐÃ KIỂM ĐỊNH");
  });
});
