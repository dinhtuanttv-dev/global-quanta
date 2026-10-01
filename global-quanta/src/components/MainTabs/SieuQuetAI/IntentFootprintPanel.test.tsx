import { act } from "react";
import { createRoot } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, describe, expect, it, vi } from "vitest";
import IntentFootprintPanel from "./IntentFootprintPanel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const labels = ["ATO", "09:15", "09:30", "09:45", "10:00", "10:15", "10:30", "10:45", "11:00", "11:15", "13:00", "13:15", "13:30", "13:45", "14:00", "14:15", "ATC"];
const states = [
  ["ACC_ACTIVE", "Gom chủ động"], ["ACC_PASSIVE", "Gom thụ động / hấp thụ"], ["DIST_ACTIVE", "Xả chủ động"],
  ["DIST_PASSIVE", "Xả thụ động / kê bán chặn"], ["NEUTRAL", "Trung tính / nhỏ lẻ chi phối"],
];
const sw = (z: number, reading: string) => ({ z, percentile: 90, intensity: 0.12, quietness: 0.8, persistence: 0.8, ret: 0.4, reading });

const fixture = {
  symbol: "PVT", live: false, viewDate: "2026-10-01", ready: true, method: "BVC", methodNote: "BVC từ nến phút.", sessions: 113, largeMinuteThreshold: 25_000,
  lambda: { bucket: 0.002, recent5: 0.004, ratio: 2, daily: 0.01 },
  today: {
    volume: 7_820_000, delta: 450_000, largeDelta: 600_000, smallDelta: -150_000, deltaPct: 5.8,
    buckets: labels.map((l, i) => ({
      bucket: i, label: l, volume: 100_000, delta: i === 0 || i === 16 ? null : (i % 3 === 0 ? -20_000 : 30_000), deltaPct: 0.2, ret: 0.001,
      zEffort: 1, zResult: 0.2, zLarge: 0.5, rvol: 1, flags: i === 5 ? ["absorbSelling"] : i === 7 ? ["initiativeBuy"] : [],
      intent: { id: i === 7 ? "ACC_ACTIVE" : "NEUTRAL", label: "x", p: 0.6 },
    })),
  },
  sessionIntent: { date: "2026-10-01", probs: [], top: { id: "DIST_ACTIVE", label: "Xả chủ động", p: 0.62 }, confident: true },
  intentBucket: "14:15",
  intent: { probs: states.map(([id, label], i) => ({ id, label, p: [0.55, 0.15, 0.05, 0.05, 0.2][i] })), top: { id: "ACC_ACTIVE", label: "Gom chủ động", p: 0.55 }, confident: true },
  dailyIntent: Array.from({ length: 20 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, "0")}`, id: i % 4 === 0 ? "ACC_PASSIVE" : "NEUTRAL", label: "x", p: 0.6, deltaPctAdv: 3, ret: 0.2 })),
  stealth: { s1: sw(0.4, "Không rõ rệt"), s5: sw(1.8, "Gom âm thầm"), s20: sw(-0.3, "Không rõ rệt") },
  bigSmall: { series: Array.from({ length: 20 }, (_, i) => ({ date: `d${i}`, large: i * 0.01, small: -i * 0.008 })), cumLarge: 0.19, cumSmall: -0.152, divergent: true, reading: "Tay to gom trong khi tay nhỏ bán" },
  execution: { intraPersistence: 0.31, dailyPersistence: 0.22, hurst: 0.64, participationCV: 0.28, alignedBuckets: 9, clipRegularity: null, samePriceClusters: [{ time: "10:30", price: 23750, volume: 180_000, side: "mua" }] },
  flagLabels: { absorbSelling: "Hấp thụ lực bán", initiativeBuy: "Mua chủ động đẩy giá" },
  validation: {
    generatedAt: "2026-10-02", samples: 51_234, symbols: 281, from: "2026-01-05", to: "2026-09-24", horizonDays: 5, barrierAtr: 1.5, base: { up: 0.31, down: 0.3 },
    states: states.map(([id, label], i) => ({ id, label, n: 4000, upRate: 0.35, downRate: 0.28, liftUp: 0.04, liftDown: -0.02, significantUp: i === 0, significantDown: false, stableUp: i === 0, stableDown: false,
      verdict: i === 0 ? "Có bằng chứng: tăng xác suất chạm rào TRÊN" : "Chưa đủ bằng chứng", validated: i === 0 })),
    method: "HMM lọc tiến…",
  },
  disclaimer: "IFE là suy luận xác suất.",
};

describe("IntentFootprintPanel", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("hiển thị trạng thái ý đồ, dải delta có cờ, stealth, tay to/nhỏ, chữ ký thực thi và kiểm chứng", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => fixture })));
    const el = document.createElement("div");
    const root = createRoot(el);
    await act(async () => { root.render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><IntentFootprintPanel symbol="PVT" /></SWRConfig>); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    const t = el.textContent ?? "";
    expect(t).toContain("Bản đồ ý đồ dòng tiền (IFE)");
    expect(t).toContain("BVC (nến phút)");
    expect(t).toContain("Gom chủ động");
    expect(t).toContain("Cả phiên 2026-10-01");
    expect(t).toContain("Xả chủ động · 62%");
    expect(t).toContain("Khung gần nhất (14:15)");
    expect(t).toContain("55%");
    expect(t).toContain("✓ Có bằng chứng: tăng xác suất chạm rào TRÊN");
    expect(t).toContain("Gom âm thầm");
    expect(t).toContain("Tay to gom trong khi tay nhỏ bán");
    expect(t).toContain("thanh khoản mỏng đi");
    expect(t).toContain("cần tick (Lee–Ready)");
    expect(t).toContain("10:30");
    expect(t).toContain("281 mã");
    const strip = el.querySelector('svg[aria-label="Dòng lệnh có dấu theo 17 khung trong phiên"]')!;
    expect(strip.textContent).toContain("◇");
    expect(strip.textContent).toContain("▲");
    act(() => root.unmount());
  });

  it("chưa đủ dữ liệu thì nói rõ lý do", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ symbol: "X", ready: false, reason: "Cần ≥ 30 phiên có nến phút, mới có 4.", live: false, viewDate: "", disclaimer: "" }) })));
    const el = document.createElement("div");
    const root = createRoot(el);
    await act(async () => { root.render(<SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}><IntentFootprintPanel symbol="X" /></SWRConfig>); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(el.textContent).toContain("Cần ≥ 30 phiên");
    act(() => root.unmount());
  });
});
