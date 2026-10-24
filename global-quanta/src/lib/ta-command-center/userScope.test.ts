// A2 (C-06) — dữ liệu trên máy gắn theo tài khoản; dữ liệu cũ chuyển MỘT lần cho tài khoản đầu tiên đăng nhập.
import { beforeEach, describe, expect, it, vi } from "vitest";

const user = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("../../services/api", () => ({ currentUser: () => (user.id ? { id: user.id, email: `${user.id}@x` } : null), getAccessToken: async () => null }));
const { readScoped, scopedKey, userScope, writeScoped } = await import("./userScope");
const { loadLocal, saveLocal } = await import("./chartDrawingsStore");

const t = (id: string) => ({ id, toolType: "trendline" as const, p1: { date: "2026-01-05", price: 1 }, p2: { date: "2026-01-06", price: 2 }, createdAt: 1 });

describe("A2 — dữ liệu người dùng theo tài khoản", () => {
  beforeEach(() => { localStorage.clear(); user.id = null; });

  it("khoá theo tài khoản; khách = guest", () => {
    expect(userScope()).toBe("guest");
    user.id = "u1";
    expect(scopedKey("k")).toBe("k@u1");
  });

  it("hai tài khoản trên cùng trình duyệt không thấy hình vẽ của nhau", () => {
    user.id = "A"; saveLocal("FPT", { primitives: [t("a")], updatedAt: null, dirty: true });
    user.id = "B"; expect(loadLocal("FPT").primitives).toEqual([]);
    saveLocal("FPT", { primitives: [t("b")], updatedAt: null, dirty: true });
    user.id = "A"; expect(loadLocal("FPT").primitives.map((p) => p.id)).toEqual(["a"]);
  });

  it("dữ liệu cũ (trước A2) chuyển một lần cho tài khoản đầu tiên đăng nhập, không cho khách, không nhân bản", () => {
    localStorage.setItem("gq.ta.drawings.v1:FPT", JSON.stringify({ primitives: [t("old")], updatedAt: "2026-10-01T00:00:00Z" }));
    expect(loadLocal("FPT").primitives).toEqual([]); // khách: không nhận
    user.id = "A";
    const a = loadLocal("FPT");
    expect(a.primitives.map((p) => p.id)).toEqual(["old"]);
    expect(a.dirty).toBe(true); // giờ máy khách cũ không dùng làm phiên bản -> gộp an toàn với đám mây
    expect(localStorage.getItem("gq.ta.drawings.v1:FPT")).toBeNull();
    user.id = "B"; expect(loadLocal("FPT").primitives).toEqual([]);
    expect(readScoped("không-có")).toBeNull();
    writeScoped("x", "1"); expect(localStorage.getItem("x@B")).toBe("1");
  });
});
