import { describe, expect, it } from "vitest";
import { foreignByBar } from "../../../components/MainTabs/TaVnIndex/TVChartPanel";
import { foreignStats } from "../../../components/MainTabs/TaVnIndex/OrderFlowPanel";
import { DEFAULT_LAYER_STATE } from "../LayerManager";
import { analyze, type FlowMinute } from "../../quant-core";
import type { OhlcvBar } from "../types";

const day = (date: string, netVal: number) => ({ date, buyVal: Math.max(0, netVal), sellVal: Math.max(0, -netVal), netVal, room: 1e8 });

describe("P5 — Khối ngoại theo nến", () => {
  it("D: cùng ngày; W: cộng các ngày trong tuần; luỹ kế", () => {
    const d: OhlcvBar[] = ["2026-10-05", "2026-10-06"].map((date) => ({ date, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
    expect(foreignByBar(d, [day("2026-10-05", 5e9), day("2026-10-06", -2e9)])).toEqual([
      { date: "2026-10-05", net: 5e9, cum: 5e9 }, { date: "2026-10-06", net: -2e9, cum: 3e9 },
    ]);
    const w: OhlcvBar[] = ["2026-09-28", "2026-10-05"].map((date) => ({ date, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
    expect(foreignByBar(w, [day("2026-09-29", 1e9), day("2026-10-01", 2e9), day("2026-10-06", -4e9)]).map((x) => x.net)).toEqual([3e9, -4e9]);
  });

  it("thống kê: z20, chuỗi phiên ròng cùng chiều, tổng 5 phiên", () => {
    const days = Array.from({ length: 25 }, (_, i) => day(`2026-09-${String(i + 1).padStart(2, "0")}`, i >= 22 ? -3e9 : (i % 2 ? 1e9 : -1e9)));
    const s = foreignStats(days)!;
    expect(s.streak).toBe(3);
    expect(s.sum5).toBe(-3e9 * 3 + 1e9 + -1e9);
    expect(s.z20!).toBeLessThan(-2);
  });
});

describe("P5 — Order Flow trong analyze()", () => {
  const bars: OhlcvBar[] = Array.from({ length: 120 }, (_, i) => {
    const t = 9 * 60 + 15 + (i % 60) * 4;
    const d = i < 60 ? "2026-10-07" : "2026-10-08";
    const c = 60_000 + Math.round(Math.sin(i / 6) * 600 / 50) * 50;
    return { date: `${d}T${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}:00+07:00`, open: c, high: c + 100, low: c - 100, close: c, volume: 10_000 + (i % 7) * 3_000 };
  });
  const minutes: FlowMinute[] = bars.slice(60).map((b, k) => ({ date: "2026-10-08", minute: Number(b.date.slice(11, 13)) * 60 + Number(b.date.slice(14, 16)), buy: 6000 + k, sell: 4000, unknown: 0, auction: 0, large: 0 }));

  it("không truyền dòng lệnh -> không tính (lớp tắt); truyền -> phiên có tick dùng TICK, phiên còn lại BVC", () => {
    expect(analyze(bars).orderFlow).toBeNull();
    const of = analyze(bars, { flowMinutes: minutes }).orderFlow!;
    expect(of.coverage.tickBars).toBe(60);
    expect(of.coverage.bvcBars).toBe(60);
    expect(of.bars[60].source).toBe("TICK");
    expect(of.bars[0].source).toBe("BVC");
  });

  it("Absorption/Divergence không vẽ lại: kết quả trên bars[0..t] = toàn bộ lọc confirmedIndex ≤ t", () => {
    const full = analyze(bars, { flowMinutes: minutes }).orderFlow!;
    for (const t of [70, 90, 110]) {
      const part = analyze(bars.slice(0, t + 1), { flowMinutes: minutes.filter((m) => m.minute <= Number(bars[t].date.slice(11, 13)) * 60 + Number(bars[t].date.slice(14, 16))) }).orderFlow!;
      const key = (e: { index: number; dir: string }) => `${e.index}|${e.dir}`;
      expect(part.divergences.map(key)).toEqual(full.divergences.filter((e) => e.confirmedIndex <= t).map(key));
      expect(part.absorption.map(key)).toEqual(full.absorption.filter((e) => e.confirmedIndex <= t).map(key));
    }
  });

  it("lớp Order Flow / Khối ngoại mặc định TẮT", () => {
    expect(DEFAULT_LAYER_STATE.orderflow).toBe(false);
    expect(DEFAULT_LAYER_STATE.foreign).toBe(false);
  });
});
