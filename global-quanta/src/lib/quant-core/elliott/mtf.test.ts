import { describe, expect, it } from "vitest";
import { elliottMtf, lastWeekPartial, mtfRelation } from "./mtf";
import type { ElliottState } from "./index";
import type { OhlcvBar } from "../../ta-command-center/types";

/** Nến ngày T2–T6 liên tiếp từ 2023-01-02, giá theo hàm f(i). */
function weekdays(n: number, f: (i: number) => number): OhlcvBar[] {
  const out: OhlcvBar[] = []; const d = new Date("2023-01-02T00:00:00Z");
  while (out.length < n) {
    const u = d.getUTCDay();
    if (u >= 1 && u <= 5) { const p = f(out.length); out.push({ date: d.toISOString().slice(0, 10), open: p, high: p * 1.004, low: p * 0.996, close: p, volume: 1e6 }); }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
const st = (wave: ElliottState["wave"], dir: "up" | "down" | null) => ({ wave, dir }) as ElliottState;

describe("Elliott đa khung (E3)", () => {
  it("quan hệ hai khung: cùng chiều / ngày điều chỉnh trong sóng đẩy tuần / ngược chiều / chưa rõ", () => {
    expect(mtfRelation(st("3", "up"), st("5", "up")).relation).toBe("aligned");
    expect(mtfRelation(st("3", "up"), st("C", "down")).relation).toBe("aligned"); // C sau 5 sóng giảm = đang đi lên
    const pb = mtfRelation(st("5", "up"), st("4", "up"));
    expect(pb.relation).toBe("pullback");
    expect(pb.text).toContain("điều chỉnh bên trong sóng 5 tuần");
    expect(mtfRelation(st("A", "up"), st("3", "up")).relation).toBe("counter");
    expect(mtfRelation(st("B", "up"), st("3", "up")).relation).toBe("aligned"); // B đi cùng chiều xung lực trước
    expect(mtfRelation(st("none", null), st("3", "up")).relation).toBe("unclear");
    expect(mtfRelation(null, st("3", "up")).relation).toBe("unclear");
  });

  it("tuần cuối chưa hết: còn ngày giao dịch sau nến cuối; Thứ Sáu / trước nghỉ lễ = đã hết", () => {
    const b = (date: string) => [{ date, open: 1, high: 1, low: 1, close: 1, volume: 1 }];
    expect(lastWeekPartial(b("2026-10-08"))).toBe(true);  // Thứ Năm
    expect(lastWeekPartial(b("2026-10-09"))).toBe(false); // Thứ Sáu
    expect(lastWeekPartial(b("2026-04-29"))).toBe(false); // Thứ Tư; 30/4 + 1/5 nghỉ lễ
    expect(lastWeekPartial(b("2025-12-31"))).toBe(true);  // Thứ Tư; 1/1/2026 nghỉ nhưng 2/1 (Thứ Sáu) còn giao dịch
    expect(lastWeekPartial(b("2026-10-10"))).toBe(false); // Thứ Bảy
  });

  it("khung tuần gộp từ nến ngày; pivot tuần ghim vào nến ngày đạt cực trị của tuần", () => {
    const f = (i: number) => 100 + 30 * Math.sin(i / 40) + i * 0.08;
    const r = elliottMtf(weekdays(750, f));
    expect(r.day).not.toBeNull();
    expect(r.week).not.toBeNull();
    expect(r.week!.label).toContain("khung tuần");
    const days = new Set(weekdays(750, f).map((x) => x.date));
    for (const p of r.weekPivotsOnDaily) expect(days.has(p.dayDate)).toBe(true);
  });

  it("dưới 60 tuần -> không có khung tuần", () => {
    expect(elliottMtf(weekdays(200, (i) => 100 + Math.sin(i / 5) * 5)).week).toBeNull();
  });
});
