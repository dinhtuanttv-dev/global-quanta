import { describe, expect, it } from "vitest";
import { alternationTag, classifyMotive, classifySevenLeg, classifyThreeLeg, classifyTriangle, innerPivots, rankFits, type PatternPoint } from "./patterns";
import { elliottState, patternsOf } from "./index";
import type { ElliottScenario } from "./elliottGet.js";
import type { OhlcvBar } from "../../ta-command-center/types";

/** Dãy pivot: giá theo thứ tự, mỗi pivot cách nhau 10 nến. */
const pts = (...prices: number[]): PatternPoint[] => prices.map((price, k) => ({ i: k * 10, price }));
const tags = (f: ReturnType<typeof classifyThreeLeg>) => f.filter((x) => x.valid).map((x) => x.tag);

describe("DW4 — sóng đẩy: xung lực / nêm", () => {
  it("xung lực chuẩn: IM hợp lệ, nêm bị loại (sóng 4 không lấn sóng 1)", () => {
    const f = classifyMotive(pts(100, 110, 104, 124, 117, 128));
    expect(f[0].tag).toBe("IM"); expect(f[0].valid).toBe(true);
    expect(f.filter((x) => x.tag !== "IM").every((x) => !x.valid)).toBe(true);
  });
  it("sóng 4 lấn sóng 1 + hai đường hội tụ: IM bị loại, nêm thu hẹp hợp lệ (ED ở vị trí sóng 5, LD ở sóng 1)", () => {
    const p = pts(100, 112, 104, 114, 108.5, 115);
    const last = classifyMotive(p, "last");
    expect(last.find((x) => x.tag === "IM")!.valid).toBe(false);
    expect(last[0].tag).toBe("ED"); expect(last[0].valid).toBe(true);
    expect(classifyMotive(p, "first")[0].tag).toBe("LD");
    expect(classifyMotive(p, "middle").map((x) => x.tag)).toEqual(["IM"]);
  });
  it("quy tắc cứng: sóng 2 vượt gốc sóng 1 / sóng 3 ngắn nhất -> không mô hình nào hợp lệ", () => {
    expect(classifyMotive(pts(100, 110, 99, 120, 115, 125)).some((x) => x.valid)).toBe(false);
    expect(classifyMotive(pts(100, 115, 108, 114, 112, 130)).some((x) => x.valid)).toBe(false);
  });
});

describe("DW4 — điều chỉnh 3 chặng", () => {
  it("zigzag: B hồi 50%, C vượt cuối A", () => {
    const f = classifyThreeLeg(...(pts(100, 90, 95, 84) as [PatternPoint, PatternPoint, PatternPoint, PatternPoint]));
    expect(f[0].tag).toBe("ZZ"); expect(tags(f)).not.toContain("FL");
  });
  it("flat: B ≈ 95% A, C ≈ A -> FL xếp trên ZZ", () => {
    const f = classifyThreeLeg(...(pts(100, 90, 99.5, 89.5) as [PatternPoint, PatternPoint, PatternPoint, PatternPoint]));
    expect(f[0].tag).toBe("FL");
  });
  it("flat mở rộng: B vượt điểm đầu A (130%), C vượt cuối A; flat chạy: C không tới cuối A", () => {
    const ex = classifyThreeLeg(...(pts(100, 90, 103, 84) as [PatternPoint, PatternPoint, PatternPoint, PatternPoint]));
    expect(ex[0].tag).toBe("EX-FL"); expect(tags(ex)).not.toContain("ZZ");
    const run = classifyThreeLeg(...(pts(100, 90, 103, 92) as [PatternPoint, PatternPoint, PatternPoint, PatternPoint]));
    expect(run[0].tag).toBe("RFL");
  });
  it("W-X-Y chỉ hợp lệ khi đếm được W và Y đều 3 sóng con", () => {
    const p = pts(100, 90, 95, 84) as [PatternPoint, PatternPoint, PatternPoint, PatternPoint];
    expect(classifyThreeLeg(...p).find((x) => x.tag === "D3")!.valid).toBe(false);
    expect(classifyThreeLeg(...p, { aWaves: 3, cWaves: 3 }).find((x) => x.tag === "D3")!.valid).toBe(true);
    // A có 5 sóng con -> zigzag (5-3-5) được ưu tiên
    expect(classifyThreeLeg(...p, { aWaves: 5, cWaves: 5 })[0].tag).toBe("ZZ");
  });
  it("C chưa hình thành: zigzag vẫn hợp lệ (đang chờ), flat mở rộng chưa khẳng định", () => {
    const f = classifyThreeLeg(...(pts(100, 90, 95) as [PatternPoint, PatternPoint, PatternPoint]), null);
    expect(f.find((x) => x.tag === "ZZ")!.valid).toBe(true);
  });
});

