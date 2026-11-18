// A1 — mô hình hiển thị Command Deck trên DỮ LIỆU THẬT phiên 18/11/2026 (golden): bất biến, dấu bằng chứng, radar ngưỡng bán,
// rủi ro Euler, dải biến động = dải của stop, điều kiện hàng chờ, và Không gian quy tắc đối chiếu hàm Gateway.
import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/deck-2026-11-18.json";
// @ts-expect-error — mô-đun JS thuần của Gateway, dùng để đối chiếu.
import { hlScores as gatewayHlScores } from "../../../backend/src/market/elite/confluence.js";
import type { EliteDecision, EliteRisk, HlPick } from "./decisionTypes";
import { hlPicks } from "./decisionTypes";
import { breadthTone, corridorPos, deckInvariants, eulerBy, exitRadar, ledgerSeal, queueChecks, REGIME_BREADTH, ruleSpace, verdictTone, VIX_SCALE, vixPos, volBand } from "./deckModel";

const d = fixture.decision as unknown as EliteDecision;
const risk = fixture.risk as unknown as EliteRisk;
const hl = d.hl!;
const picks = hlPicks(d);

describe("Command Deck · dữ liệu thật 18/11", () => {
  it("bất biến hợp đồng đều đúng (Σ tỷ trọng + tiền mặt, Σ Euler, cách ngưỡng bán, phễu, dải = dải của stop)", () => {
    expect(deckInvariants(d, risk)).toEqual([]);
    expect(deckInvariants({ ...d, hl: { ...hl, cash: hl.cash + 0.05 } }, risk)[0]).toMatch(/Σ tỷ trọng \+ tiền mặt/);
  });

  it("dấu bằng chứng: sổ Elite HL luôn THĂM DÒ; chỉ EVIDENCE mới xanh; phán quyết kiểm định → màu", () => {
    expect(d.ledgerSummary?.label).toBe("EXPERIMENTAL");
    expect(ledgerSeal(d.ledgerSummary)).toMatchObject({ tone: "desc", text: "THĂM DÒ" });
    expect(ledgerSeal({ ...d.ledgerSummary!, label: "EVIDENCE" })).toMatchObject({ tone: "pass", text: "ĐẠT TIÊU CHÍ ĐĂNG KÝ TRƯỚC" });
    expect(["ĐẠT", "MỘT PHẦN", "KHÔNG ĐẠT", "MÔ TẢ", "CHƯA KIỂM ĐỊNH"].map(verdictTone)).toEqual(["pass", "partial", "fail", "desc", "desc"]);
  });

  it("đồng hồ: ngưỡng độ rộng của regimeAt (35/65), thang VIX 10–40", () => {
    expect(REGIME_BREADTH).toEqual({ down: 35, up: 65 });
    expect(hl.market?.breadth).toBe(21.9); expect(breadthTone(21.9)).toBe("neg"); expect(breadthTone(50)).toBe("warn"); expect(breadthTone(70)).toBe("pos");
    expect(vixPos(fixture.world.regime.vix)).toBeCloseTo((24.62 - VIX_SCALE.min) / 30, 6); expect(vixPos(55)).toBe(1); expect(vixPos(null)).toBe(0);
  });

  it("radar ngưỡng bán: HSG gần nhất (5 điểm, cảnh báo), sắp tăng dần", () => {
    const xr = exitRadar(picks, hl.rule);
    expect(xr[0]).toMatchObject({ ticker: "HSG", warn: true }); expect(Math.round(xr[0].buffer)).toBe(5);
    expect(xr.map((x) => x.buffer)).toEqual([...xr.map((x) => x.buffer)].sort((a, b) => a - b));
    expect(xr.filter((x) => x.warn).map((x) => x.ticker)).toEqual(["HSG"]);
  });

  it("rủi ro: Euler (có tương quan) khác hẳn w·σ20/Σ — VCP 2,5% so với 23%; VPL lớn nhất", () => {
    const e = eulerBy(risk);
    expect([...e.values()].reduce((a, h) => a + h.riskContribution, 0)).toBeCloseTo(1, 6);
    expect(e.get("VCP")!.riskContribution).toBeCloseTo(0.025, 2);
    expect(picks.find((p) => p.ticker === "VCP")!.riskContribution).toBeCloseTo(0.23, 2);
    expect([...e.values()].sort((a, b) => b.riskContribution - a.riskContribution)[0].ticker).toBe("VPL");
    expect(eulerBy({ ...risk, available: false }).size).toBe(0);
  });

  it("dải biến động = công thức eliteHl.js (max(σ20, 1%)·√20) và khớp dải ngầm định của stop", () => {
    for (const p of picks as HlPick[]) {
      const band = volBand(p.hl.sigma20, hl.rule);
      expect(Math.abs((1 - (p.stop as number) / (p.close as number)) / 2 - band)).toBeLessThan(1e-3);
      const c = corridorPos(p, hl.rule);
      expect(c.units).toBeCloseTo((p.hl.sinceRet ?? 0) / band, 9); expect(Math.abs(c.drawn)).toBeLessThanOrEqual(3);
    }
    expect(volBand(0.001, { sigmaFloor: 0.01, bandSessions: 20 })).toBeCloseTo(0.01 * Math.sqrt(20), 12);
  });

  it("thẻ hàng chờ: điều kiện đúng ngưỡng của Gateway", () => {
    const q = hl.queue.find((x) => x.ticker === "VPI")!;
    const c = queueChecks(q, hl.tier1!, hl.rule);
    expect(c.map((x) => x.ok)).toEqual([true, true, true, true]);
    expect(queueChecks({ lsPct: 79.9, taCount: 1, rrg: 0, advBn: 4.9 }, hl.tier1!, hl.rule).map((x) => x.ok)).toEqual([false, false, false, false]);
  });

  it("Không gian quy tắc: hlScores giao diện = hàm Gateway trên 279 mã; số đếm khớp phễu; vai trò đúng danh mục / hàng chờ", () => {
    const rows = fixture.panel.rows;
    const gw = new Map((gatewayHlScores(rows) as { ticker: string; cls: string; lsPct: number | null; taCount: number; rrg: number | null; t3: number; rank: number }[]).map((r) => [r.ticker, r]));
    const held = new Set(picks.map((p) => p.ticker)), queued = new Set([...hl.queue, ...(hl.queueIlliquid ?? [])].map((q) => q.ticker));
    const sp = ruleSpace(rows, held, queued);
    expect(sp.total).toBe(279); expect(sp.tier1).toBe(hl.funnel.tier1); expect(sp.selected).toBe(hl.funnel.selected);
    for (const p of sp.points) { const g = gw.get(p.t)!; expect([p.cls, p.ta, p.rrg]).toEqual([g.cls, g.taCount, g.rrg]); expect(Math.abs(p.ls - (g.lsPct as number))).toBeLessThan(1e-6); }
    expect(sp.points.filter((p) => p.role === "held").map((p) => p.t).sort()).toEqual([...held].sort());
    expect(sp.points.length).toBe(272);
    for (const p of picks) { const pt = sp.points.find((x) => x.t === p.ticker)!; expect(pt.cls).toBe(p.hl.cls); expect(Math.abs(pt.ls - (p.hl.lsPct ?? -1))).toBeLessThan(1e-3); }
  });
});
