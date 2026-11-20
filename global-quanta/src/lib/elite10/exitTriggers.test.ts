// Radar 4 điều kiện bán — dữ liệu SỐNG 18/11 và 20/11/2026 + các ca biên.
import { describe, expect, it } from "vitest";
import deck from "./__fixtures__/deck-2026-11-18.json";
import px from "./__fixtures__/pulse-2026-11-20.json";
import { hlPicks, type EliteDecision, type HlPick } from "./decisionTypes";
import { EXIT_DEFAULTS, exitRules, exitTriggerRow, exitTriggers } from "./exitTriggers";

const d18 = deck.decision as unknown as EliteDecision, d20 = px.decision as unknown as EliteDecision;

describe("Bốn điều kiện bán", () => {
  it("ngưỡng đọc từ hl.rule (gồm exitRrg, missSessions) — trùng HL_PF của backend", () => {
    expect(exitRules(d20)).toEqual({ exitLsPct: 60, warnLsPct: 70, exitTaMin: 1, exitRrg: -2, missSessions: 2, taModels: 7 });
  });
  it("18/11 thật: HSG đứng đầu — LS 65 dưới mức cảnh báo 70 VÀ chỉ còn 1 mô hình TA (radar cũ chỉ thấy LS)", () => {
    const rows = exitTriggers(hlPicks(d18), exitRules(d18));
    expect(rows[0]).toMatchObject({ ticker: "HSG", near: 2, ls: { level: "NEAR", text: "65 · cách 5" }, ta: { level: "NEAR", text: "1/7" } });
    expect(rows.map((r) => r.ticker)).toHaveLength(hlPicks(d18).length);
  });
  it("20/11 thật: HSG TA 2/7 -> cần theo dõi; AAS, VIC ngành Cải thiện -> không sát; đủ dữ liệu", () => {
    const by = new Map(exitTriggers(hlPicks(d20), exitRules(d20)).map((r) => [r.ticker, r]));
    expect(by.get("HSG")).toMatchObject({ near: 1, watch: 1, ta: { level: "WATCH" } });
    expect(by.get("VIC")!.rrg).toMatchObject({ level: "OK", text: "Cải thiện" });
    for (const r of by.values()) expect(r.data.text).toBe("đủ");
  });
  it("mã THIẾU điểm LS (radar cũ bỏ mất) vẫn có dòng: LS thiếu + đếm vắng 1/2; ngành Suy yếu = sát Tụt hậu", () => {
    const p = JSON.parse(JSON.stringify(hlPicks(d20)[0])) as HlPick;
    p.hl.lsPct = null as unknown as number; p.hl.exitBufferLs = null; p.hl.miss = 1; p.hl.rrg = -1;
    const r = exitTriggerRow(p, EXIT_DEFAULTS);
    expect(r).toMatchObject({ ls: { level: "NEAR", text: "thiếu điểm" }, data: { level: "NEAR", text: "vắng 1/2" }, rrg: { level: "NEAR", text: "Suy yếu" }, ta: { level: "WATCH", text: "—" } });
    expect(exitTriggers([hlPicks(d20)[1], p], EXIT_DEFAULTS)[0].ticker).toBe(p.ticker);
  });
  it("tài liệu cũ thiếu exitRrg / missSessions -> dùng mặc định của backend", () => {
    const d = JSON.parse(JSON.stringify(d20)) as EliteDecision;
    delete (d.hl!.rule as Record<string, unknown>).exitRrg; delete (d.hl!.rule as Record<string, unknown>).missSessions;
    expect(exitRules(d)).toMatchObject({ exitRrg: -2, missSessions: 2 });
  });
});
