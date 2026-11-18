// LQ1 — thư viện hiển thị thanh khoản: tính lại từ chuỗi 60 phiên GIỐNG HỆT Gateway (đối chiếu từng trường), câu lý do, cờ đang giữ, năng lực danh mục.
import { describe, expect, it } from "vitest";
// @ts-expect-error — mô-đun JS thuần của Gateway, dùng để đối chiếu.
import { liquidityStats, liquiditySeries, lqPublicRules } from "../../../backend/src/market/elite/liquidity.js";
import { holdFlag, LQ_DEFAULT, lqTooltip, portfolioCapacity, reasonText, splitQueue, statsFromSeries } from "./liquidity";
import type { HlQueueItem, LiqStats } from "./decisionTypes";

const day = (i: number) => new Date(Date.UTC(2026, 6, 1) + i * 864e5).toISOString().slice(0, 10);
const rows = (vals: (i: number) => number | null, ret: (i: number) => number = () => 0.004) => {
  let p = 10000; return Array.from({ length: 81 }, (_, i) => { if (i) p *= 1 + ret(i); const v = vals(i); return { date: day(i), closeAdj: p, value: v == null ? null : v * 1e9 }; });
};
const FIX: [string, (i: number) => number | null, (i: number) => number, number][] = [
  ["sâu đều", () => 120, (i) => (i % 2 ? 0.003 : -0.002), 0.012],
  ["đột biến", (i) => (i === 80 ? 95 : 0.3), () => 0.01, 0.03],
  ["mỏng + cạn cầu", (i) => (i % 7 === 0 ? 0.2 : 6.5), (i) => (i === 70 ? -0.065 : 0.006), 0.022],
  ["trượt giá cao", () => 6, (i) => (i % 2 ? 0.068 : -0.06), 0.05],
  ["thiếu số liệu", (i) => (i > 70 ? 9 : null), () => 0.01, 0.02],
];
const near = (a: unknown, b: unknown) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-3) : a === b);

describe("statsFromSeries ≡ liquidityStats của Gateway", () => {
  it("ngưỡng công khai của Gateway trùng mặc định của giao diện", () => {
    const pub = lqPublicRules();
    for (const [k, v] of Object.entries(LQ_DEFAULT)) expect(near(pub[k], v), k).toBe(true);
  });
  for (const [name, vals, ret, sig] of FIX) it(name, () => {
    const r = rows(vals, ret), gw = liquidityStats(r, sig) as LiqStats, ui = statsFromSeries(liquiditySeries(r), sig, LQ_DEFAULT);
    expect(ui.tier).toBe(gw.tier); expect(ui.reasons).toEqual(gw.reasons);
    for (const k of ["n20", "n60", "med20", "mean20", "p10", "min20", "max20", "density", "maxShare", "illiq", "stressDays", "capacityBn", "capitalMaxBn", "binding", "impactPct", "dtl"] as const)
      expect(near(ui[k], gw[k]), `${name}.${k}: ${ui[k]} vs ${gw[k]}`).toBe(true);
  });
  it("vốn lớn hơn làm ngưỡng chặt hơn (L2 ở 5 tỷ -> L3 ở 50 tỷ)", () => {
    const ser = liquiditySeries(rows(() => 30, (i) => (i % 2 ? 0.004 : -0.004)));
    expect(statsFromSeries(ser, 0.015, LQ_DEFAULT, 5).tier).toBe("L2");
    const big = statsFromSeries(ser, 0.015, LQ_DEFAULT, 50);
    expect(big.tier).toBe("L3"); expect(big.reasons).toContain("MED");
  });
});

describe("chữ và cờ", () => {
  const vcp: LiqStats = { version: "LQ-v1", tier: "L4", reasons: ["MED_ABS", "ILLIQ_MAX"], n20: 20, n60: 60, med20: 3.6, mean20: 5.5, p10: 0.3, min20: 0.02, max20: 18.7, density: 9, maxShare: 0.17, illiq: 3.17, stressDays: 1, capacityBn: 0.08, capitalMaxBn: 0.53, binding: "impact", impactPct: 1.6, dtl: 8.3 };
  it("lý do có số đo, định dạng Việt Nam", () => {
    expect(reasonText("MED_ABS", vcp, LQ_DEFAULT)).toBe("Trung vị GTGD 20 phiên 3,6 tỷ < sàn 5,0 tỷ");
    expect(reasonText("ILLIQ_MAX", vcp, LQ_DEFAULT)).toMatch(/3,17%\/tỷ > trần 1,0%\/tỷ/);
    expect(reasonText("P10", vcp, LQ_DEFAULT)).toMatch(/300 tr < 1,25 tỷ/);
    expect(reasonText("STRESS", vcp, LQ_DEFAULT)).toMatch(/1 phiên giảm ≥ 5%/);
  });
  it("cờ đang giữ: cạn cầu = đỏ; trung vị thấp = vàng; mã sạch = không cờ", () => {
    expect(holdFlag(vcp, 0.08, 0.042, LQ_DEFAULT)?.level).toBe("red");
    expect(holdFlag({ ...vcp, stressDays: 0 }, 0.08, 0.042, LQ_DEFAULT)?.text).toMatch(/Trung vị 3,6 tỷ < 70% ngưỡng vào/);
    expect(holdFlag({ ...vcp, tier: "L1", reasons: [], stressDays: 0, med20: 400, p10: 300 }, 0.1, 0.02, LQ_DEFAULT)).toBeNull();
  });
  it("chú thích huy hiệu đầy đủ và nói rõ là mô tả", () => {
    const t = lqTooltip(vcp, LQ_DEFAULT, 0.042, 0.08);
    expect(t).toMatch(/L4 · Chỉ nghiên cứu/); expect(t).toMatch(/Trung vị 20 phiên 3,6 tỷ · trung bình 5,5 tỷ/); expect(t).toMatch(/không đổi danh mục/);
  });
  it("năng lực danh mục = vị thế chặt nhất / tỷ trọng; tách hàng chờ cho cả Gateway cũ và mới", () => {
    const c = portfolioCapacity([{ ticker: "VIC", weight: 0.1, liq: { ...vcp, tier: "L1", med20: 446, p10: 366 }, sigma20: 0.02 }, { ticker: "VCP", weight: 0.08, liq: vcp, sigma20: 0.042 }], LQ_DEFAULT);
    expect(c?.ticker).toBe("VCP"); expect(c?.binding).toBe("impact"); expect(c!.capitalBn).toBeCloseTo(3.6 * (0.005 / (0.8 * 0.042)) ** 2 / 0.08, 6);
    const q = (t: string, code: HlQueueItem["code"]) => ({ ticker: t, code }) as HlQueueItem;
    expect(splitQueue([q("A", "wait"), q("B", "illiquid")])).toEqual({ tradable: [q("A", "wait")], illiquid: [q("B", "illiquid")] });
    expect(splitQueue([q("A", "wait")], [q("C", "illiquid")]).illiquid.map((x) => x.ticker)).toEqual(["C"]);
  });
});
