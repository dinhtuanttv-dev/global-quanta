// MTF v3 · S2 — cấu trúc: sóng xác nhận bằng đóng cửa (không vẽ lại), Dow + 3 tiêu chí gãy / đảo, CHoCH / BOS, giai đoạn S1–S4.
import { describe, expect, it } from "vitest";
import type { Bar } from "../math";
import { atr } from "./series";
import { ribbonSeries } from "./ribbon";
import { dowSeries3, stageSeries, swings3, trendTemplateAt } from "./structure";

const day = (i: number) => new Date(Date.UTC(2015, 0, 1) + i * 86400000).toISOString().slice(0, 10);
/** Đường gấp khúc qua các điểm (giá đóng cửa), nến ±0,4% quanh đường. */
function path(points: [number, number][]): Bar[] {
  const out: Bar[] = [];
  for (let k = 1; k < points.length; k++) {
    const [i0, p0] = points[k - 1], [i1, p1] = points[k];
    for (let i = i0; i < i1; i++) {
      const c = p0 + ((p1 - p0) * (i - i0)) / (i1 - i0), o = out.length ? out[out.length - 1].close : c;
      out.push({ date: day(i), open: o, high: Math.max(o, c) * 1.004, low: Math.min(o, c) * 0.996, close: c, volume: 1000 });
    }
  }
  return out;
}

describe("MTF v3 · S2 cấu trúc", () => {
  // tăng HH/HL: 100 → 130 → 115 → 150 → 135 → 170, rồi ① đỉnh thấp hơn 160, ② thủng đáy bảo vệ 135, ③ đáy thấp hơn
  const up = path([[0, 100], [30, 130], [45, 115], [75, 150], [90, 135], [120, 170], [140, 145], [160, 160], [185, 125], [205, 140], [230, 110], [240, 112]]);
  const a = atr(up, 14);
  const sw = swings3(up, a, 2.0);

  it("sóng xác nhận bằng giá đóng cửa, xen kẽ H/L, không vẽ lại (tiền tố trùng)", () => {
    for (let k = 1; k < sw.length; k++) expect(sw[k].kind).not.toBe(sw[k - 1].kind);
    for (const s of sw) {
      expect(s.confirmedIndex).toBeGreaterThan(s.index);
      const th = 2.0 * a[s.confirmedIndex];
      if (s.kind === "H") expect(up[s.confirmedIndex].close).toBeLessThanOrEqual(s.price - th + 1e-9);
      else expect(up[s.confirmedIndex].close).toBeGreaterThanOrEqual(s.price + th - 1e-9);
    }
    for (const t of [80, 150, 200]) {
      const pre = swings3(up.slice(0, t + 1), a.slice(0, t + 1), 2.0);
      expect(pre).toEqual(sw.filter((s) => s.confirmedIndex <= t));
    }
  });

  it("Dow: UP với đáy bảo vệ → ① UP_WEAK (đỉnh thấp hơn) → ② thủng đáy bảo vệ → ③ DOWN", () => {
    const d = dowSeries3(up, sw);
    expect(d.state[125]).toBe("UP");
    expect(d.protectedLow[125]).toBeCloseTo(135 * 0.996, 0);
    const weak = d.state.findIndex((s, i) => i > 140 && s === "UP_WEAK");
    expect(weak).toBeGreaterThan(160);
    const broken = d.event.findIndex((e) => e === "BREAK_PROTECTED_LOW");
    expect(broken).toBeGreaterThan(weak);
    expect(up[broken].close).toBeLessThan(d.protectedLow[broken - 1]);
    expect(d.state[broken]).toBe("BROKEN_UP");
    expect(d.state[up.length - 1]).toMatch(/DOWN/);
    // không nhìn trước
    for (const t of [130, 190, 235]) {
      const pre = dowSeries3(up.slice(0, t + 1), sw.filter((s) => s.confirmedIndex <= t));
      expect(pre.state[t]).toBe(d.state[t]);
      expect(pre.event[t]).toBe(d.event[t]);
    }
  });

  it("CHoCH↑: sau xu hướng giảm, đáy cao hơn rồi đóng cửa vượt đỉnh sóng gần nhất", () => {
    const dn = path([[0, 200], [30, 170], [45, 185], [75, 150], [90, 165], [120, 130], [140, 150], [165, 138], [195, 175], [215, 160], [240, 190]]);
    const s = swings3(dn, atr(dn, 14), 2.0), d = dowSeries3(dn, s);
    expect(d.state[125]).toBe("DOWN");
    const ch = d.event.findIndex((e) => e === "CHOCH_UP" || e === "BREAK_PULLBACK_HIGH");
    expect(ch).toBeGreaterThan(140);
    expect(d.event.some((e) => e === "CHOCH_UP")).toBe(true);
    expect(d.state[dn.length - 1]).toBe("UP");
    expect(d.event.slice(ch + 1).some((e) => e === "BOS_UP")).toBe(true);
  });

  it("giai đoạn: nền đi ngang → S2 khi đủ Trend Template; giảm sâu → S4; trễ chống nhiễu 3 nến", () => {
    const bars = path([[0, 100], [260, 102], [420, 180], [520, 150], [700, 80], [720, 82]]);
    const r = ribbonSeries(bars, "D"), st = stageSeries(r);
    expect(st.stage[150]).toBe("NA");          // chưa đủ MA200 + 20
    expect(st.stage[255]).toBe("S1");
    const s2 = st.stage.indexOf("S2");
    expect(s2).toBeGreaterThan(260);
    expect(trendTemplateAt(r, s2).every((c) => c.ok)).toBe(true);
    expect(st.stage[700]).toBe("S4");
    // mỗi lần đổi (trừ S2 → S3/S4 khi thủng MA200) điều kiện mới đã giữ ≥ 3 nến
    for (let t = 1; t < bars.length; t++) if (st.stage[t] !== st.stage[t - 1] && st.stage[t - 1] !== "NA" && st.stage[t - 1] !== "S2") expect(st.stageAge[t]).toBe(1);
    const pre = stageSeries(ribbonSeries(bars.slice(0, 451), "D"));
    expect(pre.stage[450]).toBe(st.stage[450]);
  });
});

