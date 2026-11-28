// TA-T5 — hộp "Chỉ báo": tìm (có / không dấu, tên tiếng Anh), bật / tắt qua LayerManager, mở thẳng tham số; lớp nào cũng có trong danh mục.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import IndicatorPicker, { CATALOG } from "./IndicatorPicker";
import { DEFAULT_LAYER_STATE, type LayerKey } from "../../../../lib/ta-command-center/LayerManager";
import { DEFAULT_INDICATORS } from "./indicatorSettings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; });

function mount(onToggle: (k: LayerKey) => void, focus: LayerKey | null = null) {
  const el = document.createElement("div"); document.body.appendChild(el);
  root = createRoot(el);
  const settings = { value: DEFAULT_INDICATORS, onChange: () => {}, ticker: "FPT", anchor: null, onPickAnchor: () => {}, onClearAnchor: () => {} };
  act(() => root!.render(<IndicatorPicker open onClose={() => {}} state={{ ...DEFAULT_LAYER_STATE, rsi: true }} onToggle={onToggle} settings={settings} focus={focus} />));
  return el;
}
const type = (input: HTMLInputElement, v: string) => act(() => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, v);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});
const items = (el: HTMLElement) => [...el.querySelectorAll("[data-picker-item]")].map((x) => x.getAttribute("data-picker-item"));

describe("TA-T5 — hộp Chỉ báo", () => {
  it("mọi lớp hiển thị (trừ công tắc nội bộ / lớp Elliott cũ) đều có trong danh mục, không trùng", () => {
    const keys = CATALOG.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of ["stoch", "stochRsi", "atr", "obv", "mfi", "psar", "rsi", "macd", "maSet", "bollinger", "ichimoku"] as LayerKey[]) expect(keys).toContain(k);
  });
  it("tìm theo tên tiếng Anh và tiếng Việt không dấu", () => {
    const el = mount(() => {});
    const input = el.ownerDocument.querySelector("[data-testid=indicator-search]") as HTMLInputElement;
    type(input, "stoch");
    expect(items(el.ownerDocument.body)).toEqual(["stoch", "stochRsi"]);
    type(input, "khoi luong");
    expect(items(el.ownerDocument.body)).toContain("volume");
    type(input, "zzz");
    expect(items(el.ownerDocument.body)).toEqual([]);
  });
  it("công tắc gọi onToggle đúng lớp; trạng thái bật hiện aria-pressed", () => {
    const onToggle = vi.fn();
    mount(onToggle);
    const sw = document.querySelector("[data-picker-layer=rsi]") as HTMLButtonElement;
    expect(sw.getAttribute("aria-pressed")).toBe("true");
    act(() => sw.click());
    expect(onToggle).toHaveBeenCalledWith("rsi");
  });
  it("mở thẳng tham số (nút ⚙ trên chú giải): MA hiện 4 đường chu kỳ + EMA/SMA", () => {
    mount(() => {}, "maSet");
    expect(document.querySelector("[data-testid=settings-form-ma]")).not.toBeNull();
    expect(document.querySelector("[data-testid=set-ma-p4]")).not.toBeNull();
  });
});
