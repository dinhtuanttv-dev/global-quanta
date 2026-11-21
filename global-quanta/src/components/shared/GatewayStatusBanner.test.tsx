import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetGatewayResilience, createResilientFetch } from "../../services/gatewayResilience";
import GatewayStatusBanner from "./GatewayStatusBanner";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let el: HTMLDivElement;
const q = () => el.querySelector('[data-testid="gateway-status"]');
beforeEach(async () => {
  __resetGatewayResilience();
  el = document.createElement("div"); document.body.appendChild(el);
  await act(async () => { createRoot(el).render(<GatewayStatusBanner />); });
});
afterEach(() => { el.remove(); vi.useRealTimers(); });

describe("Băng thông báo gián đoạn máy chủ dữ liệu", () => {
  it("bình thường: không hiện gì", () => { expect(q()).toBeNull(); });

  it("Gateway sập 3 lần trong 1 phút: hiện thông báo chung; hồi phục: báo đã kết nối lại rồi tự ẩn", async () => {
    let fail = true;
    const f = createResilientFetch({ base: "https://gw.test", fetchImpl: async () => { if (fail) throw new TypeError("x"); return new Response("{}", { headers: { "content-type": "application/json" } }); }, caches: null, now: Date.now });
    await act(async () => { for (let i = 0; i < 3; i++) await f("https://gw.test/a").catch(() => {}); });
    expect(q()?.getAttribute("data-mode")).toBe("down");
    expect(q()?.textContent).toContain("Máy chủ dữ liệu đang gián đoạn");
    expect(q()?.getAttribute("role")).toBe("status");
    vi.useFakeTimers();
    fail = false;
    await act(async () => { await f("https://gw.test/a"); });
    expect(q()?.getAttribute("data-mode")).toBe("recovered");
    await act(async () => { vi.advanceTimersByTime(7_000); });
    expect(q()).toBeNull();
  });

  it("mất mạng trên thiết bị: báo riêng", async () => {
    await act(async () => { window.dispatchEvent(new Event("offline")); });
    expect(q()?.getAttribute("data-mode")).toBe("offline");
    await act(async () => { window.dispatchEvent(new Event("online")); });
    expect(q()).toBeNull();
  });
});
