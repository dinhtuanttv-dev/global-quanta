// Bàn nghiên cứu Obsidian (O3): Hỏi đáp qua context, Nhật ký quyết định, Canvas, Gói khởi tạo Vault — 0 request, không gọi lại AI.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import type { ChatStreamEvent } from "../../../services/catalystChat";

const calls: { role: string | null | undefined }[] = [];
vi.mock("../../../services/catalystChat", async (orig) => {
  const real = await orig<typeof import("../../../services/catalystChat")>();
  return {
    ...real,
    streamCatalystChat: async (_m: unknown, onEvent: (e: ChatStreamEvent) => void, _s: unknown, provider: string, role?: string | null) => {
      calls.push({ role });
      onEvent({ type: "meta", remaining: 29, macroMode: "synthetic", provider: provider as never, model: provider === "gemini" ? "gemini-x" : "claude-y" });
      onEvent({ type: "tool_call", id: `t-${role}`, name: "elite_ticker", input: { ticker: "HPG" } });
      onEvent({ type: "tool_result", id: `t-${role}`, name: "elite_ticker", result: { ok: true, data: { ticker: "HPG", date: "2026-11-20", icb: { l1: "1000", l2: "1700", l3: "1750" }, elite: { rank: 12, inPortfolio: true } } } });
      onEvent({ type: "text", delta: role === "bull" ? "MUA nguyên văn." : role === "bear" ? "BÁN nguyên văn." : role === "judge" ? "TRỌNG TÀI nguyên văn." : "TRẢ LỜI hỏi đáp nguyên văn." });
      onEvent({ type: "done", stopReason: "end_turn", model: "m", rounds: 1, fallback: false });
    },
  };
});
const downloads: { name: string; text: string; type?: string }[] = [];
vi.mock("../../../lib/kqkd/format", async (orig) => ({ ...(await orig<typeof import("../../../lib/kqkd/format")>()), downloadText: (name: string, text: string, type?: string) => { downloads.push({ name, text, type }); } }));

import EliteAiRoom from "./EliteAiRoom";
import CatalystChatPanel from "../../MainTabs/ChatXucTac/CatalystChatPanel";

const flush = () => act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
const openMenu = (id: string) => fireEvent.click(screen.getByTestId(id).querySelector("button")!);
const fetchSpy = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchSpy); try { localStorage.clear(); } catch { /* bỏ qua */ } });
afterEach(() => { cleanup(); calls.length = 0; downloads.length = 0; vi.unstubAllGlobals(); fetchSpy.mockReset(); });

async function ask(q: string) {
  const ta = document.querySelector<HTMLTextAreaElement>('[data-testid="elite-ai-room"] textarea')!;
  fireEvent.change(ta, { target: { value: q } });
  await act(async () => { fireEvent.click(document.querySelector('[data-testid="elite-ai-room"] button[aria-label="Gửi"]')!); });
  await flush();
}
async function debate() {
  await act(async () => { fireEvent.click(screen.getByTestId("elite-debate-start")); });
  await flush();
}

