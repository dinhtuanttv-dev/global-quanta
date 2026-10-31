import { describe, expect, it } from "vitest";
import { clampZ, fmtAgo, fmtChange, fmtSigned, fmtVnTime, sourceHealth, type NewsSource } from "./monitor";

describe("Định dạng giám sát và tin", () => {
  it("giờ hiển thị theo múi giờ Việt Nam; dữ liệu sai thì không đoán", () => {
    expect(fmtVnTime("2026-10-30T21:44:00Z")).toBe("31/10 04:44");
    expect(fmtVnTime("không phải ngày")).toBe("—");
    expect(fmtVnTime(null)).toBe("—");
  });
  it("thời gian tương đối đúng từng ngưỡng", () => {
    const now = Date.parse("2026-10-31T03:00:00Z");
    expect(fmtAgo("2026-10-31T02:59:30Z", now)).toBe("vừa xong");
    expect(fmtAgo("2026-10-31T02:30:00Z", now)).toBe("30 phút trước");
    expect(fmtAgo("2026-10-31T00:00:00Z", now)).toBe("3 giờ trước");
    expect(fmtAgo("2026-10-28T03:00:00Z", now)).toBe("3 ngày trước");
    expect(fmtAgo("2026-10-31T04:00:00Z", now)).toBe("vừa xong");
  });
  it("lợi suất ghi điểm cơ bản, còn lại ghi phần trăm; dấu trừ chuẩn", () => {
    expect(fmtChange({ change: -6, changeIn: "bps" })).toBe("−6,0 điểm cơ bản");
    expect(fmtChange({ change: 1.234, changeIn: "pct" })).toBe("+1,23%");
    expect(fmtChange({ change: null, changeIn: "pct" })).toBe("—");
    expect(fmtSigned(null)).toBe("—");
  });
  it("cắt z chỉ để vẽ", () => {
    expect(clampZ(6.28)).toBe(4);
    expect(clampZ(-9)).toBe(-4);
    expect(clampZ(1.5)).toBe(1.5);
  });
  it("đếm nguồn hoạt động và liệt kê nguồn lỗi", () => {
    const s = (ok: boolean, label: string) => ({ id: label, label, authority: "press", ok, items: 0, newestAt: null, checkedAt: "" }) as NewsSource;
    const h = sourceHealth([s(true, "A"), s(false, "B"), s(true, "C")]);
    expect([h.ok, h.total, h.failed[0].label]).toEqual([2, 3, "B"]);
  });
});
