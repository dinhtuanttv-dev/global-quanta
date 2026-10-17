// X4 — Client "Hỏi đáp xúc tác": POST {VITE_API_BASE_URL}/api/catalysts/chat (Project A), đọc luồng SSE.
import { getAccessToken } from "./api";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

/** Mô hình trả lời (Z2): Claude (mặc định) hoặc Gemini — cùng bộ công cụ & kiểm tra con số. */
export type ChatProvider = "claude" | "gemini";

export interface ChatToolResult {
  ok: boolean;
  notice?: string | null;
  data?: unknown;
  guidance?: string[];
  error?: string;
}

export type ChatStreamEvent =
  | { type: "meta"; remaining: number; macroMode: "real" | "synthetic" | null; worldMode?: "real" | "synthetic" | null; provider?: ChatProvider; model?: string }
  | { type: "text"; delta: string }
  | { type: "tool_call"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; result: ChatToolResult }
  | { type: "notice"; notice: string }
  | { type: "audit"; untraceable: string[] }
  | { type: "done"; stopReason: string | null; model: string; rounds: number; fallback: boolean }
  | { type: "error"; message: string };

/** Tách các sự kiện SSE `data: {...}\n\n` từ bộ đệm; trả phần dư chưa đủ một sự kiện. */
export function parseSseChunk(buffer: string): { events: ChatStreamEvent[]; rest: string } {
  const events: ChatStreamEvent[] = [];
  const parts = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = parts.pop() ?? "";
  for (const part of parts) {
    const data = part.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trimStart()).join("\n");
    if (!data) continue;
    try {
      events.push(JSON.parse(data) as ChatStreamEvent);
    } catch {
      // bỏ qua sự kiện hỏng
    }
  }
  return { events, rest };
}

export class ChatHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function streamCatalystChat(
  messages: { role: "user" | "assistant"; content: string }[],
  onEvent: (e: ChatStreamEvent) => void,
  signal?: AbortSignal,
  provider: ChatProvider = "claude",
): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new ChatHttpError(401, "Cần đăng nhập để dùng Hỏi đáp xúc tác.");
  const res = await fetch(`${API_BASE}/api/catalysts/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages, provider }),
    signal,
  });
  if (!res.ok || !res.body) {
    const b = await res.json().catch(() => ({}));
    throw new ChatHttpError(res.status, (b as { error?: string }).error ?? `Lỗi ${res.status}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const { events, rest } = parseSseChunk(buf);
    buf = rest;
    events.forEach(onEvent);
  }
  const { events } = parseSseChunk(`${buf}\n\n`);
  events.forEach(onEvent);
}
