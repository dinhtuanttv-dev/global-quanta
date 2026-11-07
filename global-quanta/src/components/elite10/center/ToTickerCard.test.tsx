import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("../../../hooks/useCorpEvents", () => ({
  useToOverview: () => ({ data: { label: "THĂM DÒ", reference: { postEx: { "≥5%": { n: 129, mean: -0.0287, ci95: [-0.0371, -0.0209], hit: 0.2 } } },
    radar: { rows: [{ t: "HPA", cash: 1800, yieldPre: 0.066, yieldNow: 0.065, disclosed: "2026-10-30", ex: "2026-11-11", lastCumDate: "2026-11-10", sessionsLeft: 1, t2Ok: false, qualifies: true, runUp: 0.02, bucket: "≥5%",
      expected: { n: 119, mean: 0.0176, ci95: [0.0081, 0.028], hit: 0.647 } }] } } }),
  useToTicker: (t: string) => ({ data: { ticker: t, sector: null, events: [{ ex: "2025-11-10", disclosed: "2025-10-28", cash: 1500, y: 0.06, bucket: "≥5%", adv: 2e9, entryDate: "2025-10-29", limitUp: false, qualifies: true,
    outcome: { exitDate: "2025-11-07", excess: 0.031, abs: 0.04 }, postEx5: { date: "2025-11-14", excess: -0.042 }, runUp: 0.03 }] }, error: null }),
}));
const { default: ToTickerCard } = await import("./ToTickerCard");

describe("Hồ sơ 360° — Sự kiện cổ tức (Elite × TO)", () => {
  it("đợt đang diễn ra + lịch sử: kết quả TO tới phiên cuối còn quyền và phần giữ qua GDKHQ", async () => {
    const el = document.createElement("div"); document.body.appendChild(el);
    await act(async () => { createRoot(el).render(<ToTickerCard ticker="HPA" />); });
    const live = el.querySelector('[data-testid="elite-to-live"]')!.textContent!;
    expect(live).toContain("đủ điều kiện TO-r1"); expect(live).toContain("không kịp T+2"); expect(live).toContain("−2,87%");
    const hist = el.querySelector('[data-testid="elite-to-history"]')!.textContent!;
    expect(hist).toContain("+3,1%"); expect(hist).toContain("−4,2%");
    expect(el.textContent).not.toMatch(/nên mua|mua ngay/i);
  });
});
