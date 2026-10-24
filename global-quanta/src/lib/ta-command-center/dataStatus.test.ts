// A3 — trạng thái dữ liệu (D-01/02/03) và nến đang hình thành (D-08).
import { describe, expect, it } from "vitest";
import { lastBarForming, seriesFreshness } from "./dataStatus";

const at = (vn: string) => Date.parse(`${vn}+07:00`); // giờ Việt Nam
const P = (o: Partial<Parameters<typeof seriesFreshness>[0] & object> = {}) => ({ source: "SSI_FC_V2", asOf: "2026-10-23", fetchedAt: "2026-10-23T08:00:00.000Z", isStale: false, fallbackReason: null, partialToday: false, ...o });

describe("A3 — trạng thái dữ liệu", () => {
  it("thiếu / sai thời điểm -> không rõ (không bao giờ 'đang giao dịch')", () => {
    expect(seriesFreshness(null, null).state).toBe("unknown");
    expect(seriesFreshness(P({ asOf: "rác" }), "2026-10-23").state).toBe("unknown");
    expect(seriesFreshness(P({ asOf: null }), "2026-10-23", at("2026-10-23T10:00")).state).toBe("unknown");
  });
  it("Gateway báo cũ -> cũ kèm số ngày; đã đóng phiên -> 'tới phiên …'", () => {
    const s = seriesFreshness(P({ isStale: true, asOf: "2026-10-20" }), "2026-10-20", at("2026-10-23T10:00"));
    expect(s.state).toBe("stale"); expect(s.detail).toContain("cách 3 ngày");
    expect(seriesFreshness(P(), "2026-10-23", at("2026-10-24T09:00")).label).toBe("Tới phiên 2026-10-23");
  });
  it("đang giao dịch CHỈ khi nến hôm nay đang hình thành và lần lấy ≤ 15 phút; lấy lâu hơn -> chưa cập nhật", () => {
    const live = P({ partialToday: true, asOf: "2026-10-23", fetchedAt: new Date(at("2026-10-23T10:00")).toISOString() });
    expect(seriesFreshness(live, "2026-10-23", at("2026-10-23T10:05")).state).toBe("live");
    expect(seriesFreshness(live, "2026-10-23", at("2026-10-23T10:40")).state).toBe("stale");
    // Giờ trình duyệt nhận (receivedAt) không làm dữ liệu trẻ hơn: không có fetchedAt -> không coi là đang giao dịch.
    expect(seriesFreshness({ ...live, fetchedAt: null }, "2026-10-23", at("2026-10-23T10:05")).state).toBe("stale");
  });
});

describe("A3 — nến đang hình thành", () => {
  it("D theo partialToday; intraday theo phiên đang chạy", () => {
    expect(lastBarForming("D", "2026-10-23", true, false)).toBe(true);
    expect(lastBarForming("D", "2026-10-23", false, false)).toBe(false);
    expect(lastBarForming("5m", null, false, true)).toBe(true);
  });
  it("W: cùng tuần và trước 15:00 thứ Sáu -> đang hình thành; cuối tuần / tuần trước -> đủ", () => {
    expect(lastBarForming("W", "2026-10-22", false, false, at("2026-10-23T10:00"))).toBe(true);  // thứ Sáu 10:00
    expect(lastBarForming("W", "2026-10-23", false, false, at("2026-10-23T15:30"))).toBe(false); // thứ Sáu sau đóng cửa
    expect(lastBarForming("W", "2026-10-23", false, false, at("2026-10-25T09:00"))).toBe(false); // Chủ nhật
    expect(lastBarForming("W", "2026-10-16", false, false, at("2026-10-20T09:00"))).toBe(false); // tuần trước
  });
  it("M: cùng tháng, trước 15:00 ngày làm việc cuối tháng -> đang hình thành", () => {
    expect(lastBarForming("M", "2026-10-23", false, false, at("2026-10-25T09:00"))).toBe(true);
    expect(lastBarForming("M", "2026-10-30", false, false, at("2026-10-30T15:30"))).toBe(false); // 30/10 là thứ Sáu cuối tháng
    expect(lastBarForming("M", "2026-09-30", false, false, at("2026-10-05T09:00"))).toBe(false);
  });
});
