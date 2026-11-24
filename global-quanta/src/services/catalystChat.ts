// X4 — Client "Hỏi đáp xúc tác", đọc luồng SSE.
// V4 (19/11/2026): gọi Market Gateway trước (POST {gateway}/api/catalysts/chat). Gateway trả 503 code "provider-not-configured" khi chưa
// có khoá cho mô hình được chọn -> gọi Project A ({VITE_API_BASE_URL}) như cũ trong giai đoạn chuyển tiếp. Cùng hợp đồng SSE ở cả hai nơi.
import { getAccessToken } from "./api";
import { getMarketGateway } from "../config/marketGateway";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

/** Mô hình trả lời (Z2): Claude (mặc định) hoặc Gemini — cùng bộ công cụ & kiểm tra con số. */
export type ChatProvider = "claude" | "gemini";
/** E5: vai trò tranh luận (Phòng họp AI Elite 10). */
export type ChatRole = "bull" | "bear" | "judge";

export interface ChatToolResult {
  ok: boolean;
  notice?: string | null;
  data?: unknown;
  guidance?: string[];
  error?: string;
}

export type ChatStreamEvent =
  | { type: "meta"; remaining: number; macroMode: "real" | "insufficient" | "synthetic" | null; worldMode?: "real" | "insufficient" | "synthetic" | null; provider?: ChatProvider; model?: string; host?: "gateway" | "project-a"; evidenceMode?: "snapshot_only"; snapshotId?: string }
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
  role: ChatRole | null = null,
  evidenceMode?: "snapshot_only",
  snapshotId?: string,
): Promise<void> {
  const token = await getAccessToken();
  if (!token) throw new ChatHttpError(401, "Cần đăng nhập để dùng Hỏi đáp xúc tác.");
  const init: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages, provider, ...(role ? { role } : {}), ...(evidenceMode ? { evidenceMode, snapshotId } : {}) }),
    signal,
  };
  const urls = chatUrls();
  let res = await fetch(urls.gateway, init);
  let host: "gateway" | "project-a" = "gateway";
  if (res.status === 503 && urls.projectA && !evidenceMode) {
    const b = await res.clone().json().catch(() => ({}));
    if ((b as { code?: string }).code === "provider-not-configured") {
      res = await fetch(urls.projectA, init);
      host = "project-a";
    }
  }
  const tag = (e: ChatStreamEvent) => onEvent(e.type === "meta" ? { ...e, host: e.host ?? host } : e);
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
    events.forEach(tag);
  }
  const { events } = parseSseChunk(`${buf}\n\n`);
  events.forEach(tag);
}

/** Gateway là nơi chính; Project A chỉ còn làm đường lùi khi Gateway chưa có khoá cho mô hình được chọn. */
export function chatUrls(): { gateway: string; projectA: string | null } {
  return { gateway: `${getMarketGateway().baseUrl}/api/catalysts/chat`, projectA: API_BASE ? `${API_BASE}/api/catalysts/chat` : null };
}