describe("DW4 — tam giác & điều chỉnh kép", () => {
  it("tam giác thu hẹp ABCDE (thẻ quy tắc): hội tụ, không sóng nào vượt điểm đầu sóng trước", () => {
    const f = classifyTriangle(pts(100, 90, 98, 92, 96.5, 93.5));
    expect(f[0].tag).toBe("TR"); expect(f[0].valid).toBe(true);
    expect(f.find((x) => x.tag === "ETR")!.valid).toBe(false);
  });
  it("tam giác chạy: B vượt điểm đầu A; tam giác mở rộng: mỗi sóng vượt điểm đầu sóng trước", () => {
    expect(classifyTriangle(pts(100, 90, 101, 93, 99, 95))[0].tag).toBe("RTR");
    const e = classifyTriangle(pts(100, 97, 101, 95, 103, 92));
    expect(e[0].tag).toBe("ETR"); expect(e[0].valid).toBe(true);
  });
  it("zigzag kép: hai zigzag nối bằng X, Y đi xa hơn W", () => {
    const f = classifySevenLeg(pts(100, 90, 95, 84, 89, 80, 84, 74));
    expect(f[0].tag).toBe("DZ"); expect(f[0].valid).toBe(true);
    expect(f[0].labels).toEqual(["0", "a", "b", "W", "X", "a", "b", "Y"]);
  });
  it("luân phiên: zigzag = Sharp, flat / tam giác = Sideways; không phân loại được -> theo độ sâu", () => {
    const zz = classifyThreeLeg(...(pts(100, 90, 95, 84) as [PatternPoint, PatternPoint, PatternPoint, PatternPoint]))[0];
    const tr = classifyTriangle(pts(100, 90, 98, 92, 96.5, 93.5))[0];
    expect(alternationTag(zz, 0.6)).toBe("Sharp");
    expect(alternationTag(tr, 0.3)).toBe("Sideways");
    expect(alternationTag(null, 0.62)).toBe("Sharp");
    expect(alternationTag(null, 0.3)).toBe("Sideways");
  });
  it("xếp hạng ổn định: hợp lệ trước, điểm mềm, rồi thứ tự khai báo", () => {
    const f = classifyThreeLeg(...(pts(100, 90, 99.5, 89.5) as [PatternPoint, PatternPoint, PatternPoint, PatternPoint]));
    expect(rankFits(f).map((x) => x.tag)).toEqual(f.map((x) => x.tag));
  });
});

const day = (i: number) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10);
function bars(n: number, f: (i: number) => number, off = 0): OhlcvBar[] {
  return Array.from({ length: n }, (_, i) => { const c = f(i); return { date: day(i + off), open: c * 0.998, high: c * 1.006, low: c * 0.994, close: c, volume: 1000 }; });
}
const legsFn = (legs: number[][]) => (i: number) => {
  for (let k = 1; k < legs.length; k++) if (i <= legs[k][0]) { const [i0, p0] = legs[k - 1], [i1, p1] = legs[k]; return p0 + ((p1 - p0) * (i - i0)) / (i1 - i0); }
  return legs[legs.length - 1][1];
};

describe("DW4 — tích hợp engine", () => {
  it("elliottState gắn thẻ mô hình cho cách đếm chính (sóng đẩy + sóng 2/4 + điều chỉnh sau sóng 5); tất định", () => {
    const COMPLETE = [[0, 100], [20, 120], [30, 110], [55, 145], [65, 133], [80, 151], [92, 136], [100, 142], [110, 139]];
    const b = [...bars(60, (i) => 100 + Math.sin(i / 3) * 1.5), ...bars(111, legsFn(COMPLETE), 60)];
    const st = elliottState(b)!;
    const pt = st.patterns!;
    expect(pt.motive?.best?.tag).toBe("IM");
    expect(pt.wave2 && ["Sharp", "Sideways"]).toContain(pt.wave2!.alt);
    expect(pt.correction?.fits.length).toBeGreaterThan(0);
    expect(elliottState(b)!.patterns).toEqual(pt);
    for (const a of st.alternates ?? []) expect(a.patterns).toBeDefined();
  });
  it("innerPivots: giữ điểm đầu / cuối, các điểm giữa xen kẽ hướng", () => {
    const b = bars(60, legsFn([[0, 100], [15, 92], [30, 97], [45, 88], [59, 90]]));
    const c = b.map((x) => ({ time: x.date, open: x.open, high: x.high, low: x.low, close: x.close, volume: x.volume }));
    const r = innerPivots(c, { i: 0, price: 100 }, { i: 45, price: 88 }, 0.02);
    expect(r[0].i).toBe(0); expect(r[r.length - 1].i).toBe(45);
    for (let k = 2; k < r.length; k++) expect(Math.sign(r[k].price - r[k - 1].price)).not.toBe(Math.sign(r[k - 1].price - r[k - 2].price));
  });
});

describe("DW4 — quy tắc nhất quán đỉnh/đáy (pivot-extreme)", () => {
  const candles = (prices: number[]) => prices.map((c, i) => ({ time: day(i), open: c, high: c, low: c, close: c, volume: 1 }));
  const scen = (pts: [number, number][]) => ({ dir: "up", status: "wave5-forming", points: pts.map(([i, price], k) => ({ i, price, time: day(i), type: k % 2 ? "H" : "L", confirmed: true, ci: i })) }) as unknown as ElliottScenario;
  it("giá trong sóng 4 vượt đỉnh sóng 3 -> sóng đẩy bị gắn cờ không nhất quán, mọi mô hình sóng đẩy không hợp lệ", () => {
    const pr = Array.from({ length: 60 }, (_, i) => 100 + i);
    pr[45] = 200;                                   // đỉnh cao hơn "sóng 3" (i=40) nằm giữa 3 và 4
    const sc = scen([[0, 100], [10, 110], [20, 104], [40, 140], [50, 130], [59, 150]]);
    const p = patternsOf(sc, [], candles(pr), 0.03);
    expect(p.consistent).toBe(false);
    expect(p.motive!.best).toBeNull();
    expect(p.motive!.fits[0].rules[0].id).toBe("pivot-extreme");
  });
});
