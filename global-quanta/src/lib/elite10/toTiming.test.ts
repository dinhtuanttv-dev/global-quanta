import { describe, expect, it } from "vitest";
import type { ToRadarRow } from "../cotuc/to";
import { exGuards, toLaneRows, withToRows } from "./toTiming";
import { buyTimingCells } from "./buyTimingCell";

const S = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-23", "2026-11-24", "2026-11-25"];
const row = (o: Partial<ToRadarRow>): ToRadarRow => ({
  t: "HPA", name: null, sector: "Nguyên vật liệu", ex: "2026-11-20", disclosed: "2026-11-06", check: null, cash: 1800, yieldPre: 0.066, bucket: "≥5%", yieldNow: 0.065, lastPrice: 27.7, lastPriceDate: "2026-11-06",
  adv: 1.7e9, liquidityOk: true, entryDate: null, limitUpEntry: null, qualifies: true, sessionsSinceAnn: 0, runUp: null, runUpPct: null, runUpShareOfTypical: null,
  buyDate: "2026-11-09", lastCumDate: "2026-11-19", sessionsLeft: 8, t2Ok: true, expected: { n: 119, mean: 0.0176, ci95: [0.0081, 0.028], hit: 0.647 }, weakSector: false, label: "THĂM DÒ", ...o,
});
const today = new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);

describe("Elite × TO — vùng Săn cổ tức thay cửa sổ cổ tức W1–W5", () => {
  it("toLaneRows: chỉ đợt đủ điều kiện TO-r1, bậc THĂM DÒ, vùng vào 2 phiên đầu, bán phiên cuối còn quyền, ghi T+2", () => {
    const r = toLaneRows([row({}), row({ t: "VNM", qualifies: false }), row({ t: "PVB", t2Ok: false })], "2026-11-07", S);
    expect(r.map((x) => x.ticker)).toEqual(["HPA", "PVB"]);
    expect(r[0]).toMatchObject({ tier: "EXPLORATORY", kind: "DIVIDEND", windowId: "to", status: "UPCOMING", entryFromDate: "2026-11-09", entryToDate: "2026-11-10", exitDate: "2026-11-19", sessionsToEntry: 1, nEvents: 119 });
    expect(r[1].missing.join(" ")).toContain("không kịp T+2");
    expect(toLaneRows([row({ entryDate: "2026-11-09" })], "2026-11-10", S)[0].status).toBe("IN_WINDOW");
    expect(toLaneRows([row({ entryDate: "2026-11-09" })], "2026-11-11", S)[0].status).toBe("PASSED");
  });
  it("withToRows: bỏ vùng cổ tức W cũ, giữ KQKD, thêm vùng TO", () => {
    const out = withToRows([{ kind: "DIVIDEND", id: "w1" }, { kind: "EARNINGS", id: "e1" }], toLaneRows([row({})], "2026-11-07", S));
    expect(out.map((x) => (x as { id: string }).id)).toEqual(["e1", "HPA:DIV:to:2026-11-20"]);
  });
  it("ô ⏱ Điểm mua: vùng TO ghi THĂM DÒ + phiên bán, không dùng chữ 'mua'", () => {
    const from = S.find((d) => d >= today) ?? S[0];
    const lane = toLaneRows([row({ entryDate: today, ex: "2099-01-05", lastCumDate: "2099-01-02" })], today, S);
    const cell = buyTimingCells(["HPA"], lane as never, "2026-11-06", S).get("HPA")!;
    expect(cell.kind).toBe("to"); expect(cell.text).toMatch(/^Vùng TO → /); expect(cell.sub).toContain("THĂM DÒ · bán 02/01");
    expect(`${cell.text} ${cell.sub}`).not.toMatch(/mua/i); expect(cell.tooltip).toContain("TO-r1"); void from;
    // Đã qua vùng vào nhưng chưa tới phiên bán -> quy tắc Elite + nhắc phiên bán TO
    const held = toLaneRows([row({ entryDate: "2000-01-03", ex: "2099-01-05", lastCumDate: "2099-01-02" })], today, S);
    const c2 = buyTimingCells(["HPA"], held as never, "2026-11-06", S).get("HPA")!;
    expect(c2.kind).toBe("rule"); expect(c2.sub).toContain("TO: đã qua vùng vào · bán 02/01");
  });
  it("exGuards: GDKHQ trong kỳ nắm giữ 10 phiên -> cảnh báo (mạnh nếu nhóm ≥ 5%); ngoài kỳ thì không", () => {
    const post = { "≥5%": { n: 129, mean: -0.0287, ci95: [-0.0371, -0.0209] as [number, number], hit: 0.2 } };
    const g = exGuards(["HPA", "VNM", "FPT"], [row({}), row({ t: "VNM", bucket: "3–5%", ex: "2026-11-12", lastCumDate: "2026-11-11" }), row({ t: "FPT", ex: "2026-12-30" })], "2026-11-06", S, post);
    expect([...g.keys()].sort()).toEqual(["HPA", "VNM"]);
    expect(g.get("HPA")).toMatchObject({ strong: true, lastCum: "2026-11-19", post: post["≥5%"] });
    expect(g.get("VNM")!.strong).toBe(false);
  });
});
