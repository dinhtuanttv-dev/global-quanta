import { describe, expect, it } from "vitest";
import { buildFlowBars, computeVpin, detectAbsorption, detectCvdDivergence, normCdf, type FlowMinute } from "./orderFlow";
import type { Bar } from "./math";
import type { Pivot } from "./structure";

const bar = (date: string, close: number, volume = 1000, extra: Partial<Bar> = {}): Bar => ({ date, open: close, high: close + 50, low: close - 50, close, volume, ...extra });
const fm = (date: string, minute: number, buy: number, sell: number, large = 0): FlowMinute => ({ date, minute, buy, sell, unknown: 0, auction: 0, large });

describe("Order Flow — gán dòng lệnh vào nến", () => {
  it("Φ chuẩn", () => {
    expect(normCdf(0)).toBeCloseTo(0.5, 7);
    expect(normCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normCdf(-1)).toBeCloseTo(0.1587, 3);
  });

  it("intraday: phút gán vào nến 15m chứa nó; CVD reset mỗi phiên; phiên có tick -> nguồn TICK", () => {
    const bars = [bar("2026-10-07T09:15:00+07:00", 100), bar("2026-10-07T09:30:00+07:00", 101), bar("2026-10-08T09:15:00+07:00", 102)];
    const minutes = [fm("2026-10-07", 9 * 60 + 20, 300, 100), fm("2026-10-07", 9 * 60 + 31, 50, 250), fm("2026-10-08", 9 * 60 + 16, 10, 40)];
    const f = buildFlowBars(bars, minutes);
    expect(f.map((x) => x.delta)).toEqual([200, -200, -30]);
    expect(f.map((x) => x.cvd)).toEqual([200, 0, -30]); // reset ở phiên 08/10
    expect(f.every((x) => x.source === "TICK")).toBe(true);
  });

  it("phiên không có tick -> BVC: nến tăng mạnh nghiêng về mua; nến khớp định kỳ không có bên", () => {
    const bars: (Bar & { auction?: string })[] = [bar("2026-09-01T09:30:00+07:00", 100), bar("2026-09-01T09:45:00+07:00", 101), bar("2026-09-01T10:00:00+07:00", 100.5),
      bar("2026-09-01T10:15:00+07:00", 105), { ...bar("2026-09-01T14:45:00+07:00", 105, 5000), auction: "ATC" }];
    const f = buildFlowBars(bars, []);
    expect(f.every((x) => x.source === "BVC")).toBe(true);
    expect(f[3].buy).toBeGreaterThan(f[3].sell);
    expect(f[4].buy + f[4].sell).toBe(0);
  });

  it("BVC chỉ dùng σ của các nến TRƯỚC (thêm nến sau không đổi kết quả nến trước)", () => {
    const bars = Array.from({ length: 30 }, (_, i) => bar(`2026-09-01T${String(9 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}:00+07:00`, 100 + Math.sin(i) * 2));
    const full = buildFlowBars(bars, []);
    const part = buildFlowBars(bars.slice(0, 20), []);
    expect(part.map((x) => x.delta)).toEqual(full.slice(0, 20).map((x) => x.delta));
  });
});

