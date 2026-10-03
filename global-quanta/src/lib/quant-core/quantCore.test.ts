import { describe, expect, it } from "vitest";
import { analyze, computeStructure, detectPivots, detectFVG, atrSeries, eventStudy, trailingZ, findTradingRange, classifyWyckoffV2, type Bar } from "./index";

/** Chuỗi tất định (random walk có xu hướng đổi chiều) — đủ dài để có nhiều BOS/CHoCH/FVG/sweep. */
function series(n = 600, seed = 11): Bar[] {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const out: Bar[] = [];
  let close = 50_000;
  for (let i = 0; i < n; i++) {
    const drift = Math.sin(i / 40) * 0.004;
    const open = close * (1 + (rnd() - 0.5) * 0.01);
    close = Math.max(5_000, open * (1 + drift + (rnd() - 0.5) * 0.045));
    const high = Math.max(open, close) * (1 + rnd() * 0.012);
    const low = Math.min(open, close) * (1 - rnd() * 0.012);
    const d = new Date(Date.UTC(2023, 0, 2 + i));
    out.push({ date: d.toISOString().slice(0, 10), open, high, low, close, volume: Math.round(1e6 * (0.3 + rnd() * 2 + (rnd() > 0.95 ? 4 : 0))) });
  }
  return out;
}

// Trường "tạo lập" (bất biến từ confirmedIndex) của từng loại đối tượng — trạng thái tiến hoá (mitigated/filled/swept) được kiểm riêng.
const pick = {
  structure: (e: { kind: string; dir: string; index: number; level: number; pivotIndex: number; displacementATR: number; volZ: number | null }) =>
    [e.kind, e.dir, e.index, e.level, e.pivotIndex, e.displacementATR, e.volZ].join("|"),
  ob: (z: { dir: string; index: number; top: number; bottom: number; createdByIndex: number; kind: string }) => [z.dir, z.index, z.top, z.bottom, z.createdByIndex, z.kind].join("|"),
  fvg: (z: { dir: string; index: number; top: number; bottom: number }) => [z.dir, z.index, z.top, z.bottom].join("|"),
  pool: (z: { side: string; level: number; touches: number; confirmedIndex: number; pivotIndexes: number[] }) => [z.side, z.level, z.touches, z.confirmedIndex, z.pivotIndexes.join(",")].join("|"),
  vsa: (v: { type: string; index: number; zV: number; zS: number }) => [v.type, v.index, v.zV, v.zS].join("|"),
};

describe("quant-core — KHÔNG LOOK-AHEAD (bất biến bắt buộc của engine)", () => {
  const bars = series();
  const full = analyze(bars);

  it("dữ liệu thử đủ phong phú", () => {
    expect(full.counts.choch).toBeGreaterThan(5);
    expect(full.counts.bos).toBeGreaterThan(10);
    expect(full.counts.fvgs).toBeGreaterThan(10);
    expect(full.counts.orderBlocks).toBeGreaterThan(10);
    expect(full.counts.liquidity).toBeGreaterThan(2);
    expect(full.counts.vsa).toBeGreaterThan(10);
  });

  it("tại mọi mốc t: tín hiệu tính trên bars[0..t] = tín hiệu toàn bộ có confirmedIndex ≤ t (không vẽ lại)", () => {
    for (let t = 60; t < bars.length; t += 23) {
      const part = analyze(bars.slice(0, t + 1));
      const upto = <T extends { confirmedIndex: number }>(xs: T[]) => xs.filter((x) => x.confirmedIndex <= t);
      expect(part.structure.map(pick.structure), `structure t=${t}`).toEqual(upto(full.structure).map(pick.structure));
      expect(part.orderBlocks.map(pick.ob), `OB t=${t}`).toEqual(upto(full.orderBlocks).map(pick.ob));
      expect(part.fvgs.map(pick.fvg), `FVG t=${t}`).toEqual(upto(full.fvgs).map(pick.fvg));
      expect(part.liquidity.map(pick.pool), `pool t=${t}`).toEqual(upto(full.liquidity).map(pick.pool));
      expect(part.vsa.map(pick.vsa), `VSA t=${t}`).toEqual(upto(full.vsa).map(pick.vsa));
    }
  });

  it("trạng thái tiến hoá nhất quán: nếu đã đổi trạng thái trước t thì bản tính tại t cũng thấy", () => {
    for (let t = 120; t < bars.length; t += 37) {
      const part = analyze(bars.slice(0, t + 1));
      for (const z of full.fvgs.filter((x) => x.confirmedIndex <= t && x.stateIndex !== null && x.stateIndex <= t && (x.state === "FILLED" || x.state === "INVERTED"))) {
        const p = part.fvgs.find((x) => pick.fvg(x) === pick.fvg(z))!;
        expect(p.state).toBe(z.state);
      }
      for (const z of full.liquidity.filter((x) => x.confirmedIndex <= t && x.stateIndex !== null && x.stateIndex <= t)) {
        const p = part.liquidity.find((x) => pick.pool(x) === pick.pool(z))!;
        expect([p.state, p.stateIndex]).toEqual([z.state, z.stateIndex]);
      }
    }
  });

  it("pivot chỉ tồn tại từ nến i+R; CHoCH/BOS chỉ phá pivot đã xác nhận trước đó", () => {
    const st = computeStructure(bars);
    for (const p of detectPivots(bars, 5, 5)) expect(p.confirmedIndex).toBe(p.index + 5);
    const pivotConfirm = new Map(st.pivots.map((p) => [`${p.kind}:${p.index}`, p.confirmedIndex]));
    for (const e of st.events) {
      const key = `${e.dir === "bullish" ? "high" : "low"}:${e.pivotIndex}`;
      expect(pivotConfirm.get(key)!).toBeLessThan(e.index);
    }
  });
});

