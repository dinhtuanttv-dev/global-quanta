// 30/10/2026 — màn kiểm tra phiên KHÔNG BAO GIỜ là khung đen trống: có chữ, quá chậm thì hiện nút, quá hạn cứng thì vẫn vào ứng dụng.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, fireEvent, render, screen } from "../../test/rtl-lite";

let restore: () => Promise<boolean> = () => new Promise(() => {}); // treo mãi
vi.mock("../../services/api", async (orig) => ({ ...(await orig<typeof import("../../services/api")>()), currentUser: () => ({ id: "u1", email: "a@b.c", admin: false, mustChangePassword: false }), consumeLegacySession: () => false, signOut: async () => {} }));
import { useAppStore } from "../../store/useAppStore";
import AuthGate, { HARD_CAP_MS, SLOW_MS } from "./AuthGate";

beforeEach(() => { vi.useFakeTimers(); useAppStore.setState({ isAuthenticated: false, restoreAuthSession: () => restore() }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("AuthGate", () => {
  it("Gateway treo khi kiểm tra phiên: có chữ ngay, sau 4 giây hiện 'máy chủ chậm' + nút, sau 12 giây vẫn vào ứng dụng (còn phiên)", async () => {
    restore = () => new Promise(() => {});
    render(<AuthGate><div data-testid="app">APP</div></AuthGate>);
    expect(screen.getByTestId("auth-checking").textContent).toContain("Đang kiểm tra phiên đăng nhập");
    expect(screen.queryByTestId("auth-slow")).toBeNull();
    await act(async () => { vi.advanceTimersByTime(SLOW_MS + 10); });
    expect(screen.getByTestId("auth-slow").textContent).toContain("Máy chủ đang phản hồi chậm");
    await act(async () => { vi.advanceTimersByTime(HARD_CAP_MS); await Promise.resolve(); });
    expect(screen.getByTestId("app").textContent).toBe("APP");
  });
  it("'Đăng nhập lại' khi chờ lâu -> form đăng nhập", async () => {
    restore = () => new Promise(() => {});
    render(<AuthGate><div data-testid="app">APP</div></AuthGate>);
    await act(async () => { vi.advanceTimersByTime(SLOW_MS + 10); });
    const btn = [...document.querySelectorAll("button")].find((b) => b.textContent === "Đăng nhập lại")!;
    fireEvent.click(btn);
    expect(document.querySelector("#login-email")).toBeTruthy();
    expect(screen.queryByTestId("app")).toBeNull();
  });
  it("phiên hợp lệ -> vào ứng dụng ngay", async () => {
    restore = async () => { useAppStore.setState({ isAuthenticated: true }); return true; };
    render(<AuthGate><div data-testid="app">APP</div></AuthGate>);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByTestId("app").textContent).toBe("APP");
  });
});
