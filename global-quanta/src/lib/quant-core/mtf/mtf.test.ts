import { describe, expect, it } from "vitest";
import type { Bar } from "../math";
import { analyzeStructureMtf, analyzeTf, analyzeTfSeries, minutesToH1, patternStatusAt } from "./index";
import { alignMatrix, closedHtfIndex, toWeekly, weekKey } from "./align";

/** PRNG có hạt giống (mulberry32) — dữ liệu tổng hợp tái lập được. */
function rng(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Nến ngày T2–T6 đi theo các mốc giá (nội suy tuyến tính) + nhiễu nhỏ. */
function path(knots: [number, number][], noise = 0.004, seed = 7): Bar[] {
  const r = rng(seed);
  const n = knots[knots.length - 1][0] + 1;
  const out: Bar[] = [];
  const d = new Date("2022-01-03T00:00:00Z");
  let prev = knots[0][1];
  for (let i = 0; i < n; i++) {
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    let k = 0;
    while (k + 1 < knots.length && knots[k + 1][0] < i) k++;
    const [i0, p0] = knots[k], [i1, p1] = knots[Math.min(k + 1, knots.length - 1)];
    const base = i1 === i0 ? p0 : p0 + ((p1 - p0) * (i - i0)) / (i1 - i0);
    const close = base * (1 + (r() - 0.5) * 2 * noise);
    const open = prev;
    const high = Math.max(open, close) * (1 + r() * noise);
    const low = Math.min(open, close) * (1 - r() * noise);
    out.push({ date: d.toISOString().slice(0, 10), open, high, low, close, volume: 1e6 * (0.5 + r()) });
    prev = close;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

const randomWalk = (n: number, seed: number): Bar[] => {
  const r = rng(seed);
  const knots: [number, number][] = [[0, 100]];
  let p = 100;
  for (let i = 15; i < n; i += 15) { p *= 1 + (r() - 0.5) * 0.2; knots.push([i, p]); }
  knots.push([n - 1, p]);
  return path(knots, 0.01, seed);
};

describe("Cấu trúc đa khung — một khung", () => {
  it("xu hướng tăng đều -> UP, Dow +1, giá trên MA chân trên", () => {
    const bars = path([[0, 100], [40, 130], [55, 118], [95, 150], [110, 138], [150, 175], [165, 162], [205, 200], [220, 188], [260, 225]], 0.004);
    const a = analyzeTf(bars, "D");
    const t = bars.length - 1;
    expect(a.stage[t]).toMatch(/UP|B/);
    expect(a.dow[t]).toBe(1);
    expect(bars[t].close).toBeGreaterThan(a.maSlow[t]);
  });

  it("xu hướng giảm đều -> DOWN / D, Dow −1", () => {
    const bars = path([[0, 225], [40, 190], [55, 202], [95, 170], [110, 182], [150, 150], [165, 162], [205, 128], [220, 140], [260, 105]], 0.004);
    const a = analyzeTf(bars, "D");
    const t = bars.length - 1;
    expect(["DOWN", "D", "Bp"]).toContain(a.stage[t]);
    expect(a.dow[t]).toBe(-1);
  });

  it("hai đáy sau xu hướng giảm: mẫu W phá cổ, giai đoạn chuyển sang tăng", () => {
    const bars = path([[0, 200], [140, 120], [165, 140], [190, 121], [215, 150], [300, 190]], 0.004);
    const a = analyzeTf(bars, "D");
    const w = a.patterns.find((p) => (p.type === "W" || p.type === "IHS") && p.points[0].index >= 120);
    expect(w).toBeTruthy();
    expect(patternStatusAt(w!, bars.length - 1)).toBe("confirmed");
    expect(a.stage[bars.length - 1]).toMatch(/UP|B/);
    expect(a.stage.slice(130, 260)).toContain("A");
  });

  it("vai–đầu–vai sau xu hướng tăng: mẫu đỉnh phá cổ, giai đoạn D / giảm", () => {
    const bars = path([[0, 100], [150, 180], [170, 165], [195, 195], [220, 165], [245, 181], [270, 150], [330, 120]], 0.004);
    const a = analyzeTf(bars, "D");
    const top = a.patterns.find((p) => p.dir === -1 && p.points[0].index >= 130);
    expect(top).toBeTruthy();
    expect(patternStatusAt(top!, bars.length - 1)).toBe("confirmed");
    expect(["D", "DOWN", "Bp"]).toContain(a.stage[bars.length - 1]);
  });

  it("vùng hỗ trợ / kháng cự có nguồn, độ mạnh trong [0,1], vai trò theo vị trí giá", () => {
    const bars = randomWalk(400, 11);
    const a = analyzeTf(bars, "D");
    const c = bars[bars.length - 1].close;
    expect(a.zones.length).toBeGreaterThan(0);
    for (const z of a.zones) {
      expect(z.strength).toBeGreaterThan(0); expect(z.strength).toBeLessThanOrEqual(1);
      expect(z.sources.length).toBeGreaterThan(0);
      expect(z.role).toBe(z.mid <= c ? "support" : "resistance");
    }
    expect(a.checklistBuy).toHaveLength(7);
    expect(a.checklistSell).toHaveLength(7);
  });
});

describe("Bất biến không nhìn trước", () => {
  for (const seed of [3, 19, 42]) {
    it(`seed ${seed}: kết quả tại t trên bars[0..t] trùng kết quả trên toàn bộ dữ liệu`, () => {
      const bars = randomWalk(500, seed);
      const full = analyzeTf(bars, "D");
      for (const k of [140, 233, 377, 470]) {
        const part = analyzeTf(bars.slice(0, k), "D");
        const t = k - 1;
        expect(part.stage).toEqual(full.stage.slice(0, k));
        expect(part.stageAge).toEqual(full.stageAge.slice(0, k));
        expect(part.dow).toEqual(full.dow.slice(0, k));
        expect(part.signals).toEqual(full.signals.filter((s) => s.confirmedIndex <= t));
        for (const lv of ["small", "mid", "large"] as const) expect(part.swings[lv]).toEqual(full.swings[lv].filter((s) => s.confirmedIndex <= t));
        const st = (ps: typeof full.patterns) => ps.filter((p) => p.confirmedIndex <= t).map((p) => `${p.type}@${p.start}:${patternStatusAt(p, t)}`);
        expect(st(part.patterns)).toEqual(st(full.patterns));
      }
    });
  }
});

describe("Ảnh chụp tại nến t (kiểm định / sổ dự báo)", () => {
  it("at(t) trên toàn bộ dữ liệu = vùng giá / nền / bảng kiểm tính trên bars[0..t]", () => {
    const bars = randomWalk(420, 23);
    const s = analyzeTfSeries(bars, "D");
    for (const t of [180, 299, 419]) {
      const part = analyzeTf(bars.slice(0, t + 1), "D");
      const snap = s.at(t);
      expect(snap.zones).toEqual(part.zones);
      expect(snap.base).toEqual(part.base);
      expect(snap.checklistBuy).toEqual(part.checklistBuy);
      expect(snap.checklistSell).toEqual(part.checklistSell);
    }
  });
});

describe("Ghép đa khung", () => {
  it("khoá tuần ISO", () => {
    expect(weekKey("2026-01-01")).toBe("2026-W01");
    expect(weekKey("2024-12-30")).toBe("2025-W01");
    expect(weekKey("2021-01-03")).toBe("2020-W53");
    expect(weekKey("2026-10-21")).toBe("2026-W43");
  });

  it("nến H1 chỉ thấy nến ngày ĐÃ ĐÓNG (ngày trước), nến ngày chỉ thấy tuần trước", () => {
    const d: Bar[] = ["2026-10-19", "2026-10-20", "2026-10-21"].map((date) => ({ date, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
    const h: Bar[] = ["2026-10-20 09:00", "2026-10-20 14:00", "2026-10-21 09:00"].map((date) => ({ date, open: 1, high: 1, low: 1, close: 1, volume: 1 }));
    expect(closedHtfIndex(h, d, false)).toEqual([0, 0, 1]);
    const days = path([[0, 100], [30, 110]]);
    const wk = toWeekly(days);
    const map = closedHtfIndex(days, wk, true);
    for (let i = 0; i < days.length; i++) {
      if (map[i] >= 0) expect(weekKey(wk[map[i]].date) < weekKey(days[i].date)).toBe(true);
      if (map[i] + 1 < wk.length) expect(weekKey(wk[map[i] + 1].date) >= weekKey(days[i].date)).toBe(true);
    }
  });

  it("gộp nến phút thành 1 giờ theo phiên VN (11h30 thuộc tiết 11h, ATC thuộc 14h)", () => {
    const m = (date: string, p: number): Bar => ({ date, open: p, high: p + 1, low: p - 1, close: p, volume: 10 });
    const h1 = minutesToH1([m("2026-10-21 09:15", 10), m("2026-10-21 09:59", 12), m("2026-10-21 11:29", 13), m("2026-10-21 13:00", 14), m("2026-10-21 14:45", 15)]);
    expect(h1.map((b) => b.date)).toEqual(["2026-10-21 09:00", "2026-10-21 11:00", "2026-10-21 13:00", "2026-10-21 14:00"]);
    expect(h1[0]).toMatchObject({ open: 10, close: 12, high: 13, low: 9, volume: 20 });
  });

  it("ma trận đồng thuận: chỉ MUA khi khung ngày tăng; ngày giảm thì nhịp hồi H1 = đứng ngoài; tuần ngược chiều hạ tỷ trọng", () => {
    expect(alignMatrix("UP", "UP", null, true).verdict).toBe("MUA");
    expect(alignMatrix("UP", "C", null, false).verdict).toBe("CHỜ MUA");
    expect(alignMatrix("DOWN", "UP", null, true).verdict).toBe("ĐỨNG NGOÀI");
    expect(alignMatrix("DOWN", "D", null, false).verdict).toBe("BÁN");
    expect(alignMatrix("C", "UP", null, true).verdict).toBe("GIẢM TỶ TRỌNG");
    const r7 = alignMatrix("UP", "UP", "DOWN", true);
    expect(r7.sizeMult).toBe(0.5);
    expect(r7.rules.some((r) => r.startsWith("R7"))).toBe(true);
  });

  it("phân tích đa khung đầy đủ: bối cảnh, bảng kiểm 8 mục, 2 kịch bản, chú thích tiếng Việt ghim vào nến", () => {
    const d = path([[0, 100], [200, 160], [240, 150], [300, 175]], 0.006, 5);
    // H1 tổng hợp cho 30 phiên cuối: 5 tiết / phiên quanh giá đóng cửa ngày.
    const r = rng(9);
    const h1: Bar[] = [];
    for (const b of d.slice(-60)) for (const hh of [9, 10, 11, 13, 14]) {
      const c = b.close * (1 + (r() - 0.5) * 0.006);
      h1.push({ date: `${b.date} ${String(hh).padStart(2, "0")}:00`, open: c, high: c * 1.002, low: c * 0.998, close: c, volume: 2e5 });
    }
    const res = analyzeStructureMtf({ d, h1 });
    expect(res.tfs.D).toBeTruthy(); expect(res.tfs.H1).toBeTruthy(); expect(res.tfs.W).toBeTruthy();
    expect(res.checklist.buy).toHaveLength(8);
    expect(res.scenarios.map((s) => s.side)).toEqual(["L", "S"]);
    const [L, S] = res.scenarios;
    expect(L.stop).toBeLessThan(L.trigger); expect(L.targets[0]).toBeGreaterThan(L.trigger);
    expect(S.stop).toBeGreaterThan(S.trigger); expect(S.targets[0]).toBeLessThan(S.trigger);
    expect(res.dayStageOnH1).toHaveLength(h1.length);
    // Bối cảnh ngày = giai đoạn của nến ngày TRƯỚC phiên cuối (đã đóng).
    expect(res.context.day).toBe(res.tfs.D!.stage[d.length - 2]);
    expect(res.narrative.join(" ")).toMatch(/Khung ngày/);
    for (const an of res.annotations) {
      const tfBars = res.tfs[an.tf]!.bars;
      expect(tfBars[an.index].date).toBe(an.date);
      expect(an.text.length).toBeGreaterThan(0);
    }
  });
});
