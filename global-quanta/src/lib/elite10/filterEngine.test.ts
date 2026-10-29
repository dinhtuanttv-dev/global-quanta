// Bộ lọc Elite (TS) KHỚP Gateway (JS) trên cùng tệp dữ liệu; bitset, Pareto, cosine, mã hoá link, chuyển giao diện <-> bộ lọc.
import { describe, expect, it } from "vitest";
import fx from "./__fixtures__/elite-filter-parity.json";
import { Bits, condBits, cosine, decodeFilter, encodeFilter, evaluateFilter, paretoFront, type EliteFilter, type FCtx } from "./filterEngine";
import { DEFAULT_UI, filterToUi, PRESETS, uiToFilter } from "./signalSemantics";

const ctx: FCtx = { rows: fx.rows as FCtx["rows"], scores: new Map(Object.entries(fx.scores)), buyZone: new Set(fx.buyZone) };

describe("Bộ lọc Elite (TS)", () => {
  it("khớp TỪNG kết quả của Gateway trên bộ dữ liệu chung (6 bộ lọc: ngưỡng, k/n, phân vị trung lập ngành, loại trừ, thanh khoản, vùng mua)", () => {
    (fx.filters as EliteFilter[]).forEach((f, i) => {
      const r = evaluateFilter(f, ctx);
      expect(r.pass).toEqual(fx.expected[i].pass);
      expect(r.perCond).toEqual(fx.expected[i].perCond);
    });
  });
  it("bitset: đếm + giao + trừ khớp lọc tuần tự", () => {
    const a = condBits({ sig: "stealth20", op: ">=", val: 0 }, ctx), b = condBits({ sig: "stealth5", op: ">=", val: 0 }, ctx);
    const n = ctx.rows.filter((r) => (r.values.stealth20 ?? -9) >= 0 && (r.values.stealth5 ?? -9) >= 0).length;
    expect(a.and(b).count()).toBe(n);
    expect(a.andNot(b).count()).toBe(a.count() - n);
    const z = new Bits(70); z.set(0); z.set(33); z.set(69);
    expect(z.count()).toBe(3);
  });
  it("Pareto: chỉ mã không bị trội; cosine; link chia sẻ khứ hồi", () => {
    const v: Record<string, number[]> = { A: [3, 1], B: [1, 3], C: [1, 1], D: [3, 3] };
    expect([...paretoFront(Object.keys(v), (t) => v[t])]).toEqual(["D"]);
    expect([...paretoFront(["A", "B", "C"], (t) => v[t])].sort()).toEqual(["A", "B"]);
    expect(cosine([90, 90, 10], [80, 85, 20])!).toBeGreaterThan(0.9);
    expect(cosine([90, null, 10], [80, 85, null])).toBeNull();
    const f = uiToFilter(DEFAULT_UI);
    expect(decodeFilter(encodeFilter(f))).toEqual(f);
    expect(decodeFilter("rác")).toBeNull();
  });
  it("giao diện <-> bộ lọc khứ hồi cho mọi bộ chọn sẵn; trung lập ngành chỉ áp điều kiện phân vị", () => {
    for (const p of PRESETS) expect(filterToUi(uiToFilter(p.ui)).ui).toEqual(p.ui);
    const n = uiToFilter({ ...DEFAULT_UI, neutral: true });
    expect(n.conds.filter((c) => c.op === "p>=").every((c) => c.neutral)).toBe(true);
    expect(n.conds.filter((c) => c.op !== "p>=").some((c) => c.neutral)).toBe(false);
    expect(filterToUi({ v: 1, mode: "all", conds: [{ sig: "x", op: ">=", val: 1 }] }).dropped).toBe(1);
  });
});