describe("Phòng họp AI × Obsidian (O3)", () => {
  it("Hỏi đáp: có nút Lưu cuộc trao đổi sau lượt đầu; toàn bộ / lượt cuối; câu hỏi + nguyên văn; báo chưa lưu rồi hết", async () => {
    render(<EliteAiRoom />);
    expect(screen.queryByTestId("obsidian-qa")).toBeNull();
    await ask("Câu hỏi thứ nhất?");
    await ask("Câu hỏi thứ hai?");
    expect(screen.getByTestId("obsidian-qa").querySelector("button")!.getAttribute("aria-label")).toBe("Lưu cuộc trao đổi (2 lượt)");
    expect(screen.getByTestId("obsidian-unsaved").textContent).toContain("hỏi đáp");
    const before = calls.length;
    openMenu("obsidian-qa"); fireEvent.click(screen.getByTestId("obsidian-qa-download"));
    const all = downloads.pop()!;
    expect(all.name).toMatch(/Elite 10 - Hỏi đáp/);
    expect(all.text).toContain("Câu hỏi thứ nhất?"); expect(all.text).toContain("Câu hỏi thứ hai?");
    expect(all.text).toContain("TRẢ LỜI hỏi đáp nguyên văn."); expect(all.text).toContain('qa_scope: "all"'); expect(all.text).toContain("turns: 2");
    expect(all.text).toContain('macro_mode: "synthetic"');
    openMenu("obsidian-qa"); fireEvent.click(screen.getByTestId("obsidian-qa-last-download"));
    const last = downloads.pop()!;
    expect(last.text).not.toContain("Câu hỏi thứ nhất?"); expect(last.text).toContain("Câu hỏi thứ hai?"); expect(last.text).toContain('qa_scope: "last"');
    expect(screen.queryByTestId("obsidian-unsaved")).toBeNull();
    expect(calls.length).toBe(before);
    await ask("Câu hỏi thứ ba?");
    expect(screen.getByTestId("obsidian-unsaved").textContent).toContain("hỏi đáp"); // lượt mới -> lại chưa lưu
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("khung Hỏi đáp dùng chung không có Provider (tab Chat xúc tác): chạy như cũ, không có giao diện Obsidian", async () => {
    render(<CatalystChatPanel />);
    const ta = document.querySelector<HTMLTextAreaElement>('[data-testid="catalyst-chat"] textarea')!;
    fireEvent.change(ta, { target: { value: "Xúc tác ngành thép?" } });
    await act(async () => { fireEvent.click(document.querySelector('[data-testid="catalyst-chat"] button[aria-label="Gửi"]')!); });
    await flush();
    expect(screen.getByTestId("catalyst-chat").textContent).toContain("TRẢ LỜI hỏi đáp nguyên văn.");
    expect(screen.queryByTestId("obsidian-qa")).toBeNull();
    expect(screen.queryByTestId("obsidian-bar")).toBeNull();
  });

  it("Nhật ký quyết định: mốc +5/+10/+20 phiên theo lịch VN; liên kết ghi chú tranh luận đã lưu", async () => {
    render(<EliteAiRoom defaultTicker="HPG" />);
    await debate();
    openMenu("obsidian-debate"); fireEvent.click(screen.getByTestId("obsidian-debate-download"));
    const note = downloads.pop()!;
    openMenu("obsidian-debate"); fireEvent.click(screen.getByTestId("obsidian-debate-journal-download"));
    const j = downloads.pop()!;
    expect(j.name).toMatch(/HPG - Nhật ký/);
    expect(j.text).toContain('type: "elite10-decision-journal"');
    expect(j.text).toContain("review_5: 2026-11-27"); expect(j.text).toContain("review_10: 2026-12-04"); expect(j.text).toContain("review_20: 2026-12-18");
    expect(j.text).toContain("judge_was_right: null");
    expect(j.text).toContain("TRỌNG TÀI nguyên văn.");
    expect(j.text).toContain(`[[${note.name.replace(/\.md$/, "")}]]`);
  });

  it("Canvas: cần lưu ghi chú trước (báo rõ, không tải); sau khi lưu -> .canvas JSON hợp lệ trỏ đúng ghi chú", async () => {
    render(<EliteAiRoom defaultTicker="HPG" />);
    await debate();
    openMenu("obsidian-debate"); fireEvent.click(screen.getByTestId("obsidian-debate-canvas"));
    expect(downloads).toHaveLength(0);
    expect(screen.getByTestId("obsidian-status").textContent).toContain("lưu ghi chú tranh luận trước");
    openMenu("obsidian-debate"); fireEvent.click(screen.getByTestId("obsidian-debate-download"));
    const note = downloads.pop()!;
    openMenu("obsidian-debate"); fireEvent.click(screen.getByTestId("obsidian-debate-canvas"));
    const c = downloads.pop()!;
    expect(c.name).toMatch(/HPG - Tranh luận - .+\.canvas$/);
    expect(c.type).toBe("application/json;charset=utf-8");
    const doc = JSON.parse(c.text);
    expect(doc.nodes.find((n: { type: string }) => n.type === "file").file).toBe(`Global Quanta/Elite 10/${note.name}`);
    expect(doc.edges.every((e: { fromNode: string; toNode: string }) => doc.nodes.some((n: { id: string }) => n.id === e.fromNode) && doc.nodes.some((n: { id: string }) => n.id === e.toNode))).toBe(true);
  });

  it("Gói khởi tạo Vault: tải ghi chú Bàn điều khiển theo thư mục đang cấu hình; menu: Sao chép vẫn là mục cuối", async () => {
    render(<EliteAiRoom />);
    openMenu("obsidian-kit"); fireEvent.click(screen.getByTestId("obsidian-kit-download"));
    const k = downloads.pop()!;
    expect(k.name).toBe("Elite 10 · Bàn điều khiển.md");
    expect(k.text).toContain('FROM "Global Quanta/Elite 10"');
    expect(k.text).toContain("```dataview");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
