// Bàn nghiên cứu Obsidian (O2) trong Phòng họp AI: menu Lưu, xem trước, cấu hình Vault, bản vết song song, 0 request, không gọi lại AI.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import type { ChatStreamEvent } from "../../../services/catalystChat";

const calls: { role: string | null }[] = [];
let hold: Promise<void> | null = null;
vi.mock("../../../services/catalystChat", async (orig) => {
  const real = await orig<typeof import("../../../services/catalystChat")>();
  return {
    ...real,
    streamCatalystChat: async (_m: unknown, onEvent: (e: ChatStreamEvent) => void, _s: unknown, provider: string, role: string | null) => {
      calls.push({ role });
      onEvent({ type: "meta", remaining: 30, macroMode: "real", provider: provider as never, model: provider === "gemini" ? "gemini-x" : "claude-y", host: "gateway" });
      onEvent({ type: "tool_call", id: `${role}-1`, name: "elite_ticker", input: { ticker: "HPG", token: "bí mật" } });
      onEvent({ type: "tool_result", id: `${role}-1`, name: "elite_ticker", result: { ok: true, data: { ticker: "HPG", date: "2026-11-20", icb: { l1: "1000", l2: "1700", l3: "1750" }, elite: { rank: 12, inPortfolio: true } } } });
      if (hold) await hold;
      onEvent({ type: "text", delta: role === "bull" ? "Lập luận MUA — nguyên văn." : role === "bear" ? "Lập luận BÁN — nguyên văn." : role === "judge" ? "Phán quyết nguyên văn." : "Bản tin nguyên văn." });
      onEvent({ type: "done", stopReason: "end_turn", model: "m", rounds: 2, fallback: false });
    },
  };
});
const downloads: { name: string; text: string; type?: string }[] = [];
vi.mock("../../../lib/kqkd/format", async (orig) => ({ ...(await orig<typeof import("../../../lib/kqkd/format")>()), downloadText: (name: string, text: string, type?: string) => { downloads.push({ name, text, type }); } }));

import EliteAiRoom from "./EliteAiRoom";

const key = (el: Element, k: string, init: KeyboardEventInit = {}) => act(() => { el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init })); });
const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
async function debateDone() {
  render(<EliteAiRoom defaultTicker="HPG" />);
  await act(async () => { fireEvent.click(screen.getByTestId("elite-debate-start")); });
  await flush();
}
const fetchSpy = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchSpy); try { localStorage.clear(); } catch { /* bỏ qua */ } });
afterEach(() => { cleanup(); calls.length = 0; downloads.length = 0; hold = null; vi.unstubAllGlobals(); fetchSpy.mockReset(); });

