// MP-b / MP-c: đổi phí không lệch một chữ số ở phí engine; phí cao hơn -> kết quả ròng thấp hơn đúng bằng chênh phí; so sánh hai cách
// chỉ hiện khi đủ điều kiện, và không có trường "cách nào tốt hơn".
import { describe, expect, it } from "vitest";
import div from "./__fixtures__/event-study-FPT-dividend.json";
import fptBars from "./__fixtures__/ohlcv-FPT-5y.json";
import vniBars from "./__fixtures__/ohlcv-VNINDEX-5y.json";
import { analogFan } from "./analogFan";
import { simulate, heatmap, type EventStudy } from "./timingSim";
import type { DailyBar } from "./timingSpace";
import { COST_REALISTIC, nowVsWait, withCost } from "./nowVsWait";

const es = div as unknown as EventStudy;
const w3 = es.windows.find((w) => w.id === "w3")!; // vào −15, thoát +3
const tl = { status: "UPCOMING" as const, windowId: "w3", entryTo: -15, exitOffset: 3 };
const fanAt = (e: EventStudy) => analogFan(e, fptBars as DailyBar[], vniBars as DailyBar[], -16, 3, { today: "2026-10-29" });

describe("MP-b withCost", () => {
  it("phí bằng phí engine -> cùng đối tượng, bản đồ nhiệt giống hệt", () => {
    expect(withCost(es, es.costPerRoundTrip)).toBe(es);
    expect(JSON.stringify(heatmap(withCost(es, 0.0045000000000000005)))).toBe(JSON.stringify(heatmap(es)));
  });
  it("phí 0,8% -> mỗi đợt ròng thấp hơn đúng 0,35 điểm %; 0% -> cao hơn 0,45 điểm %; đối tượng gốc không đổi", () => {
    const a = simulate(es, -15, 3), b = simulate(withCost(es, COST_REALISTIC), -15, 3), c = simulate(withCost(es, 0), -15, 3);
    a.outcomes.forEach((o, i) => { expect(b.outcomes[i].net).toBeCloseTo(o.net - (0.008 - 0.0045), 12); expect(c.outcomes[i].net).toBeCloseTo(o.net + 0.0045, 12); });
    expect(b.wins).toBeLessThanOrEqual(a.wins); expect(c.wins).toBeGreaterThanOrEqual(a.wins);
    expect(es.costPerRoundTrip).toBeCloseTo(0.0045, 12);
  });
  it("P(lãi) của quạt giảm (không tăng) khi phí tăng", () => {
    const p = (cost: number) => fanAt(withCost(es, cost))!.pWin!.mean;
    expect(p(0)).toBeGreaterThanOrEqual(p(es.costPerRoundTrip)); expect(p(es.costPerRoundTrip)).toBeGreaterThanOrEqual(p(COST_REALISTIC));
  });
});

describe("MP-c nowVsWait", () => {
  it("đủ điều kiện -> hai phía với n; phía chờ = mô phỏng cửa sổ Timeline; không có trường kết luận", () => {
    const r = nowVsWait(es, tl, fanAt(es), w3);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = simulate(es, -15, 3);
    expect(r.wait).toMatchObject({ entry: -15, exit: 3, n: s.n, wins: s.wins, median: s.medianNet });
    expect(r.now.exitOffset).toBe(3); expect(r.now.fromOffset).toBe(-16); expect(r.now.pWin.mean).toBeGreaterThan(0); expect(r.now.events).toBeGreaterThan(0);
    expect(r.now.lo!).toBeLessThanOrEqual(r.now.median!); expect(r.now.median!).toBeLessThanOrEqual(r.now.hi!);
    expect(Object.keys(r)).toEqual(["ok", "cost", "now", "wait"]);
    expect(r.cost).toBe(es.costPerRoundTrip);
  });
  it("thiếu điều kiện -> lý do cụ thể", () => {
    expect(nowVsWait(null, tl, null, null)).toMatchObject({ ok: false, reason: expect.stringMatching(/nghiên cứu sự kiện/) });
    expect(nowVsWait(es, null, null, w3)).toMatchObject({ ok: false, reason: expect.stringMatching(/chưa có vùng Timeline/) });
    expect(nowVsWait(es, { ...tl, status: "IN_WINDOW" }, fanAt(es), w3)).toMatchObject({ ok: false, reason: expect.stringMatching(/đang mở/) });
    expect(nowVsWait(es, tl, fanAt(es), es.windows[0])).toMatchObject({ ok: false, reason: expect.stringMatching(/cửa sổ khác/) });
    expect(nowVsWait(es, tl, null, w3)).toMatchObject({ ok: false, reason: expect.stringMatching(/quạt kịch bản/) });
    expect(nowVsWait(es, tl, null, w3, -90)).toMatchObject({ ok: false, reason: "hôm nay ở phiên -90, quạt kịch bản chỉ dựng từ phiên -75 — khối sẽ hiện sau khoảng 15 phiên nữa" });
    expect(nowVsWait(es, { ...tl, entryTo: -7 }, fanAt(es), w3)).toMatchObject({ ok: false, reason: expect.stringMatching(/không có trong nghiên cứu/) });
  });
});
