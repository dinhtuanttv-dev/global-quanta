import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SWRConfig } from "swr";

vi.stubEnv("VITE_MARKET_GATEWAY_ENABLED", "true");
vi.stubEnv("VITE_MARKET_API_BASE_URL", "https://gw.test");
const { ElliottLedgerSummary, ElliottScenarioList } = await import("./ElliottScenarioList");
import type { EwScenario } from "../../../lib/quant-core/elliott/v3/scenarios";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => { act(() => root?.unmount()); root = null; document.body.innerHTML = ""; vi.unstubAllGlobals(); });
const mount = async (ui: React.ReactElement) => {
  const el = document.createElement("div"); document.body.appendChild(el); root = createRoot(el);
  await act(async () => { root!.render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>{ui}</SWRConfig>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  return el;
};
const sc = (over: Partial<EwScenario> = {}): EwScenario => ({
  id: "FPT|wave3|2|a", template: "wave3", role: "primary", level: 2, dir: 1, title: "Sóng 3", anchors: [], createdAt: "2026-10-01", provisional: false,
  trigger: { price: 120, line: null, text: "Đóng cửa vượt 1 120" }, targets: [{ price: 142, label: "161,8%" }, { price: 162, label: "261,8%" }],
  invalidation: { price: 110, text: "Thủng cuối sóng 2 110" }, expiry: { waitBars: 60, runBars: 120 }, ...over,
});

describe("EP2 — giao diện kịch bản", () => {
  it("danh sách: vai trò, hướng, trạng thái vòng đời, mốc kích hoạt / mục tiêu / vô hiệu; kịch bản tạm có nhãn 'tạm'", async () => {
    const el = await mount(<ElliottScenarioList items={[
      { sc: sc(), lc: { state: "triggered", events: [{ type: "triggered", time: "2026-10-20", price: 121 }], triggerPrice: 121, barsEvaluated: 10 } },
      { sc: sc({ id: "b", role: "secondary", template: "waveC", title: "Sóng C", dir: -1, provisional: true, createdAt: null }), lc: { state: "waiting", events: [], triggerPrice: null, barsEvaluated: 0 } },
    ]} />);
    const items = el.querySelectorAll("[data-testid=elliott-scenario]");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toMatch(/Chính.*Sóng 3 ↑.*Đã kích hoạt/);
    expect(items[0].textContent).toMatch(/Đóng cửa vượt 1 120.*142.*162.*Thủng cuối sóng 2 110/);
    expect(items[1].textContent).toMatch(/Đang hình thành.*Sóng C ↓.*tạm/);
    expect((await mount(<ElliottScenarioList items={[]} />)).querySelector("[data-testid=elliott-scenarios-empty]")).not.toBeNull();
  });
  it("tóm tắt sổ: số kịch bản, so với chuẩn ngẫu nhiên, kết luận theo đăng ký trước", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, json: async () => ({
      total: 412, byState: { waiting: 300, triggered: 60, target1: 20, invalidated: 32 }, verdict: "chưa đủ mẫu", firstLogged: "2026-10-24",
      score: { n: 41, hits: 18, hitRate: 18 / 41, expectedRate: 0.4, z: 0.5 }, prereg: { minN: 100, zPass: 1.96, hypothesis: "H" } }) })));
    const el = await mount(<ElliottLedgerSummary />);
    const t = el.querySelector("[data-testid=elliott-ledger-summary]")!.textContent!;
    expect(t).toMatch(/Sổ theo dõi kịch bản \(từ 2026-10-24\): 412 kịch bản/);
    expect(t).toMatch(/43,9% so với ngẫu nhiên 40,0% \(41 kết thúc, z = 0,50\)/);
    expect(t).toMatch(/chưa đủ mẫu/);
  });
});
