// Một thành phần lỗi khi vẽ -> thẻ lỗi tại chỗ, phần còn lại của trang vẫn chạy; đổi resetKey (đổi tab) tự thử lại.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "../../test/rtl-lite";
import SectionBoundary from "./SectionBoundary";

let boom = true;
function Bomb() { if (boom) throw new Error("dữ liệu hỏng"); return <span data-testid="ok">OK</span>; }
afterEach(() => cleanup());

describe("SectionBoundary", () => {
  it("lỗi trong vùng -> thẻ lỗi, vùng bên cạnh vẫn hiện; đổi resetKey -> vẽ lại", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    boom = true;
    const r = render(<div><SectionBoundary label="tab Elite 10" resetKey="a"><Bomb /></SectionBoundary><span data-testid="other">BÊN CẠNH</span></div>);
    expect(screen.getByTestId("section-error").textContent).toContain("Không hiển thị được tab Elite 10");
    expect(screen.getByTestId("section-error").textContent).toContain("dữ liệu hỏng");
    expect(screen.getByTestId("other").textContent).toBe("BÊN CẠNH");
    expect(JSON.parse(localStorage.getItem("gq.lastUiError")!).label).toBe("tab Elite 10");
    boom = false;
    r.rerender(<div><SectionBoundary label="tab Elite 10" resetKey="b"><Bomb /></SectionBoundary><span data-testid="other">BÊN CẠNH</span></div>);
    expect(screen.getByTestId("ok").textContent).toBe("OK");
  });
});
