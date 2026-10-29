// CH3 — quạt dự phóng có điều kiện: hàm đặc biệt và Harrell–Davis đối chiếu scipy 1.18 (betainc, gammaln, mstats.hdquantiles,
// stats.beta.ppf); tính chất trọng số Kish; độ phủ CQR LOO lồng trên mô phỏng Monte Carlo; chạy trên dữ liệu thật FPT.
import { describe, expect, it } from "vitest";
import type { EventStudy } from "./timingSim";
import type { DailyBar } from "./timingSpace";
import div from "./__fixtures__/event-study-FPT-dividend.json";
import fptBars from "./__fixtures__/ohlcv-FPT-5y.json";
import vniBars from "./__fixtures__/ohlcv-VNINDEX-5y.json";
import { analogFan, betaQuantile, ibeta, kish, lgamma, weightedHD } from "./analogFan";

describe("hàm đặc biệt (oracle scipy)", () => {
  it("lgamma, I_x(a,b), phân vị Beta", () => {
    [[0.3, 1.0957979948180756], [1, 0], [4.5, 2.4537365708424423], [30.2, 71.93460296839497]].forEach(([x, v]) => expect(lgamma(x)).toBeCloseTo(v, 12));
    expect(ibeta(0.3, 2.5, 4)).toBeCloseTo(0.3521975859067672, 13);
    expect(ibeta(0.9, 0.7, 0.3)).toBeCloseTo(0.5666899526657656, 13);
    expect(ibeta(0.05, 10, 2) / 1.0253906250000005e-12).toBeCloseTo(1, 10);
    expect(ibeta(0.5, 40, 60)).toBeCloseTo(0.9780623532064925, 12);
    expect(betaQuantile(0.05, 3.2, 2.1)).toBeCloseTo(0.2610591745861595, 12);
    expect(betaQuantile(0.95, 3.2, 2.1)).toBeCloseTo(0.8986329722153265, 12);
  });
  it("Harrell–Davis trọng số đều = scipy hdquantiles", () => {
    const xs = [0.031, -0.012, 0.054, 0.008, -0.027, 0.066, 0.019, -0.004, 0.041], w = xs.map(() => 1);
    expect(weightedHD(xs, w, 0.1)).toBeCloseTo(-0.020593883649762258, 12);
    expect(weightedHD(xs, w, 0.5)).toBeCloseTo(0.019223333864513293, 12);
    expect(weightedHD(xs, w, 0.9)).toBeCloseTo(0.060159968194144736, 12);
  });
  it("trọng số: dồn vào một điểm -> phân vị tiến về điểm đó; Kish n_eff", () => {
    expect(kish([1, 1, 1, 1])).toBeCloseTo(4);
    expect(kish([1, 0, 0, 0])).toBeCloseTo(1);
    const q = weightedHD([1, 2, 3, 10], [1e-6, 1e-6, 1e-6, 1], 0.5)!;
    expect(q).toBeGreaterThan(9.9);
  });
});

// ---------- mô phỏng: giá bước ngẫu nhiên, VN-Index phẳng -> CAR = log giá; các đợt hoán đổi được ----------
function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; }; }
function synth(seed: number, nEvents: number) {
  const r = rng(seed), n = 160 * nEvents + 400;
  const bars: DailyBar[] = [], idx: DailyBar[] = [];
  let p = 100; const d0 = Date.parse("2010-01-04");
  for (let i = 0; i < n; i++) {
    const g = Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
    p *= Math.exp(0.015 * g);
    const date = new Date(d0 + i * 86_400_000).toISOString().slice(0, 10);
    bars.push({ date, volume: 1, value: 1, close: p }); idx.push({ date, volume: 1, value: 1, close: 100 });
  }
  const offsets = [-75, -60, -30, -25, -15, 0, 3, 5, 10, 20];
  const events = Array.from({ length: nEvents }, (_, k) => {
    const c = 120 + k * 160;
    return { eventDate: bars[c].date, year: 2010, car: offsets.map((o) => Math.log(bars[c + o].close! / bars[c - 75].close!)) };
  });
  // kỳ hiện tại: 60 phiên sau sự kiện cuối + 75 -> nến cuối ở phiên −16 của sự kiện "kế tiếp"
  const cNext = 120 + nEvents * 160, cut = cNext - 16;
  const es = { ticker: "SIM", kind: "DIVIDEND", quarter: null, version: "sim", asOf: "", offsets, events, currentPath: null, windows: [], selectedWindowId: null,
    costs: {}, costPerRoundTrip: 0, priors: null, upcoming: { date: bars[cNext].date, status: "ESTIMATED", label: "", source: "" }, notes: [] } as unknown as EventStudy;
  return { es, bars: bars.slice(0, cut + 1), idx: idx.slice(0, cut + 1) };
}

