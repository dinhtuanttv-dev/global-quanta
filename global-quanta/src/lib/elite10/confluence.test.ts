// HL-v1: hợp lưu đa yếu tố theo quy tắc chủ dự án — tầng 1 (LS-v1 + mô hình TA) ưu tiên trước, rồi RRG, rồi tích điểm các tab.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { HL_RULES, hlCompare, hlScores, hlSelected, midPercentiles, type HlRowIn } from "./confluence";

const TA_ALL = { sepa_state: 2, base_breakout: 3, convergence: 2, pattern_state: 1, structure_score: 7, structure_stage: 2, structure_verdict: 2 };
/** 10 mã: ls_v1 tăng dần T0…T9 (T8, T9 thuộc top 20%). */
const rows = (over: Record<string, Record<string, number | null>> = {}): HlRowIn[] =>
  Array.from({ length: 10 }, (_, i) => ({ ticker: `T${i}`, values: { ls_v1: i / 10, ...(over[`T${i}`] ?? {}) } }));

describe("hlScores (HL-v1)", () => {
  it("midPercentiles: hạng giữa, giá trị trùng cùng phân vị, bỏ null", () => {
    const p = midPercentiles([{ ticker: "A", values: { x: 1 } }, { ticker: "B", values: { x: 1 } }, { ticker: "C", values: { x: 5 } }, { ticker: "D", values: { x: null } }], "x");
    expect(p.get("A")).toBeCloseTo(33.33, 1); expect(p.get("B")).toBeCloseTo(33.33, 1); expect(p.get("C")).toBeCloseTo(83.33, 1); expect(p.has("D")).toBe(false);
  });

  it("tầng 1: cần LS-v1 top 20% VÀ ≥ 2 mô hình TA; điểm tầng 1 = LS (0–5) + số mô hình TA (tối đa 5)", () => {
    const s = hlScores(rows({ T9: { ...TA_ALL }, T8: { sepa_state: 1 }, T5: { ...TA_ALL } }));
    const t9 = s.get("T9")!, t8 = s.get("T8")!, t5 = s.get("T5")!;
    expect(t9.lsPct).toBe(95); expect(t9.lsPts).toBe(5); expect(t9.taCount).toBe(7); expect(t9.taPts).toBe(5); expect(t9.t1).toBe(10); expect(t9.pass1).toBe(true);
    expect(t8.lsPts).toBe(5); expect(t8.taCount).toBe(1); expect(t8.pass1).toBe(false); // chỉ 1 mô hình TA
    expect(t5.lsPts).toBe(1); expect(t5.pass1).toBe(false); // đủ TA nhưng LS chưa thuộc top 20%
    expect(HL_RULES).toMatchObject({ lsLeaderPct: 80, taMin: 2 });
  });

  it("tầng 2: Cải thiện / Dẫn dắt = ủng hộ; Suy yếu / Tụt hậu = phản đối; thiếu RRG = 0", () => {
    const s = hlScores(rows({ T9: { ...TA_ALL, rrg_quadrant: 1 }, T8: { ...TA_ALL, rrg_quadrant: 2 }, T7: { rrg_quadrant: -1 }, T6: { rrg_quadrant: -2 } }));
    expect([s.get("T9")!.t2, s.get("T8")!.t2, s.get("T7")!.t2, s.get("T6")!.t2, s.get("T0")!.t2]).toEqual([1, 1, -1, -1, 0]);
    expect(s.get("T9")!.cls).toBe("CONFLUENCE"); expect(hlSelected(s.get("T9"))).toBe(true);
    const against = hlScores(rows({ T9: { ...TA_ALL, rrg_quadrant: -2 } })).get("T9")!;
    expect(against.cls).toBe("T1_SECTOR_AGAINST"); expect(hlSelected(against)).toBe(false);
    expect(hlScores(rows({ T9: { ...TA_ALL } })).get("T9")!.cls).toBe("T1_SECTOR_NA");
  });

  it("tầng 3: +1 / −1 theo từng yếu tố của các tab, thiếu dữ liệu không tính; ≥ 2 điểm -> Hợp lưu mạnh", () => {
    const s = hlScores(rows({ T9: { ...TA_ALL, rrg_quadrant: 2, stealth20: 1.4, foreign_net_buy: 1, fa_score: 20, ws_sector_alpha: 3, catalyst_impact: 2, cotuc_decision: -1 } }));
    const r = s.get("T9")!;
    expect(Object.fromEntries(r.factors.map((f) => [f.id, f.pts]))).toEqual({ stealth20: 1, foreign_net_buy: 1, fa_score: -1, ws_sector_alpha: 1, catalyst_impact: 1, cotuc_decision: -1 });
    expect(r.t3).toBe(2); expect(r.cls).toBe("STRONG");
    expect(r.factors.find((f) => f.id === "stealth5")).toBeUndefined(); // không có dữ liệu -> không có dòng, không điền 0
  });

  it("xếp hạng theo đúng ưu tiên: đạt tầng 1 trước, rồi điểm tầng 1, rồi RRG, rồi tích điểm", () => {
    const s = hlScores(rows({
      T9: { sepa_state: 1, base_breakout: 2, rrg_quadrant: -2 },                    // đạt T1 (2 TA), ngành phản đối
      T8: { sepa_state: 1, base_breakout: 2, rrg_quadrant: 2, stealth20: -2 },       // đạt T1 (2 TA), ngành ủng hộ, T3 âm
      T3: { ...TA_ALL, rrg_quadrant: 2, stealth20: 2, catalyst_impact: 2, cotuc_decision: 1 }, // KHÔNG đạt T1 dù T2, T3 rất tốt
    }));
    const order = [...s.values()].sort(hlCompare).map((x) => x.ticker);
    expect(order.slice(0, 2)).toEqual(["T8", "T9"]); // cùng đạt T1, cùng điểm T1 = 7 -> RRG quyết định
    expect(s.get("T8")!.rank).toBe(1); expect(s.get("T3")!.pass1).toBe(false); expect(s.get("T3")!.rank).toBeGreaterThan(2);
  });

  // Chạy thử trên bảng tín hiệu thật: HL_PANEL=<đường dẫn panel.json> npx vitest run src/lib/elite10/confluence.test.ts
  it.runIf(Boolean(process.env.HL_PANEL))("bảng tín hiệu thật", () => {
    const p = JSON.parse(fs.readFileSync(process.env.HL_PANEL!, "utf8")); const s = hlScores(p.rows);
    const all = [...s.values()].sort(hlCompare), cnt: Record<string, number> = {};
    for (const x of all) cnt[x.cls] = (cnt[x.cls] ?? 0) + 1;
    console.log(p.date, "mã", all.length, JSON.stringify(cnt), "đạt tầng 1:", all.filter((x) => x.pass1).length);
    console.log(all.slice(0, 20).map((x) => `${x.rank}. ${x.ticker} ${x.cls} T1 ${x.t1} (LS ${Math.round(x.lsPct ?? -1)}, TA ${x.taCount}/${x.taKnown}) T2 ${x.t2} (rrg ${x.rrg}) T3 ${x.t3}`).join("\n"));
    expect(all.length).toBeGreaterThan(100);
  });
});
