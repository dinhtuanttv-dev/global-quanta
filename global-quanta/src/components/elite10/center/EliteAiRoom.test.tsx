import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import type { ChatStreamEvent } from "../../../services/catalystChat";

const calls: { provider: string; role: string | null; content: string }[] = [];
vi.mock("../../../services/catalystChat", async (orig) => {
  const real = await orig<typeof import("../../../services/catalystChat")>();
  return {
    ...real,
    streamCatalystChat: async (messages: { content: string }[], onEvent: (e: ChatStreamEvent) => void, _s: unknown, provider: string, role: string | null) => {
      calls.push({ provider, role, content: messages[messages.length - 1].content });
      const text = role === "bull" ? "Lập luận MUA: Stealth 20 bậc A." : role === "bear" ? "Lập luận BÁN: IC nhỏ." : role === "judge" ? "Phán quyết: bằng chứng hai bên ngang nhau." : "Bản tin phiên.";
      onEvent({ type: "meta", remaining: 30, macroMode: "real", provider: provider as never, model: provider === "gemini" ? "gemini-x" : "claude-y" });
      onEvent({ type: "text", delta: text });
      onEvent({ type: "done", stopReason: "end_turn", model: "m", rounds: 1, fallback: false });
    },
  };
});

import EliteAiRoom, { debateQuestions } from "./EliteAiRoom";

afterEach(() => { cleanup(); calls.length = 0; });

describe("Elite 10 E5 — Phòng họp AI", () => {
  it("tranh luận: Claude phe mua và Gemini phe bán song song, rồi Claude trọng tài nhận cả hai lập luận", async () => {
    render(<EliteAiRoom defaultTicker="HPG" />);
    await act(async () => { fireEvent.click(screen.getByTestId("elite-debate-start")); });
    await act(async () => { await Promise.resolve(); });
    expect(calls.map((c) => [c.provider, c.role])).toEqual([["claude", "bull"], ["gemini", "bear"], ["claude", "judge"]]);
    expect(calls[0].content).toContain("mã HPG");
    expect(calls[0].content).toContain("elite_ticker");
    expect(calls[2].content).toContain("Lập luận MUA: Stealth 20 bậc A.");
    expect(calls[2].content).toContain("Lập luận BÁN: IC nhỏ.");
    expect(screen.getByTestId("elite-judge").textContent).toContain("Phán quyết");
  });

  it("bản tin phiên chỉ chạy khi bấm, không có vai trò; chủ đề trống = cả danh mục", async () => {
    render(<EliteAiRoom defaultTicker="VNINDEX" />);
    expect(calls).toHaveLength(0);
    await act(async () => { fireEvent.click(screen.getByTestId("elite-brief-start")); });
    expect(calls).toEqual([{ provider: "claude", role: null, content: debateQuestions(null).brief }]);
    expect(debateQuestions(null).bull).toContain("danh mục Elite 10");
    expect(debateQuestions(null).judge("a".repeat(7000), "b").length).toBeLessThan(6500 + 400);
  });
});