describe("quant-core — đúng định nghĩa", () => {
  it("CHoCH = lần phá ĐẦU TIÊN ngược xu hướng; BOS = tiếp diễn", () => {
    const st = computeStructure(series());
    let trend: string | null = null;
    for (const e of st.events) {
      expect(e.kind).toBe(trend !== null && trend !== e.dir ? "CHoCH" : "BOS");
      trend = e.dir;
    }
  });

  it("FVG: ngưỡng ≥ 0,25×ATR và ≥ 2 bước giá; bỏ gap do khoá trần/sàn", () => {
    const b: Bar[] = Array.from({ length: 30 }, (_, i) => ({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, open: 20_000, high: 20_100, low: 19_900, close: 20_000, volume: 1e6 }));
    // gap tăng 400đ (≥ 0,25 ATR ~ 50đ) ở nến 22
    b[21] = { ...b[21], open: 20_100, close: 20_400, high: 20_450, low: 20_050 };
    b[22] = { ...b[22], open: 20_500, close: 20_600, high: 20_700, low: 20_500 };
    const atr = atrSeries(b);
    const gaps = detectFVG(b, atr);
    expect(gaps.some((g) => g.dir === "bullish" && g.bottom === 20_100 && g.top === 20_500)).toBe(true);
    // Nến 22 tăng trần 7% đóng ở giá cao nhất -> gap bị loại
    const locked = b.map((x) => ({ ...x }));
    locked[22] = { ...locked[22], open: 21_400, low: 21_400, high: 21_828, close: 21_828 }; // ≈ +7% so với 20.400
    expect(detectFVG(locked, atrSeries(locked)).some((g) => g.index === 21)).toBe(false);
    expect(detectFVG(locked, atrSeries(locked), { limitPct: null }).some((g) => g.index === 21)).toBe(true);
  });

  it("z-score chỉ dùng cửa sổ trước nến", () => {
    const v = [1, 2, 3, 4, 5, 100];
    expect(trailingZ(v, 5, 5)).toBeCloseTo((100 - 3) / Math.sqrt(2), 6);
    expect(trailingZ(v, 3, 5)).toBeNull();
  });

  it("event study: vào lệnh giá mở cửa T+1, trừ phí/thuế, so với tỷ lệ nền", () => {
    const b: Bar[] = Array.from({ length: 40 }, (_, i) => ({ date: `d${i}`, open: 100 + i, high: 101 + i, low: 99 + i, close: 100 + i, volume: 1 }));
    const r = eventStudy(b, [5], "bullish", "x", 10);
    const expected = ((115 * (1 - 0.0025)) / (106 * 1.0015) - 1) * 100; // vào open[6]=106, ra close[15]=115
    expect(r.meanRetPct).toBeCloseTo(expected, 1);
    expect(r.n).toBe(1);
    expect(r.lowSample).toBe(true);
    expect(r.baseRate).toBe(100);
    expect(r.edgePp).toBe(0);
  });

  it("Wyckoff v2: range theo ATR, SOS phải đóng cửa VƯỢT đỉnh range sau khi range hình thành", () => {
    const b: Bar[] = [];
    let p = 30_000;
    for (let i = 0; i < 40; i++) { p *= 0.99; b.push({ date: `a${i}`, open: p * 1.005, high: p * 1.01, low: p * 0.99, close: p, volume: 1e6 }); }
    const lo = p;
    for (let i = 0; i < 40; i++) { const c = lo * (1 + 0.02 * Math.sin(i / 3)); b.push({ date: `b${i}`, open: c, high: c * 1.01, low: c * 0.99, close: c, volume: 8e5 }); }
    for (let i = 0; i < 6; i++) { const c = lo * (1.06 + i * 0.02); b.push({ date: `c${i}`, open: c * 0.98, high: c * 1.01, low: c * 0.97, close: c, volume: 3e6 }); }
    const range = findTradingRange(b);
    expect(range).not.toBeNull();
    const w = classifyWyckoffV2(b);
    expect(w.phase).toBe("markup");
    expect(w.markupDate?.startsWith("c")).toBe(true);
  });
});
