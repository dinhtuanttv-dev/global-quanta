// Panel Phân tích AI: hiển thị định dạng mới (overallSummaryVi + sectors[] theo ICB); trước đây đọc định dạng cũ nên trống.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "../../../test/rtl-lite";
import { sectorNameOf } from "../../../lib/worldSectors/sectorNames";

vi.mock("../../../hooks/useMacroAnalysis", () => ({
  useMacroAnalysis: () => ({
    isLoading: false, error: null, analyze: vi.fn(),
    result: {
      overallSummaryVi: "Dầu tăng, công nghệ Mỹ giảm.", mode: "gateway-icb", context: { source: "gateway", dataPoints: 80 }, newsVerified: true, newsDiscrepancies: [], news: null, disclaimer: "Tham khảo.",
      sectors: [
        { sectorKey: "0500", sectorNameVi: "Dầu khí", direction: "bullish", confidence: 0.62, reasoningVi: "Brent tăng.", evidenceRefs: ["ws:0500"], verified: true, discrepancies: [], quant: { shortScore: 1.1, shortLabel: "tailwind", mediumScore: 0.6, shortEvidence: "EVIDENCE" }, vnTickers: ["BSR", "PLX"] },
        { sectorKey: "9500", direction: "bullish", confidence: 0.3, reasoningVi: "x", evidenceRefs: [], verified: false, discrepancies: ["Trái chiều với điểm định lượng ngắn hạn"], vnTickers: [] },
      ],
    },
  }),
}));
afterEach(cleanup);

describe("AiAnalysisPanel", () => {
  it("hiện tóm tắt, từng ngành ICB, điểm định lượng, cờ kiểm chứng và mã thành phần", async () => {
    const { default: Panel } = await import("./AiAnalysisPanel");
    render(<Panel />);
    const t = screen.getByTestId("ai-analysis-panel").textContent ?? "";
    expect(t).toContain("Dầu tăng, công nghệ Mỹ giảm.");
    expect(t).toContain("DỮ LIỆU GATEWAY · 80 điểm dữ liệu");
    expect(t).toContain("Dầu khí");
    expect(t).toContain("Công nghệ (ICB 9500)");
    expect(t).toContain("Trái chiều với điểm định lượng");
    expect(t).toContain("BSR");
    expect(t).toContain("Điểm định lượng: ngắn hạn +1,10 σ");
  });
  it("tên ngành: mã ICB và khoá cũ đều đọc được", () => {
    expect(sectorNameOf("8300")).toBe("Ngân hàng (ICB 8300)");
    expect(sectorNameOf("ICB:0500")).toBe("Dầu khí (ICB 0500)");
    expect(sectorNameOf("BANKING_FINANCE")).not.toBe("BANKING_FINANCE");
  });
});
