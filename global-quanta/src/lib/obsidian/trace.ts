// Bản vết song song (đặc tả 01 §3): ghi những gì laneReducer KHÔNG giữ — thời gian thật, máy chủ, chế độ dữ liệu vĩ mô / thế giới,
// lý do dừng, số vòng, đầu vào công cụ (rút gọn). Bọc hàm stream: mọi sự kiện vẫn được chuyển NGUYÊN cho callback gốc.
import { TOOL_INPUT_MAX, type LaneTrace } from "./types";

export type TraceKey = "bull" | "bear" | "judge" | "brief";
export type LaneTraceMap = Partial<Record<TraceKey, LaneTrace>>;
export interface StreamEventLike { type: string; [k: string]: unknown }

/** Đầu vào công cụ -> chuỗi ngắn: chỉ khoá có giá trị văn bản / số / logic, tối đa TOOL_INPUT_MAX ký tự. */
export function summarizeInput(input: unknown): string {
  if (input == null || typeof input !== "object" || Array.isArray(input)) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (/token|secret|key|auth|password/i.test(k)) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") parts.push(`${k}=${String(v).replace(/\s+/g, " ").slice(0, 60)}`);
  }
  const s = parts.join(", ");
  return s.length > TOOL_INPUT_MAX ? `${s.slice(0, TOOL_INPUT_MAX - 1)}…` : s;
}

/** Áp một sự kiện stream vào bản vết (hàm thuần). Sự kiện "text" không đổi bản vết. */
export function traceEvent(t: LaneTrace | undefined, e: StreamEventLike): LaneTrace {
  const cur: LaneTrace = t ?? {};
  switch (e.type) {
    case "meta": return { ...cur, host: typeof e.host === "string" ? e.host : cur.host ?? null, macroMode: (e.macroMode as string | null | undefined) ?? cur.macroMode ?? null, worldMode: (e.worldMode as string | null | undefined) ?? cur.worldMode ?? null };
    case "tool_call": {
      const id = typeof e.id === "string" ? e.id : null;
      if (!id) return cur;
      return { ...cur, toolInputs: { ...(cur.toolInputs ?? {}), [id]: summarizeInput(e.input) } };
    }
    case "done": return { ...cur, stopReason: typeof e.stopReason === "string" ? e.stopReason : null, rounds: typeof e.rounds === "number" ? e.rounds : null };
    default: return cur;
  }
}

type Update = (key: TraceKey, fn: (t: LaneTrace | undefined) => LaneTrace) => void;
/**
 * Bọc một hàm stream (cùng chữ ký với streamCatalystChat): ghi startedAt, các sự kiện không phải "text", finishedAt (kể cả khi lỗi / dừng).
 * Callback gốc nhận MỌI sự kiện, đúng thứ tự, không đổi.
 */
export function tracedStream<M, E extends StreamEventLike, R extends unknown[]>(
  base: (messages: M, onEvent: (e: E) => void, ...rest: R) => Promise<void>, update: Update, now: () => number = Date.now,
) {
  return (key: TraceKey) => async (messages: M, onEvent: (e: E) => void, ...rest: R): Promise<void> => {
    update(key, () => ({ startedAt: now(), toolInputs: {} }));
    try {
      await base(messages, (e) => { if (e.type !== "text") update(key, (t) => traceEvent(t, e)); onEvent(e); }, ...rest);
    } finally {
      update(key, (t) => ({ ...(t ?? {}), finishedAt: now() }));
    }
  };
}
