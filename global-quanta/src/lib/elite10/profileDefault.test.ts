// HS360-v3 H1 (Q6): mã mặc định của Hồ sơ 360° — không còn mở VNINDEX ("không nằm trong vũ trụ").
import { describe, expect, it } from "vitest";
import { defaultProfileTicker } from "./profileDefault";

describe("defaultProfileTicker", () => {
  const universe = new Set(["NAF", "FPT", "HPG"]);
  it("ưu tiên mã đã chọn trong hồ sơ", () => expect(defaultProfileTicker({ local: "FPT", global: "HPG", universe, hlFirst: "NAF" })).toBe("FPT"));
  it("mã toàn trang nếu thuộc vũ trụ bảng E1", () => expect(defaultProfileTicker({ local: null, global: "HPG", universe, hlFirst: "NAF" })).toBe("HPG"));
  it("mã toàn trang ngoài vũ trụ (VD VNINDEX) -> mã hạng 1 Elite HL", () => expect(defaultProfileTicker({ local: null, global: "VNINDEX", universe, hlFirst: "NAF" })).toBe("NAF"));
  it("chưa chọn mã nào -> mã hạng 1 Elite HL", () => expect(defaultProfileTicker({ local: null, global: null, universe, hlFirst: "NAF" })).toBe("NAF"));
  it("bảng E1 chưa tải -> vẫn nhận mã toàn trang", () => expect(defaultProfileTicker({ local: null, global: "XYZ", universe: null, hlFirst: "NAF" })).toBe("XYZ"));
  it("không có gì -> VNINDEX", () => expect(defaultProfileTicker({ local: null, global: null, universe: null, hlFirst: null })).toBe("VNINDEX"));
});