import { analyze3, compactStructure3, context3At } from "./frame";

describe("MTF v3 · S2 ghép khung", () => {
  // ~6 năm: tăng dài hạn (tuần tăng), có các nhịp điều chỉnh ngày rồi đổi tính chất tăng
  const pts: [number, number][] = [[0, 100]];
  let p = 100, i = 0;
  // mỗi chu kỳ: tăng 20% rồi điều chỉnh có cấu trúc giảm nhỏ (đỉnh thấp dần, đáy thấp dần) -> đáy cao hơn -> bật vượt đỉnh hồi
  for (let k = 0; k < 30; k++) {
    i += 25; p *= 1.2; const P = p; pts.push([i, P]);
    for (const [len, f] of [[6, 0.92], [6, 0.96], [6, 0.88], [6, 0.93], [6, 0.9]] as [number, number][]) { i += len; pts.push([i, P * f]); }
    p = P * 0.9;
  }
  const daily = path(pts).map((b, j) => ({ ...b, date: new Date(Date.UTC(2015, 0, 5) + Math.floor(j / 5) * 7 * 86400000 + (j % 5) * 86400000).toISOString().slice(0, 10) }));
  const a = analyze3(daily);

  it("không nhìn trước: ngữ cảnh ba khung tại t trên bars[0..t] trùng toàn chuỗi", () => {
    for (const t of [700, 1000, daily.length - 1]) expect(context3At(analyze3(daily.slice(0, t + 1)), t)).toEqual(context3At(a, t));
  });

  it("chân dưới đổi theo chân trên: có tín hiệu L khi tuần tăng và ngày CHoCH↑; không có S", () => {
    let L = 0, S = 0;
    for (let t = 600; t < daily.length; t++) { const tr = context3At(a, t).trigger; if (tr.side === "L") L++; if (tr.side === "S") S++; }
    expect(L).toBeGreaterThan(0);
    expect(S).toBe(0);
    const last = context3At(a, daily.length - 1);
    expect(last.W.date! < daily[daily.length - 1].date).toBe(true);
    expect(last.D.stage).toBe("S2");
  });

  it("bản gọn: sóng / sự kiện / dải giai đoạn trong cửa sổ vẽ, ngày có thật", () => {
    const c = compactStructure3(a, { window: 260 });
    const dates = new Set(daily.map((b) => b.date));
    for (const s of c.frames.D.swings) expect(dates.has(s.date)).toBe(true);
    expect(c.frames.D.segments.reduce((n, s) => n + s.bars, 0)).toBe(260);
    expect(c.frames.D.events.length).toBeGreaterThan(0);
  });
});
