import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../hooks/useSieuQuetScanner", () => ({
  useSieuQuetScanner: () => ({ items: [{ ticker: "FPT", industry: "Công nghệ" }, { ticker: "VNM", industry: "Thực phẩm" }] }),
}));

import TickerSelector, { DEFAULT_TA_SYMBOL } from "./TickerSelector";
import { PRICE_BASIS_LABEL, TA_SERIES_LIMIT } from "../../../hooks/useTaSeries";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const roots: ReturnType<typeof createRoot>[] = [];
async function render(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push(root);
  await act(async () => { root.render(node); });
  return el;
}
afterEach(() => { act(() => { for (const r of roots.splice(0)) r.unmount(); }); document.body.innerHTML = ""; });

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("TA VN-Index P1 — chọn VN-Index / chỉ số / mã bất kỳ", () => {
  it("mặc định VNINDEX; nút chỉ số chọn được VN30; gợi ý có cả chỉ số", async () => {
    expect(DEFAULT_TA_SYMBOL).toBe("VNINDEX");
    const onChange = vi.fn();
    const el = await render(<TickerSelector ticker="VNINDEX" onChange={onChange} />);
    const vn30 = [...el.querySelectorAll("button")].find((b) => b.textContent === "VN30")!;
    await act(async () => { vn30.click(); });
    expect(onChange).toHaveBeenLastCalledWith("VN30");
    expect(el.querySelector('button[aria-pressed="true"]')?.textContent).toBe("VN-Index");

    const input = el.querySelector("input")!;
    await act(async () => { type(input, "vn"); });
    expect([...el.querySelectorAll(".ta-ticker-suggest-item")].map((d) => d.textContent)).toEqual(
      expect.arrayContaining(["VNINDEX Chỉ số", "VNM Thực phẩm"]),
    );
  });

  it("Enter: mã hợp lệ ngoài danh sách vẫn mở được; chuỗi sai chọn gợi ý đầu tiên", async () => {
    const onChange = vi.fn();
    const el = await render(<TickerSelector ticker="VNINDEX" onChange={onChange} />);
    const input = el.querySelector("input")!;
    await act(async () => { type(input, "hpg"); });
    await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith("HPG");
    await act(async () => { type(input, "fp"); });
    await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    expect(onChange).toHaveBeenLastCalledWith("FPT");
  });

  it("cơ sở giá có nhãn rõ ràng; chuỗi ~3 năm phiên D", () => {
    expect(PRICE_BASIS_LABEL.ADJUSTED_CUMULATIVE).toBe("Giá điều chỉnh cộng dồn");
    expect(PRICE_BASIS_LABEL.SSI_LATEST_EVENT_ADJUSTED).toMatch(/gần nhất/);
    expect(TA_SERIES_LIMIT).toBe(750);
  });
});
