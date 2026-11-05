import { describe, expect, it } from "vitest";
import { DEFAULT_LAST, GROUP_OF, GROUPS, readView, VIEW_KEY, VIEWS } from "./cotucNav";

describe("F1 — điều hướng PHÂN TÍCH CƠ BẢN", () => {
  it("3 tab con theo thứ tự Kết quả kinh doanh · Cổ tức · Timeline điểm mua", () => {
    expect(GROUPS.map((g) => g.id)).toEqual(["kqkd", "cotuc", "timeline"]);
    expect(GROUPS.map((g) => g.label)).toEqual(["📈 Kết quả kinh doanh", "💰 Cổ tức", "⏱ Timeline điểm mua"]);
  });

  it("giữ đủ 7 mục cũ (không mất tính năng) và đặt đúng chỗ đã duyệt", () => {
    for (const old of ["timeline", "screener", "calendar-v3", "timing-v3", "earnings", "ranking", "legacy"] as const) expect(old in GROUP_OF).toBe(true);
    expect(GROUP_OF.ranking).toBe("cotuc"); // Xếp hạng xác suất -> Cổ tức (đã duyệt)
    expect(GROUP_OF.seasonality).toBe("kqkd"); // Mùa vụ KQKD -> Kết quả kinh doanh (đã duyệt)
    expect(GROUP_OF.earnings).toBe("kqkd");
    expect(GROUP_OF.timeline).toBe("timeline");
    expect(VIEWS.filter((v) => GROUP_OF[v.id] === "timeline")).toHaveLength(0); // Timeline không có mục con mới
    expect(VIEWS.filter((v) => GROUP_OF[v.id] === "kqkd").map((v) => v.id)).toEqual(["earnings", "seasonality", "kqkd-calendar"]);
    expect(VIEWS.filter((v) => GROUP_OF[v.id] === "cotuc").map((v) => v.id)).toEqual(["screener", "calendar-v3", "timing-v3", "ranking", "legacy"]);
  });

  it("mặc định mở Timeline điểm mua; nhớ mục cuối; dữ liệu lưu hỏng hoặc sai nhóm thì bỏ qua", () => {
    expect(readView(null)).toEqual({ view: "timeline", last: DEFAULT_LAST });
    const store = (v: unknown) => ({ getItem: (k: string) => (k === VIEW_KEY ? (typeof v === "string" ? v : JSON.stringify(v)) : null) });
    expect(readView(store({ view: "seasonality", last: { kqkd: "seasonality" } })).view).toBe("seasonality");
    expect(readView(store({ view: "seasonality", last: { kqkd: "seasonality" } })).last.kqkd).toBe("seasonality");
    expect(readView(store({ view: "xyz" })).view).toBe("timeline");
    expect(readView(store("{hỏng")).view).toBe("timeline");
    expect(readView(store({ view: "ranking", last: { kqkd: "ranking" } })).last.kqkd).toBe("earnings"); // mục sai nhóm bị bỏ
    expect(readView({ getItem: () => { throw new Error("chặn storage"); } }).view).toBe("timeline");
  });
});
