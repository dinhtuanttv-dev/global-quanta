import { describe, expect, it } from "vitest";
import { canGoBack, canGoForward, DEFAULT_TAB, initialNav, labelOf, MAIN_TABS, parseNav, pushTab, resolvePop, tabOfSlug, type NavState } from "./mainNav";

const A = "Sieu quet AI", B = "Loc nganh", C = "Co tuc", D = "Elite 10";

describe("Tên tab", () => {
  it("đúng 7 tên mới theo thứ tự", () => {
    expect(MAIN_TABS.map((t) => t.label)).toEqual(["TỔNG QUAN", "KẾT NỐI THẾ GIỚI", "PHÂN TÍCH NGÀNH", "PHÂN TÍCH KỸ THUẬT", "PHÂN TÍCH VĨ MÔ", "PHÂN TÍCH CƠ BẢN", "QUYẾT ĐỊNH"]);
    expect(labelOf("TA VN-Index")).toBe("PHÂN TÍCH KỸ THUẬT");
    expect(tabOfSlug("quyet-dinh")).toBe("Elite 10");
    expect(tabOfSlug("khong-co")).toBeNull();
  });
});

describe("Lịch sử tab", () => {
  it("mở tab mới thêm một mục; mở lại tab đang xem thì không", () => {
    const n = pushTab({ stack: [A], idx: 0 }, B);
    expect(n).toEqual({ stack: [A, B], idx: 1 });
    expect(pushTab(n, B)).toBe(n);
  });
  it("mở tab mới sau khi back thì bỏ nhánh forward, như trình duyệt", () => {
    expect(pushTab({ stack: [A, B, C], idx: 0 }, D)).toEqual({ stack: [A, D], idx: 1 });
  });
  it("nút chỉ bật khi còn đường đi", () => {
    expect([canGoBack({ stack: [A], idx: 0 }), canGoForward({ stack: [A], idx: 0 })]).toEqual([false, false]);
    expect([canGoBack({ stack: [A, B], idx: 1 }), canGoForward({ stack: [A, B], idx: 1 })]).toEqual([true, false]);
    expect([canGoBack({ stack: [A, B], idx: 0 }), canGoForward({ stack: [A, B], idx: 0 })]).toEqual([false, true]);
  });
  it("back/forward tin gqIdx hợp lệ", () => {
    expect(resolvePop({ stack: [A, B, C], idx: 2 }, 0, null)).toBe(0);
  });
  it("mục bị xoá state: suy từ URL, rồi tới mục liền kề; gqIdx sai thì bỏ qua", () => {
    const nav: NavState = { stack: [A, C, B], idx: 2 };
    expect(resolvePop(nav, null, C)).toBe(1);
    expect(resolvePop({ stack: [A, B, C], idx: 1 }, null, C)).toBe(2);
    expect(resolvePop(nav, null, null)).toBe(1);
    expect(resolvePop(nav, 99, null)).toBe(1);
    expect(resolvePop({ stack: [A], idx: 0 }, null, null)).toBe(0);
  });
});

describe("Tải lại trang", () => {
  it("giữ vị trí khi đúng mục lịch sử; đường dẫn khác thì mở theo đường dẫn", () => {
    const saved: NavState = { stack: [A, B, C], idx: 2 };
    expect(initialNav(saved, 1, B)).toEqual({ stack: [A, B, C], idx: 1 });
    expect(initialNav(saved, 1, null)).toEqual({ stack: [A, B, C], idx: 1 });
    expect(initialNav(saved, 1, D)).toEqual({ stack: [D], idx: 0 });
    expect(initialNav(null, null, D)).toEqual({ stack: [D], idx: 0 });
    expect(initialNav(null, null, null)).toEqual({ stack: [DEFAULT_TAB], idx: 0 });
  });
  it("dữ liệu lưu hỏng thì bỏ", () => {
    expect(parseNav("{hỏng")).toBeNull();
    expect(parseNav(null)).toBeNull();
    expect(parseNav(JSON.stringify({ stack: ["Tab lạ"], idx: 0 }))).toBeNull();
    expect(parseNav(JSON.stringify({ stack: [A], idx: 3 }))).toBeNull();
    expect(parseNav(JSON.stringify({ stack: [A, B], idx: 1 }))).toEqual({ stack: [A, B], idx: 1 });
  });
});