describe("CQR LOO lồng (Monte Carlo)", () => {
  it("80%: độ phủ ngoài mẫu trung bình sau hiệu chỉnh ≥ 0,75 và không thấp hơn trước hiệu chỉnh", () => {
    const raw: number[] = [], adj: number[] = [];
    for (let s = 1; s <= 24; s++) {
      const { es, bars, idx } = synth(s, 14);
      const fan = analogFan(es, bars, idx, -16, 10, { halfLifeYears: 1e9, today: bars[bars.length - 1].date })!;
      expect(fan.conformalFeasible).toBe(true);
      raw.push(fan.coverage!.raw!); adj.push(fan.coverage!.adjusted!);
    }
    const mean = (x: number[]) => x.reduce((a, b) => a + b, 0) / x.length;
    expect(mean(adj)).toBeGreaterThanOrEqual(0.75);
    expect(mean(adj)).toBeGreaterThanOrEqual(mean(raw) - 1e-9);
  });
  it("dải hiệu chỉnh luôn bao dải thô; trung vị nằm trong dải", () => {
    const { es, bars, idx } = synth(7, 12);
    const fan = analogFan(es, bars, idx, -16, 10)!;
    for (const p of fan.points) {
      expect(p.lo).toBeLessThanOrEqual(p.mid); expect(p.mid).toBeLessThanOrEqual(p.hi);
      expect(p.loAdj!).toBeLessThanOrEqual(p.lo + 1e-12); expect(p.hiAdj!).toBeGreaterThanOrEqual(p.hi - 1e-12);
    }
  });
});

describe("FPT cổ tức (dữ liệu thật, 29/10/2026, hôm nay = phiên −16 trước GDKHQ 20/11)", () => {
  const es = div as unknown as EventStudy;
  const fan = analogFan(es, fptBars as DailyBar[], vniBars as DailyBar[], -16, 3, { today: "2026-10-29" })!;
  it("đủ đợt, trọng số chuẩn hoá, n_eff ≤ số đợt, mốc dự phóng = các mốc v3 sau hôm nay", () => {
    expect(fan).not.toBeNull();
    expect(fan.weights.length).toBeGreaterThanOrEqual(4);
    expect(fan.weights.reduce((s, w) => s + w.weight, 0)).toBeCloseTo(1, 12);
    expect(fan.nEff).toBeLessThanOrEqual(fan.weights.length + 1e-9);
    expect(fan.points.map((p) => p.offset)).toEqual(es.offsets.filter((o) => o > -16));
  });
  it("điểm neo = CAR hôm nay của kỳ hiện tại; xác suất thắng là hậu nghiệm Beta hợp lệ", () => {
    expect(Number.isFinite(fan.anchorCar)).toBe(true);
    expect(fan.pWin!.lo).toBeLessThan(fan.pWin!.mean);
    expect(fan.pWin!.mean).toBeLessThan(fan.pWin!.hi);
    expect(fan.coverage!.n).toBe(fan.weights.length);
  });
  it("đã qua sự kiện -> không dự phóng (đường giá đóng cửa có cổ tức xen giữa)", () => {
    expect(analogFan(es, fptBars as DailyBar[], vniBars as DailyBar[], 3, 10)).toBeNull();
  });
});
