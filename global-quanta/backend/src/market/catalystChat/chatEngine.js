// V4 (19/11/2026) — Vòng lặp tool-use của "Hỏi đáp xúc tác" (Claude, streaming), chuyển từ Project A (lib/catalyst/chat/chatEngine.ts)
// và giữ nguyên tham số đã chạy ổn trên production: claude-opus-5-5, thinking adaptive, effort medium, cache_control tự động,
// fallbacks "default" (beta server-side-fallback-2026-07-01) khi mô hình từ chối. Thuần: client, công cụ, nơi phát sự kiện đều được
// truyền vào -> test bằng model giả có kịch bản mà không gọi API thật.
import { auditNumbers } from "./numberAudit.js";

export const CHAT_MODEL = "claude-opus-5-5";
export const MAX_TOOL_ROUNDS = 4;

const toolErr = (message) => ({ ok: false, error: message });

/**
 * @param {{ messages: {role:"user"|"assistant", content:string}[], system: string, tools: object[], execTool: (n:string, i:unknown)=>Promise<any>,
 *           emit: (e:object)=>void, api: { stream(params:object): { on(ev:"text", cb:(d:string)=>void): unknown, finalMessage(): Promise<any> } },
 *           model?: string, maxRounds?: number, signal?: AbortSignal }} o
 */
export async function runChat(o) {
  const model = o.model ?? CHAT_MODEL;
  const maxRounds = o.maxRounds ?? MAX_TOOL_ROUNDS;
  const history = o.messages.map((m) => ({ role: m.role, content: m.content }));
  const results = [];
  const notices = new Set();
  let finalText = "";
  let rounds = 0;
  let fallback = false;
  let last = null;

  while (true) {
    if (o.signal?.aborted) throw new Error("aborted");
    const lastRound = rounds >= maxRounds;
    const stream = o.api.stream({
      model,
      max_tokens: 16000,
      system: lastRound ? `${o.system}\n\nĐã hết lượt gọi công cụ cho câu hỏi này: trả lời ngay bằng dữ liệu đã có, nói rõ phần nào chưa lấy được.` : o.system,
      ...(o.snapshotOnly ? {} : { tools: o.tools, tool_choice: lastRound ? { type: "none" } : { type: "auto" } }),
      messages: history,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    }, o.signal ? { signal: o.signal } : undefined);
    let roundText = "";
    stream.on("text", (delta) => {
      roundText += delta;
      o.emit({ type: "text", delta });
    });
    const msg = await stream.finalMessage();
    last = msg;
    finalText += roundText;
    if (msg.usage?.iterations?.some((x) => x.type === "fallback_message")) fallback = true;

    if (msg.stop_reason === "refusal") {
      o.emit({ type: "error", message: "Mô hình từ chối trả lời câu hỏi này." });
      break;
    }
    if (msg.stop_reason === "pause_turn") {
      history.push({ role: "assistant", content: msg.content });
      continue;
    }
    const uses = msg.content.filter((b) => b.type === "tool_use");
    if (o.snapshotOnly && uses.length) throw new Error("Snapshot mode returned an unexpected tool call.");
    if (msg.stop_reason !== "tool_use" || uses.length === 0) break;

    history.push({ role: "assistant", content: msg.content });
    rounds++;
    const out = await Promise.all(uses.map(async (u) => {
      o.emit({ type: "tool_call", id: u.id, name: u.name, input: u.input });
      let r;
      try {
        r = await o.execTool(u.name, u.input);
      } catch (e) {
        r = toolErr(e instanceof Error ? e.message : "Lỗi khi chạy công cụ.");
      }
      results.push(r);
      if (r.ok && r.notice && !notices.has(r.notice)) {
        notices.add(r.notice);
        o.emit({ type: "notice", notice: r.notice });
      }
      o.emit({ type: "tool_result", id: u.id, name: u.name, result: r });
      return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(r), is_error: !r.ok };
    }));
    // mọi tool_result của một lượt trong MỘT tin nhắn user
    history.push({ role: "user", content: out });
  }

  const userText = o.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const untraceable = o.snapshotOnly ? [] : auditNumbers(finalText, results, userText);
  if (untraceable.length) o.emit({ type: "audit", untraceable });
  o.emit({ type: "done", stopReason: last?.stop_reason ?? null, model: last?.model ?? model, rounds, fallback });
  return { text: finalText, toolResults: results };
}
