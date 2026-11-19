// D7′ (19/11/2026): nhãn tốc độ phản ánh hàng hoá -> cổ phiếu VN; Gateway cũ (không có trường) -> không hiện gì.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "../../../../test/rtl-lite";
import TransmissionBadge, { SPEED_VI } from "./TransmissionBadge";

afterEach(cleanup);

describe("TransmissionBadge", () => {
  it("hiện đúng nhãn từng tốc độ, ghi chú bằng chứng khi cần", () => {
    const note = "Nhóm thép phản ánh CHẬM khoảng 1 tháng. Khám phá trong mẫu 2013–2019, chưa kiểm định ngoài mẫu.";
    const { container } = render(<TransmissionBadge item={{ transmission: { speed: "slow", noteVi: note } }} withNote />);
    const el = container.querySelector('[data-testid="commodity-transmission"]')!;
    expect(el.getAttribute("data-speed")).toBe("slow");
    expect(el.textContent).toContain("Phản ánh chậm (~1 tháng)");
    expect(el.textContent).toContain("chưa kiểm định ngoài mẫu");
    expect(Object.values(SPEED_VI)).toEqual(["Phản ánh ngay (≤ 1 phiên)", "Phản ánh chậm (~1 tháng)", "Không đo được tác động", "Chưa đo được"]);
  });
  it("không có trường transmission -> không hiện", () => {
    const { container } = render(<TransmissionBadge item={{ transmission: null }} />);
    expect(container.querySelector('[data-testid="commodity-transmission"]')).toBeNull();
  });
});
