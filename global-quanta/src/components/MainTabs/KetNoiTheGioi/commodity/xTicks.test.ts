// G2/L7 (19/11/2026): mốc trục thời gian không lặp nhãn; khoảng ngắn ghi ngày/tháng, khoảng dài ghi tháng/năm.
import { describe, expect, it } from "vitest";
import { xTicks } from "./LineChart";

const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
describe("xTicks", () => {
  it("chuỗi 4 tuần (theo dõi tiến 23/10–19/11/2026): 5 mốc ngày, không trùng", () => {
    const t = xTicks(ms("2026-10-23"), ms("2026-11-19"));
    expect(t.map((x) => x.label)).toEqual(["23/10", "29/10", "05/11", "12/11", "19/11"]);
  });
  it("chuỗi 1 năm: tháng/năm; không mốc nào trùng nhãn", () => {
    const t = xTicks(ms("2025-11-19"), ms("2026-11-19"));
    expect(new Set(t.map((x) => x.label)).size).toBe(t.length);
    expect(t[0].label).toBe("11/2025");
  });
  it("chuỗi rất ngắn (2 ngày): bỏ mốc trùng thay vì in lặp", () => {
    const t = xTicks(ms("2026-11-18"), ms("2026-11-19"));
    expect(t.map((x) => x.label)).toEqual(["18/11", "19/11"]);
  });
});
