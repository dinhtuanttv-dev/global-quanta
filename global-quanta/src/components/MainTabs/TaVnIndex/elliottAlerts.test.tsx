import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";

vi.stubEnv("VITE_MARKET_GATEWAY_ENABLED", "true");
vi.stubEnv("VITE_MARKET_API_BASE_URL", "https://gw.test");
const { default: ElliottAlertsPanel } = await import("./ElliottAlertsPanel");
const { suggestAlerts } = await import("../../../lib/quant-core/elliott/alertSuggestions");
const { elliottState } = await import("../../../lib/quant-core/elliott");
import type { OhlcvBar } from "../../../lib/ta-command-center/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.unstubAllGlobals(); });
beforeEach(() => { localStorage.clear(); localStorage.setItem("gq_session_v2", JSON.stringify({ access_token: "acc", refresh_token: "r", expires_at: Date.now() + 600_000, user: { id: "u1", email: "a@b.c", admin: false, mustChangePassword: false } })); });

const day = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
const legsFn = (legs: number[][]) => (i: number) => {
  for (let k = 1; k < legs.length; k++) if (i <= legs[k][0]) { const [i0, p0] = legs[k - 1], [i1, p1] = legs[k]; return p0 + ((p1 - p0) * (i - i0)) / (i1 - i0); }
  return legs[legs.length - 1][1];
};
function bars(n: number, f: (i: number) => number, off = 0): OhlcvBar[] {
  return Array.from({ length: n }, (_, i) => { const c = f(i); return { date: day(i + off), open: c * 0.998, high: c * 1.006, low: c * 0.994, close: c, volume: 1000 }; });
}
const COMPLETE = [[0, 100], [20, 120], [30, 110], [55, 145], [65, 133], [80, 151], [92, 136], [100, 142], [110, 139]];
const series = () => [...bars(60, (i) => 100 + Math.sin(i / 3) * 1.5), ...bars(111, legsFn(COMPLETE), 60)];

describe("DW10 — gợi ý mốc cảnh báo", () => {
  it("cách đếm tự động: mốc vô hiệu (nếu có) + vùng đích; cách đếm của tôi: mốc vô hiệu theo sóng cuối", () => {
    const b = series(), st = elliottState(b)!;
    const s = suggestAlerts(st, { dailyBars: b });
    expect(s.some((x) => x.kind === "target" && x.condition.type === "zone")).toBe(true);
    if (st.invalidation) expect(s.find((x) => x.kind === "invalidation")!.condition).toMatchObject({ type: "level", price: st.invalidation.price });
    const mine = suggestAlerts(st, { mine: [{ date: day(0), price: 100, label: "0" }, { date: day(10), price: 110, label: "1" }, { date: day(20), price: 104, label: "2" }] });
    expect(mine).toEqual([{ key: "mine-inv", kind: "invalidation", label: expect.stringMatching(/cách đếm của tôi/), condition: { type: "level", price: 100, side: "below" } }]);
    expect(suggestAlerts(null)).toEqual([]);
  });
});

describe("DW10 — bảng cảnh báo", () => {
  it("bấm 'Bật' -> PUT danh sách có cảnh báo mới (Telegram tắt với tài khoản thường); hiện lần báo + số chưa đọc", async () => {
    const b = series(), st = elliottState(b)!;
    const calls: { url: string; init?: RequestInit }[] = [];
    let alerts: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (init?.method === "PUT") alerts = JSON.parse(init.body as string).alerts;
      return { ok: true, status: 200, json: async () => ({ alerts, events: [{ id: "e1", alertId: "x", symbol: "FPT", kind: "target", price: 140, message: "Elliott FPT: giá 140 vào vùng", firedAt: "2026-10-23T03:00:00Z", read: false }], unread: 1, disclaimer: "không phải khuyến nghị" }) };
    }));
    const el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
    await act(async () => { root!.render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><ElliottAlertsPanel ticker="FPT" timeframe="D" state={st} mine={null} dailyBars={b} /></SWRConfig>); });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const panel = el.querySelector("[data-testid=elliott-alerts]")!;
    expect(panel.textContent).toMatch(/1 chưa đọc/);
    expect(el.querySelector("[data-testid=elliott-alert-events]")!.textContent).toMatch(/giá 140/);
    const btn = el.querySelector("[data-testid^=elliott-alert-]:not([data-testid=elliott-alert-events])") as HTMLButtonElement;
    await act(async () => { btn.click(); await new Promise((r) => setTimeout(r, 20)); });
    const put = calls.find((c) => c.init?.method === "PUT")!;
    expect(put.url).toBe("https://gw.test/api/market/elliott/alerts");
    const body = JSON.parse(put.init!.body as string);
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0]).toMatchObject({ symbol: "FPT", enabled: true, oneShot: true, channels: { telegram: false } });
    expect((put.init!.headers as Record<string, string>).authorization).toBe("Bearer acc");
  });
});
