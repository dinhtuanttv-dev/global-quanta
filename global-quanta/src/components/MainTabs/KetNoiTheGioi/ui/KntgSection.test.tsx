// G3 (19/11/2026): thu gọn trong chỗ — máy tính luôn mở; điện thoại mặc định theo openOnMobile, nhớ lựa chọn; nội dung luôn trong DOM.
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import KntgSection from "./KntgSection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const setMobile = (m: boolean) => { window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: m && q.includes("max-width"), media: q, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia; };
const mount = async (node: React.ReactNode) => { const el = document.createElement("div"); document.body.appendChild(el); await act(async () => { createRoot(el).render(node); }); return el; };

beforeEach(() => { try { localStorage.clear(); } catch { /* */ } });
afterEach(() => { document.body.innerHTML = ""; });

describe("KntgSection", () => {
  it("máy tính: luôn mở; nội dung trong DOM", async () => {
    setMobile(false);
    const el = await mount(<KntgSection id="a" title="Tin" summary="mô tả"><p data-testid="body">−13,3%</p></KntgSection>);
    expect(el.querySelector("details")!.open).toBe(true);
    expect(el.querySelector('[data-testid="body"]')!.textContent).toBe("−13,3%");
  });
  it("điện thoại: mặc định đóng (trừ openOnMobile), nội dung vẫn trong DOM; mở thì được nhớ", async () => {
    setMobile(true);
    const el = await mount(<><KntgSection id="x" title="Tin" summary="mô tả"><p data-testid="b1">1</p></KntgSection><KntgSection id="y" title="Kịch bản" summary="m" openOnMobile><p>2</p></KntgSection></>);
    const [d1, d2] = [...el.querySelectorAll("details")];
    expect(d1.open).toBe(false); expect(d2.open).toBe(true);
    expect(el.querySelector('[data-testid="b1"]')).not.toBeNull();
    await act(async () => { d1.open = true; d1.dispatchEvent(new Event("toggle")); });
    expect(JSON.parse(localStorage.getItem("gq.world.sections.v1")!)).toEqual({ x: true });
    document.body.innerHTML = "";
    const again = await mount(<KntgSection id="x" title="Tin" summary="mô tả"><p>1</p></KntgSection>);
    expect(again.querySelector("details")!.open).toBe(true);
  });
});