describe("Order Flow — Absorption, CVD divergence, VPIN", () => {
  it("Absorption: 2 nến liên tiếp KL đột biến mà giá không đi; bán bị hấp thụ -> ▲", () => {
    const bars: Bar[] = Array.from({ length: 40 }, (_, i) => bar(`d${String(i).padStart(2, "0")}`, 20_000 + (i % 3) * 50, 1000 + (i % 5) * 100));
    bars[36] = { ...bars[36], close: 20_000, volume: 20_000 };
    bars[37] = { ...bars[37], close: 20_000, volume: 22_000 };
    bars[35] = { ...bars[35], close: 20_000 };
    const flow = bars.map((b, i) => ({ date: b.date, buy: i >= 36 ? 5_000 : 500, sell: i >= 36 ? 15_000 : 500, delta: i >= 36 ? -10_000 : 0, cvd: 0, large: 0, source: "TICK" as const }));
    const ev = detectAbsorption(bars, flow);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ index: 37, dir: "bullish" });
  });

  it("CVD divergence trên pivot đã xác nhận", () => {
    const flow = Array.from({ length: 20 }, (_, i) => ({ date: `d${i}`, buy: 0, sell: 0, delta: 0, cvd: i === 5 ? 1000 : i === 12 ? 400 : 0, large: 0, source: "TICK" as const }));
    const pivots: Pivot[] = [
      { index: 5, date: "d5", kind: "high", price: 100, confirmedIndex: 10 },
      { index: 12, date: "d12", kind: "high", price: 105, confirmedIndex: 17 },
    ];
    expect(detectCvdDivergence(pivots, flow)).toEqual([{ index: 12, date: "d12", dir: "bearish", pivotIndex: 5, confirmedIndex: 17 }]);
  });

  it("VPIN: dòng lệnh một chiều -> VPIN ≈ 1; cân bằng -> ≈ 0", () => {
    const bars = Array.from({ length: 200 }, (_, i) => bar(`d${i}`, 100, 1000));
    const oneSided = bars.map((b) => ({ date: b.date, buy: 1000, sell: 0, delta: 1000, cvd: 0, large: 0, source: "TICK" as const }));
    const balanced = bars.map((b) => ({ date: b.date, buy: 500, sell: 500, delta: 0, cvd: 0, large: 0, source: "TICK" as const }));
    expect(computeVpin(bars, oneSided, { sessions: 2 }).latest).toBeCloseTo(1, 3);
    expect(computeVpin(bars, balanced, { sessions: 2 }).latest).toBeCloseTo(0, 3);
  });
});

describe("R1 — tính đúng Order Flow", () => {
  it("phiên có tick nhưng nến thiếu phút dữ liệu -> BVC (không phải mua = bán = 0 mang nhãn TICK)", () => {
    const bars = [bar("2026-10-07T09:15:00+07:00", 100), bar("2026-10-07T09:30:00+07:00", 103, 4000), bar("2026-10-07T09:45:00+07:00", 102)];
    const f = buildFlowBars(bars, [fm("2026-10-07", 9 * 60 + 20, 300, 100), fm("2026-10-07", 9 * 60 + 50, 10, 40)]);
    expect(f.map((x) => x.source)).toEqual(["TICK", "BVC", "TICK"]);
    expect(f[1].buy + f[1].sell).toBeCloseTo(4000, 6);
  });

  it("VPIN point-in-time: thêm phiên sau KHÔNG đổi giá trị VPIN của các nến trước; chưa đủ phiên hiệu chỉnh -> null", () => {
    const n = 60;
    const bars = Array.from({ length: n }, (_, i) => bar(`2026-01-${String((i % 28) + 1).padStart(2, "0")}#${i}`, 100 + Math.sin(i / 2) * 3, 1000 + (i % 7) * 400));
    const flow = bars.map((b, i) => ({ date: b.date, buy: b.volume * (0.3 + 0.4 * ((i * 37) % 10) / 10), sell: 0, delta: 0, cvd: 0, large: 0, source: "BVC" as const }))
      .map((x, i) => ({ ...x, sell: bars[i].volume - x.buy }));
    const full = computeVpin(bars, flow, { sessions: n });
    const part = computeVpin(bars.slice(0, 40), flow.slice(0, 40), { sessions: 40 });
    expect(part.series).toEqual(full.series.slice(0, 40));
    expect(full.series.slice(0, 19).every((v) => v === null)).toBe(true);
    // Gấp 10 lần KL các phiên SAU không làm đổi VPIN quá khứ (trước đây V_b tính từ KL toàn kỳ -> đổi).
    const boosted = bars.map((b, i) => (i >= 40 ? { ...b, volume: b.volume * 10 } : b));
    const bflow = flow.map((x, i) => (i >= 40 ? { ...x, buy: x.buy * 10, sell: x.sell * 10 } : x));
    expect(computeVpin(boosted, bflow, { sessions: n }).series.slice(0, 40)).toEqual(full.series.slice(0, 40));
  });
});

