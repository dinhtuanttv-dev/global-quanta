// HL-v1: bản máy chủ (sổ theo dõi tiến) phải cho ĐÚNG kết quả của bản giao diện trên cùng bảng tín hiệu.
import { describe, expect, it } from "vitest";
// @ts-expect-error mô-đun JS của Gateway, không có khai báo kiểu
import { hlScores as serverScores } from "../../../backend/src/market/elite/confluence.js";
import { hlCompare, hlScores } from "./confluence";

describe("HL-v1 giao diện = máy chủ", () => {
  it("300 mã ngẫu nhiên (có giá trị thiếu, trùng): hạng, điểm ba tầng và phân loại khớp từng mã", () => {
    let st = 20261112; const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    const maybe = (v: number) => (rnd() < 0.15 ? null : v);
    const rows = Array.from({ length: 300 }, (_, i) => ({ ticker: `T${String(i).padStart(3, "0")}`, values: {
      ls_v1: maybe(Math.round((rnd() * 6 - 3) * 10) / 10), top20_alpha: maybe(Math.round(rnd() * 20) / 10),
      sepa_state: maybe(pick([2, 1, 0.5, 0, -0.5, -1])), base_breakout: maybe(pick([3, 2, 1, 0])), convergence: maybe(pick([3, 2, 1, 0, -2])), pattern_state: maybe(pick([1, 0.5, 0.25, 0])),
      structure_score: maybe(Math.floor(rnd() * 8)), structure_stage: maybe(pick([2, 0, -1, -2])), structure_verdict: maybe(pick([2, 1, 0, -2])),
      rrg_quadrant: maybe(pick([2, 1, -1, -2])), stealth20: maybe(rnd() * 6 - 3), stealth5: maybe(rnd() * 6 - 3), net_intent: maybe(rnd() * 2 - 1), foreign_net_buy: maybe(pick([0, 1])),
      fa_score: maybe(Math.floor(rnd() * 100)), ws_sector_alpha: maybe(rnd() - 0.5), catalyst_impact: maybe(pick([2, 1, 0, -1])), cotuc_decision: maybe(pick([1, 0, -1])),
    } }));
    const ui = [...hlScores(rows).values()].sort(hlCompare).map((x) => [x.ticker, x.rank, x.t1, x.t2, x.t3, x.cls, x.pass1, x.lsPct]);
    const server = (serverScores(rows) as { ticker: string; rank: number; t1: number; t2: number; t3: number; cls: string; pass1: boolean; lsPct: number | null }[]).map((x) => [x.ticker, x.rank, x.t1, x.t2, x.t3, x.cls, x.pass1, x.lsPct]);
    expect(server).toEqual(ui);
    expect(ui.filter((x) => x[6]).length).toBeGreaterThan(5);
  });
});
