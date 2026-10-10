// Lớp tương thích tối thiểu với @testing-library/react cho các test nhập từ gói ngoài (locnganh-timing-engine) — dự án
// không cài testing-library/jsdom; dùng react-dom/client + happy-dom sẵn có. Chỉ các API mà các test đó dùng.
import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mounted: { root: Root; el: HTMLElement }[] = [];

export function render(ui: ReactElement) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(ui));
  mounted.push({ root, el });
  return { container: el, rerender: (next: ReactElement) => act(() => root.render(next)), unmount: () => act(() => root.unmount()) };
}

export function cleanup() {
  while (mounted.length) { const m = mounted.pop()!; act(() => m.root.unmount()); m.el.remove(); }
}

const byTestId = (id: string) => Array.from(document.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`));
const matches = (el: Element, t: string | RegExp) => { const s = el.textContent ?? ""; return typeof t === "string" ? s.trim() === t : t.test(s); };

export const screen = {
  getByTestId(id: string): HTMLElement {
    const all = byTestId(id);
    if (all.length !== 1) throw new Error(`getByTestId("${id}"): tìm thấy ${all.length} phần tử`);
    return all[0];
  },
  getAllByTestId(id: string): HTMLElement[] {
    const all = byTestId(id);
    if (!all.length) throw new Error(`getAllByTestId("${id}"): không có phần tử`);
    return all;
  },
  queryByTestId(id: string): HTMLElement | null {
    const all = byTestId(id);
    if (all.length > 1) throw new Error(`queryByTestId("${id}"): tìm thấy ${all.length} phần tử`);
    return all[0] ?? null;
  },
  queryAllByTestId: (id: string): HTMLElement[] => byTestId(id),
  getByText(t: string | RegExp): HTMLElement {
    // phần tử sâu nhất có nội dung khớp
    const all = Array.from(document.body.querySelectorAll<HTMLElement>("*")).filter((el) => matches(el, t) && !Array.from(el.children).some((c) => matches(c, t)));
    if (all.length !== 1) throw new Error(`getByText(${String(t)}): tìm thấy ${all.length} phần tử`);
    return all[0];
  },
};

const fire = (el: Element, type: string, init: MouseEventInit = {}) => act(() => { el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...init })); });
export const fireEvent = {
  click: (el: Element) => fire(el, "click"),
  // React gắn onMouseEnter/onMouseLeave qua mouseover/mouseout ở root (giống testing-library)
  mouseEnter: (el: Element) => fire(el, "mouseover", { relatedTarget: document.body }),
  mouseLeave: (el: Element) => fire(el, "mouseout", { relatedTarget: document.body }),
};
