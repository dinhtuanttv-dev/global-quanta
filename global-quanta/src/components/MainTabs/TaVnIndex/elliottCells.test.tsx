import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { ElliottCell } from "./ElliottCells";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const render = (ui: React.ReactElement) => { const el = document.createElement("div"); const r = createRoot(el); act(() => r.render(ui)); return { el, r }; };

describe("EP6 — cột Elliott trong bảng lọc", () => {
  it("đã kích hoạt: nổi bật kèm ngày; chờ kích hoạt: mờ; không có: gạch ngang", () => {
    const base = { template: "wave3", title: "Sóng 3", dir: 1 as const, level: 2, trigger: 10, target1: 12, invalidation: 9, loggedAt: "2026-10-20" };
    const a = render(<ElliottCell row={{ ...base, state: "triggered", triggeredAt: "2026-10-23" }} />);
    expect(a.el.textContent).toBe("Sóng 3 ↑đã kích hoạt 10-23");
    expect(a.el.querySelector("[data-testid=elliott-cell]")!.className).not.toMatch(/opacity-60/);
    expect(a.el.querySelector("[data-testid=elliott-cell]")!.getAttribute("title")).toMatch(/không phải khuyến nghị/);
    const w = render(<ElliottCell row={{ ...base, state: "waiting", triggeredAt: null }} />);
    expect(w.el.textContent).toMatch(/Chờ kích hoạt/); expect(w.el.querySelector("[data-testid=elliott-cell]")!.className).toMatch(/opacity-60/);
    expect(render(<ElliottCell row={undefined} />).el.textContent).toBe("—");
    act(() => { a.r.unmount(); w.r.unmount(); });
  });
});
