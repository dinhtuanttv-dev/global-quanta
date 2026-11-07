import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let shadow: unknown = null;
vi.mock("../../../hooks/elite10/useEliteCenter", () => ({ useEliteToShadow: () => ({ data: shadow }) }));
const { default: EliteToShadowCard } = await import("./EliteToShadowCard");
const base = { version: "ELITE-TO-v1 (prereg 7017cb7)", start: "2026-11-09", updatedAt: null, rule: { start: "2026-11-09", minDays: 60, sleeveSlot: 0.1, sleeveMax: 2 },
  ex: { n: 0, stats: { n: 0, mean: null, ci95: [null, null], hit: null }, looks: [], nextLook: 30, ref: { mean: -0.0287, ci95: [-0.0371, -0.0209], n: 129 }, label: "THĂM DÒ" }, label: "THĂM DÒ" };
const mount = async () => { const el = document.createElement("div"); document.body.appendChild(el); await act(async () => { createRoot(el).render(<EliteToShadowCard />); }); return el; };

describe("Sổ ảo Elite × Săn cổ tức (COMP-r1 / DIV-IC / EX-r1)", () => {
  afterEach(() => { document.body.innerHTML = ""; });
  it("chưa có phiên: ghi rõ ngày bắt đầu + tham chiếu EX-r1, nhãn THĂM DÒ", async () => {
    shadow = { ...base, days: 0, from: null, to: null, nav: {}, maxDD: {}, delta: {}, curve: [], recent: [], compVerdict: "CHƯA ĐỦ MẪU", ic: { days: 0, mean: null, t: null, verdict: "CHƯA ĐỦ MẪU" }, guardDays: 0, sleeveDays: 0 };
    const el = await mount();
    expect(el.querySelector('[data-testid="elite-to-shadow-empty"]')!.textContent).toContain("09/11/2026");
    expect(el.querySelector('[data-testid="elite-to-shadow-ex"]')!.textContent).toContain("−2,87%");
    expect(el.textContent).toContain("THĂM DÒ");
  });
  it("có dữ liệu: 4 biến thể, đóng góp từng lớp có khoảng tin cậy, kết luận CHƯA ĐỦ MẪU", async () => {
    const st = (m: number) => ({ mean: m, ci95: [m - 0.001, m + 0.001] as [number, number], total: m * 10 });
    shadow = { ...base, days: 10, from: "2026-11-09", to: "2026-11-20", nav: { core: 0.01, guard: 0.012, sleeve: 0.015, comp: 0.017, vn: 0.005 }, maxDD: { core: -0.02, guard: -0.019, sleeve: -0.02, comp: -0.018 },
      delta: { guard: st(0.0002), sleeve: st(0.0005), comp: st(0.0007) }, guardDays: 2, sleeveDays: 4, compVerdict: "CHƯA ĐỦ MẪU", ic: { days: 5, mean: 0.02, t: 1.1, verdict: "CHƯA ĐỦ MẪU" },
      curve: [["2026-11-10", 1.001, 1, 1.0005], ["2026-11-20", 1.017, 1, 1.01]], recent: [] };
    const el = await mount();
    expect(el.querySelector('[data-testid="elite-to-shadow-stats"]')!.textContent).toContain("+1,70%");
    expect(el.querySelector('[data-testid="elite-to-shadow-verdict"]')!.textContent).toContain("CHƯA ĐỦ MẪU");
    expect(el.textContent).toContain("4 phiên có hoạt động");
    expect(el.querySelector('[data-testid="to-equity"]')).not.toBeNull();
  });
});