describe("Phòng họp AI × Obsidian (O2)", () => {
  it("thanh Obsidian luôn hiện; trước khi có kết quả không có menu Lưu", () => {
    render(<EliteAiRoom />);
    expect(screen.getByTestId("obsidian-bar").textContent).toContain("Global Quanta/Elite 10");
    expect(screen.queryByTestId("obsidian-debate")).toBeNull();
    expect(screen.queryByTestId("obsidian-brief")).toBeNull();
  });

  it("tranh luận xong: báo chưa lưu; Tải .md -> ghi chú đúng nguyên văn + bản vết; hết báo chưa lưu; KHÔNG gọi lại AI, 0 request", async () => {
    await debateDone();
    expect(screen.getByTestId("obsidian-unsaved").textContent).toContain("tranh luận");
    const before = calls.length;
    const beforeExport = fetchSpy.mock.calls.length;
    fireEvent.click(screen.getByTestId("obsidian-debate").querySelector("button")!);
    fireEvent.click(screen.getByTestId("obsidian-debate-download"));
    expect(downloads).toHaveLength(1);
    const { name, text, type } = downloads[0];
    expect(name).toMatch(/^\d{4}-\d{2}-\d{2} \d{6} - HPG - Tranh luận - [a-z2-9]{4}\.md$/);
    expect(type).toBe("text/markdown;charset=utf-8");
    for (const t of ["Lập luận MUA — nguyên văn.", "Lập luận BÁN — nguyên văn.", "Phán quyết nguyên văn."]) expect(text).toContain(t);
    expect(text).toContain('bull: "claude-y"'); expect(text).toContain('bear: "gemini-x"');
    expect(text).toContain('host: "gateway"'); expect(text).toContain('macro_mode: "real"');
    expect(text).toMatch(/started_at: "\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+07:00"/);
    expect(text).toContain("ticker=HPG"); expect(text).not.toContain("bí mật");
    expect(text).toContain('ticker: "HPG"'); expect(text).toContain("data_as_of: 2026-11-20");
    expect(screen.getByTestId("obsidian-status").textContent).toContain("Đang tải tệp");
    expect(screen.queryByTestId("obsidian-unsaved")).toBeNull();
    expect(screen.getByTestId("obsidian-debate-badge").textContent).toBe("Đã xuất");
    expect(calls.length).toBe(before);
    expect(fetchSpy).toHaveBeenCalledTimes(beforeExport);
  });

  it("đang chạy -> menu Lưu khoá (aria-disabled + lý do); xong -> mở", async () => {
    let release!: () => void; hold = new Promise((r) => { release = r; });
    render(<EliteAiRoom defaultTicker="HPG" />);
    await act(async () => { fireEvent.click(screen.getByTestId("elite-debate-start")); });
    await flush();
    const btn = screen.getByTestId("obsidian-debate").querySelector("button")!;
    expect(btn.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(btn);
    expect(screen.queryByTestId("obsidian-debate-download")).toBeNull();
    await act(async () => { release(); }); await flush(); await flush();
    expect(screen.getByTestId("obsidian-debate").querySelector("button")!.getAttribute("aria-disabled")).toBeNull();
  });

  it("bàn phím: mũi tên mở menu và focus mục đầu, End/Home, Escape đóng và trả focus về nút", async () => {
    await debateDone();
    const btn = screen.getByTestId("obsidian-debate").querySelector("button")!;
    btn.focus(); key(btn, "ArrowDown");
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(screen.getByTestId("obsidian-debate-preview"));
    const menu = document.querySelector('[role="menu"]')!;
    key(menu, "End"); expect(document.activeElement).toBe(screen.getByTestId("obsidian-debate-copy"));
    key(menu, "Home"); expect(document.activeElement).toBe(screen.getByTestId("obsidian-debate-preview"));
    key(menu, "Escape");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(btn);
  });

  it("xem trước: hiện tên tệp + Markdown; tắt bằng chứng thì ghi chú bỏ bảng công cụ (nhớ theo trình duyệt); Escape đóng", async () => {
    await debateDone();
    fireEvent.click(screen.getByTestId("obsidian-debate").querySelector("button")!);
    fireEvent.click(screen.getByTestId("obsidian-debate-preview"));
    const md = () => screen.getByTestId("obsidian-preview-md").textContent ?? "";
    expect(md()).toContain("## Bằng chứng công cụ");
    expect(screen.getByTestId("obsidian-preview-file").textContent).toMatch(/HPG - Tranh luận/);
    const ev = [...screen.getByTestId("obsidian-preview").querySelectorAll("label")].find((l) => /bằng chứng/.test(l.textContent ?? ""))!.querySelector("input")!;
    fireEvent.click(ev);
    expect(md()).not.toContain("## Bằng chứng công cụ");
    expect(JSON.parse(localStorage.getItem("gq.obsidian.v1")!).options.includeEvidence).toBe(false);
    key(screen.getByTestId("obsidian-preview"), "Escape");
    expect(screen.queryByTestId("obsidian-preview")).toBeNull();
  });

  it("cấu hình Vault: thư mục không hợp lệ bị chặn; hợp lệ -> lưu và hiện trên thanh", async () => {
    render(<EliteAiRoom />);
    fireEvent.click(screen.getByTestId("obsidian-settings-open"));
    fireEvent.change(screen.getByTestId("obsidian-folder"), { target: { value: "a/../b" } });
    expect((screen.getByTestId("obsidian-settings-save") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("obsidian-folder"), { target: { value: "Đầu tư/Elite" } });
    fireEvent.change(screen.getByTestId("obsidian-vault"), { target: { value: "Kho chính" } });
    fireEvent.click(screen.getByTestId("obsidian-settings-save"));
    expect(screen.queryByTestId("obsidian-settings")).toBeNull();
    expect(screen.getByTestId("obsidian-target").textContent).toContain("Kho chính");
    expect(screen.getByTestId("obsidian-target").textContent).toContain("Đầu tư/Elite");
    expect(JSON.parse(localStorage.getItem("gq.obsidian.v1")!)).toMatchObject({ vault: "Kho chính", folder: "Đầu tư/Elite" });
  });

  it("bản tin: Mở trong Obsidian -> gửi obsidian://new (không append/overwrite), câu chữ không nói 'đã lưu'", async () => {
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this.getAttribute("href") ?? ""); });
    render(<EliteAiRoom />);
    await act(async () => { fireEvent.click(screen.getByTestId("elite-brief-start")); });
    await flush();
    expect(screen.getByTestId("obsidian-unsaved").textContent).toContain("bản tin");
    const beforeExport = fetchSpy.mock.calls.length;
    fireEvent.click(screen.getByTestId("obsidian-brief").querySelector("button")!);
    await act(async () => { fireEvent.click(screen.getByTestId("obsidian-brief-obsidian")); });
    await flush();
    expect(clicks).toHaveLength(1);
    expect(clicks[0]).toMatch(/^obsidian:\/\/new\?file=Global%20Quanta%2FElite%2010%2F.+Elite%2010%20-%20B%E1%BA%A3n%20tin/);
    expect(clicks[0]).not.toMatch(/append|prepend|overwrite/);
    // Ghi chú thật dài hơn ngưỡng URI (2.000 ký tự sau encode) -> chép trước rồi mở với `clipboard` (đặc tả 03 §6).
    expect(screen.getByTestId("obsidian-status").textContent).toMatch(/gửi yêu cầu mở Obsidian/);
    if (/clipboard=true/.test(clicks[0])) expect(await navigator.clipboard.readText()).toContain("Bản tin nguyên văn.");
    expect(screen.getByTestId("obsidian-status").textContent).not.toMatch(/đã lưu vào obsidian/i);
    expect(fetchSpy).toHaveBeenCalledTimes(beforeExport);
    vi.restoreAllMocks();
  });
});
