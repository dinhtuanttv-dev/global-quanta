import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, fireEvent, render, screen } from "../../test/rtl-lite";

const { stub, mutateSpy } = vi.hoisted(() => ({ stub: (id: string) => ({ default: () => <div data-testid={id} /> }), mutateSpy: vi.fn(async () => undefined) }));
vi.mock("swr", () => ({ mutate: mutateSpy, default: () => ({ data: undefined }) }));
vi.mock("./SieuQuetAI/SieuQuetAiTab", () => stub("p-tongquan"));
vi.mock("./TaVnIndex/TaVnIndexTab", () => stub("p-kythuat"));
vi.mock("./CoTuc/CotucTab", () => stub("p-coban"));
vi.mock("./KetNoiTheGioi/KetNoiTheGioiTab", () => stub("p-world"));
vi.mock("./LocNganh/LocNganhTab", () => stub("p-nganh"));
vi.mock("./ChatXucTac/ChatXucTacTab", () => stub("p-vimo"));
vi.mock("../elite10/Elite10Hub", () => stub("p-quyetdinh"));
vi.mock("../../store/useAppStore", () => ({ useAppStore: (sel: (s: { scannerFocus: null }) => unknown) => sel({ scannerFocus: null }) }));

import MainTabs from "./MainTabs";

const tab = (id: string) => document.querySelector(`[data-tab="${id}"]`) as HTMLButtonElement;
const btn = (id: string) => screen.getByTestId(id) as HTMLButtonElement;
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });
/** jsdom xử lý history.back bất đồng bộ; đợi popstate rồi mới kiểm tra. */
const backOrForward = async (id: string) => { fireEvent.click(btn(id)); await flush(); };

beforeEach(() => { window.sessionStorage.clear(); window.history.replaceState(null, "", "/"); mutateSpy.mockClear(); });
afterEach(cleanup);

describe("Thanh điều hướng chính", () => {
  it("hiện đúng 7 tên mới, mở trang đầu tiên", () => {
    render(<MainTabs />);
    expect(Array.from(document.querySelectorAll('[role="tab"]')).map((t) => t.textContent)).toEqual(["TỔNG QUAN", "KẾT NỐI THẾ GIỚI", "PHÂN TÍCH NGÀNH", "PHÂN TÍCH KỸ THUẬT", "PHÂN TÍCH VĨ MÔ", "PHÂN TÍCH CƠ BẢN", "QUYẾT ĐỊNH"]);
    expect(screen.queryByTestId("p-tongquan")).not.toBeNull();
    expect(btn("nav-back").disabled).toBe(true);
    expect(btn("nav-forward").disabled).toBe(true);
  });

  it("đổi tab ghi vào đường dẫn; back rồi forward quay đúng trang", async () => {
    render(<MainTabs />);
    fireEvent.click(tab("Loc nganh"));
    expect(screen.queryByTestId("p-nganh")).not.toBeNull();
    expect(window.location.search).toBe("?tab=phan-tich-nganh");
    expect(btn("nav-back").disabled).toBe(false);
    await backOrForward("nav-back");
    expect(screen.queryByTestId("p-tongquan")).not.toBeNull();
    expect(btn("nav-forward").disabled).toBe(false);
    await backOrForward("nav-forward");
    expect(screen.queryByTestId("p-nganh")).not.toBeNull();
  });

  it("back vẫn đúng khi bộ lọc Cổ tức đã xoá state và đường dẫn", async () => {
    render(<MainTabs />);
    fireEvent.click(tab("Co tuc"));
    window.history.replaceState(null, "", "/?min=1");
    fireEvent.click(tab("Elite 10"));
    await backOrForward("nav-back");
    expect(screen.queryByTestId("p-coban")).not.toBeNull();
    expect(window.location.search).toContain("min=1");
    await backOrForward("nav-back");
    expect(screen.queryByTestId("p-tongquan")).not.toBeNull();
  });

  it("mở bằng đường dẫn đúng trang; đặt tiêu đề trang", () => {
    window.history.replaceState(null, "", "/?tab=quyet-dinh");
    render(<MainTabs />);
    expect(screen.queryByTestId("p-quyetdinh")).not.toBeNull();
    expect(document.title).toContain("QUYẾT ĐỊNH");
  });

  it("làm mới nạp lại dữ liệu và báo giờ", async () => {
    render(<MainTabs />);
    fireEvent.click(btn("nav-reload"));
    expect(mutateSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("nav-status").textContent).toContain("Đang làm mới");
    await act(async () => { await new Promise((r) => setTimeout(r, 750)); });
    expect(screen.getByTestId("nav-status").textContent).toMatch(/Làm mới \d/);
  });

  it("phím mũi tên chuyển tab", () => {
    render(<MainTabs />);
    act(() => { tab("Sieu quet AI").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })); });
    expect(screen.queryByTestId("p-world")).not.toBeNull();
  });
});
