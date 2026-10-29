// CH1 — bộ mô phỏng thời điểm: ĐỐI SOÁT với số v3 trên dữ liệu THẬT (FPT, /api/cotuc/event-study 29/10/2026), bản đồ nhiệt, dải
// đường CAR, phiên tương đối của hôm nay, nhãn bậc ô (chỉ cửa sổ v3 `selected` là ĐẠT).
import { describe, expect, it } from "vitest";
import div from "./__fixtures__/event-study-FPT-dividend.json";
import earn from "./__fixtures__/event-study-FPT-earnings.json";
import { heatmap, netOf, pathBands, simulate, todayOffset, windowAt, type EventStudy } from "./timingSim";

const D = div as unknown as EventStudy, E = earn as unknown as EventStudy;

describe("timingSim — đối soát v3 trên dữ liệu thật FPT", () => {
  for (const [name, es] of [["cổ tức", D], ["KQKD Q3", E]] as const) {
    it(`${name}: mọi cửa sổ v3 — n, thắng, tỷ lệ thắng mô phỏng = số v3 (cùng công thức netReturnOfEvent)`, () => {
      expect(es.windows.length).toBeGreaterThan(0);
      for (const w of es.windows) {
        const r = simulate(es, w.entryTo, w.exitOffset);
        expect(r.n).toBe(w.nEvents);
        if (w.wins != null) expect(r.wins).toBe(w.wins);
        expect(r.n ? r.wins / r.n : 0).toBeCloseTo(w.winRate, 12);
        expect(r.window?.id).toBe(w.id);
        expect(r.tier).toBe(w.selected ? "VALIDATED" : "V3_WINDOW");
      }
    });
  }

  it("lợi suất ròng = exp(ΔCAR) − 1 − phí 0,45%; thiếu CAR -> null; ra trước vào -> không có đợt", () => {
    expect(netOf([0, 0.1], [0, 5], 0, 5, 0.0045)).toBeCloseTo(Math.exp(0.1) - 1 - 0.0045, 12);
    expect(netOf([0, null], [0, 5], 0, 5, 0.0045)).toBeNull();
    expect(simulate(D, 10, -15).n).toBe(0);
  });

  it("bản đồ nhiệt: đủ C(13,2) = 78 cặp; ô không trùng cửa sổ v3 = KHÁM PHÁ, prior trung tính", () => {
    const h = heatmap(D);
    expect(h).toHaveLength((D.offsets.length * (D.offsets.length - 1)) / 2);
    const explore = h.find((c) => !windowAt(D, c.entry, c.exit) && c.n > 0)!;
    expect(explore.tier).toBe("EXPLORATORY");
    expect(explore.prob?.priorScope).toBe("UNIFORM");
    for (const c of h) if (c.prob) { expect(c.prob.ci[0]).toBeLessThanOrEqual(c.prob.mean); expect(c.prob.ci[1]).toBeGreaterThanOrEqual(c.prob.mean); }
  });

  it("dải đường CAR: trung vị nằm giữa tứ phân vị; mốc 0 của cổ tức có đủ đợt", () => {
    const b = pathBands(D);
    expect(b).toHaveLength(D.offsets.length);
    for (const x of b) if (x.median != null) { expect(x.q25!).toBeLessThanOrEqual(x.median); expect(x.q75!).toBeGreaterThanOrEqual(x.median); }
    expect(b.find((x) => x.offset === 0)!.n).toBe(D.events.length);
  });

  it("phiên tương đối của hôm nay theo lịch phiên (bỏ ngày nghỉ)", () => {
    const sessions = ["2026-10-29", "2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04"];
    expect(todayOffset("2026-11-04", "2026-10-29", sessions)).toBe(-4);
    expect(todayOffset("2026-10-29", "2026-11-03", sessions)).toBe(3);
    expect(todayOffset(null, "2026-10-29", sessions)).toBeNull();
  });
});
