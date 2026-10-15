import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "../../../test/rtl-lite";
import { parseSseChunk, type ChatStreamEvent } from "../../../services/catalystChat";

const script: ChatStreamEvent[] = [
  { type: "meta", remaining: 39, macroMode: "synthetic" },
  { type: "tool_call", id: "t1", name: "macro_overview", input: { target: "VNINDEX" } },
  { type: "notice", notice: "DỮ LIỆU MÔ PHỎNG — không phải số liệu thực của GSO/NHNN/HOSE." },
  { type: "tool_result", id: "t1", name: "macro_overview", result: { ok: true, data: { target: "VNINDEX", targetName: "VN-Index", thermometer: { value: -0.31, band: "Bất lợi nhẹ", period: "2026-06" }, regime: { label: "Chế độ trung tính", probability: 0.99 } } } },
  { type: "text", delta: "Dữ liệu mô phỏng. **Bất lợi nhẹ**:\n- nhiệt kế -0,31" },
  { type: "audit", untraceable: ["12,8"] },
  { type: "done", stopReason: "end_turn", model: "claude-opus-5-5", rounds: 1, fallback: false },
];
const calls: unknown[] = [];
vi.mock("../../../services/catalystChat", async (orig) => {
  const real = await orig<typeof import("../../../services/catalystChat")>();
  return {
    ...real,
    streamCatalystChat: async (messages: unknown, onEvent: (e: ChatStreamEvent) => void) => {
      calls.push(messages);
      for (const e of script) onEvent(e);
    },
  };
});

import CatalystChatPanel from "./CatalystChatPanel";

afterEach(cleanup);

describe("X4 — SSE", () => {
  it("tách sự kiện, giữ phần dư", () => {
    const { events, rest } = parseSseChunk('data: {"type":"text","delta":"a"}\n\ndata: {"type":"te');
    expect(events).toEqual([{ type: "text", delta: "a" }]);
    expect(rest).toBe('data: {"type":"te');
  });
});

describe("X4 — khung chat", () => {
  it("câu hỏi gợi ý -> biểu ngữ mô phỏng ĐẦU câu trả lời, thẻ nhiệt kế, cảnh báo số không truy được, hạn mức", async () => {
    render(<CatalystChatPanel />);
    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.startsWith("Vĩ mô đang thuận lợi"))!;
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(calls[0]).toEqual([{ role: "user", content: "Vĩ mô đang thuận lợi hay bất lợi cho VN-Index?" }]);
    const html = document.body.innerHTML;
    expect(html.indexOf("DỮ LIỆU MÔ PHỎNG")).toBeLessThan(html.indexOf("nhiệt kế -0,31"));
    expect(screen.getByText(/Tổng quan vĩ mô · VN-Index/)).toBeTruthy();
    expect(screen.getByText(/không truy được tới dữ liệu công cụ/)).toBeTruthy();
    expect(screen.getByText("Còn 39 câu hôm nay")).toBeTruthy();
    expect(document.querySelector("strong")?.textContent).toBe("Bất lợi nhẹ");
    expect(document.querySelector("li")?.textContent).toBe("nhiệt kế -0,31");
  });
});
