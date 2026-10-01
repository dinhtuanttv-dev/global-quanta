import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import IntradayCyclePanel from "./IntradayCyclePanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const labels = ["ATO", "09:15", "09:30", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "13:00", "13:15", "13:30", "13:45", "14:00", "14:15", "ATC"];
const prob = (p: number, n = 40, enough = true) => ({ p, low: Math.max(0, p - 0.1), high: Math.min(1, p + 0.1), n, k: Math.round(p * n), enough });
const cells = ["up", "flat", "down"].flatMap((d) => ["low", "norm", "high"].map((v) => `${d}:${v}`));

function fixture(validated: boolean) {
  return {
    symbol: "FPT", viewDate: "2026-10-02", live: true, ready: true, sessions: 120, from: "2026-04-01", to: "2026-10-01",
    buckets: labels.map((l, i) => ({ id: `B${i}`, label: l })),
    profile: labels.map((l) => ({ id: l, label: l, median: 100_000, p25: 70_000, p75: 140_000, medianRange: 0.004, cumShare: 0.5, cumShareP25: 0.4, cumShareP75: 0.6, medianCumVolume: 500_000 })),
    validation: { evaluatedSessions: 90, surge: { brierSkill: validated ? 0.08 : -0.02, samples: 1400, events: 160 }, dry: { brierSkill: 0.03, samples: 1400, events: 120 }, calibration: [], validated: { surge: validated, dry: true } },
    current: {
      date: "2026-10-02", lastBucket: 4, inProgress: true, sessionDone: false, cumVolume: 900_000, timeAdjustedRvol: 1.6,
      projectedVolume: 2_400_000, projectedRange: [2_000_000, 2_900_000],
      bucketRvol: labels.map((_, i) => (i <= 4 ? [0.4, 1, 2.3, 1.1, 0.9][i] : null)),
      state: { priceBin: "P+", priceLabel: "tăng 0,5–2%", vwapPos: "Vup", rvolBin: "Rhigh", rvolLabel: "KL lũy kế cao", changePct: 1.2, cumRvol: 1.6 },
      next: { bucket: 5, label: "10:15", surge: prob(0.62, 48), dry: prob(0.09, 48), up: prob(0.4), down: prob(0.3), baseline: { surge: 0.18, dry: 0.15, up: 0.35, down: 0.33 } },
      cell: "up:high",
      transitionsFromCell: { n: 52, to: Object.fromEntries(cells.map((c) => [c, prob(c === "up:high" ? 0.3 : 0.0875)])) },
      enterHighUpWithin2: 0.47, enterHighDownWithin2: 0.12,
      buckets: labels.map((_, i) => (i <= 4 ? { volume: 100_000 * [0.4, 1, 2.3, 1.1, 0.9][i], open: 1, high: 1, low: 1, close: 1 } : null)),
    },
    disclaimer: "Xác suất là tần suất lịch sử có điều kiện đã làm mượt và kiểm định walk-forward; không phải dự báo chắc chắn.",
  };
}

async function render(body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => body })));
  const el = document.createElement("div");
  const root = createRoot(el);
  await act(async () => {
    root.render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><IntradayCyclePanel symbol="FPT" /></SWRConfig>);
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return { el, root };
}

describe("IntradayCyclePanel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("hiển thị dải 17 khung, khung kế tiếp với xác suất kèm n/khoảng tin cậy, ma trận và dự phóng", async () => {
    const { el, root } = await render(fixture(true));
    expect(el.textContent).toContain("Khung kế tiếp 10:15");
    expect(el.textContent).toContain("62%");
    expect(el.textContent).toContain("n=48");
    expect(el.textContent).toContain("Đã kiểm định walk-forward 90 phiên");
    expect(el.textContent).toContain("Dự phóng cuối phiên");
    expect(el.textContent).toContain("2.40 tr");
    expect(el.textContent).toContain("Ma trận giá – khối lượng");
    expect(el.textContent).toContain("47%");
    expect(el.querySelectorAll('svg[aria-label^="Nhịp khối lượng"] text').length).toBeGreaterThan(5);
    act(() => root.unmount());
  });

  it("chưa vượt mức nền thì cảnh báo 'chưa đủ tin cậy' thay vì khẳng định", async () => {
    const { el, root } = await render(fixture(false));
    expect(el.textContent).toContain("Chưa đủ tin cậy");
    expect(el.textContent).not.toContain("Đã kiểm định");
    act(() => root.unmount());
  });

  it("chưa đủ dữ liệu lịch sử thì nói rõ lý do", async () => {
    const { el, root } = await render({ symbol: "XYZ", ready: false, reason: "Cần ≥ 20 phiên có nến phút, mới có 3.", sessions: 3, viewDate: "2026-10-02", live: false, disclaimer: "" });
    expect(el.textContent).toContain("Cần ≥ 20 phiên");
    act(() => root.unmount());
  });
});
