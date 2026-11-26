// GPT-1 (26/11/2026) — Vòng tool-use "Hỏi đáp xúc tác" / Phòng họp AI chạy bằng OpenAI (Chat Completions), CÙNG hợp đồng sự kiện với
// runChat (Claude) và runChatGemini: text · tool_call · tool_result · notice · audit · done. Chủ dự án chọn GPT làm mô hình chính của làn
// "claude" (tên làn giữ nguyên trong API để giao diện / test không vỡ), Claude là dự phòng (xem chatService.runPrimary).
// Gọi REST bằng fetch có sẵn của Node (không thêm thư viện). Không stream token: mỗi vòng phát trọn đoạn văn bản khi vòng đó xong.
import { auditNumbers } from "./numberAudit.js";

export const OPENAI_CHAT_MODEL = "gpt-5.5";
export const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MAX_ROUNDS = 4;

/** Lỗi HTTP của OpenAI -> Error có status / code / headers (để vòng nền nhận ra hết tín dụng, 429, Retry-After). */
export async function openaiError(res) {
  let body = null;
  try { body = await res.json(); } catch { /* không có JSON */ }
  const e = new Error(body?.error?.message ?? `OpenAI HTTP ${res.status}`);
  e.status = res.status; e.code = body?.error?.code ?? body?.error?.type ?? null;
  e.headers = { "retry-after": res.headers?.get?.("retry-after") ?? null };
  // Hết tín dụng / hạn mức tài khoản: OpenAI trả 429 code insufficient_quota hoặc credit_balance_exhausted -> coi như lỗi thanh toán.
  if (/insufficient_quota|credit_balance|billing/i.test(String(e.code) + " " + e.message)) e.billing = true;
  return e;
}

/** Công cụ dạng Anthropic {name, description, input_schema} -> dạng hàm của OpenAI. */
export const toOpenAiTools = (tools) => tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.input_schema ?? { type: "object", properties: {} } } }));

/**
 * @param {{ messages: {role:"user"|"assistant", content:string}[], system: string, tools: object[], execTool: (n:string,i:unknown)=>Promise<any>,
 *           emit: (e:object)=>void, apiKey: string, model?: string, maxRounds?: number, signal?: AbortSignal, snapshotOnly?: boolean,
 *           responseSchema?: object|null, fetchImpl?: typeof fetch, reasoningEffort?: string }} o
 */
export async function runChatOpenAI(o) {
  const model = o.model ?? OPENAI_CHAT_MODEL, f = o.fetchImpl ?? fetch, maxRounds = o.maxRounds ?? MAX_ROUNDS;
  const history = [{ role: "system", content: o.system }, ...o.messages.map((m) => ({ role: m.role, content: m.content }))];
  const tools = o.snapshotOnly ? [] : toOpenAiTools(o.tools ?? []);
  const results = [], notices = new Set();
  let finalText = "", rounds = 0, last = null;
  while (true) {
    if (o.signal?.aborted) throw new Error("aborted");
    const lastRound = rounds >= maxRounds;
    const body = {
      model, messages: lastRound ? [...history, { role: "system", content: "Đã hết lượt gọi công cụ: trả lời ngay bằng dữ liệu đã có, nói rõ phần nào chưa lấy được." }] : history,
      max_completion_tokens: 8000, reasoning_effort: o.reasoningEffort ?? "medium",
      ...(tools.length && !lastRound ? { tools, tool_choice: "auto" } : {}),
      ...(o.responseSchema ? { response_format: { type: "json_schema", json_schema: { name: "claims", schema: o.responseSchema, strict: false } } } : {}),
    };
    const res = await f(OPENAI_URL, { method: "POST", headers: { authorization: `Bearer ${o.apiKey}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: o.signal });
    if (!res.ok) throw await openaiError(res);
    const data = await res.json();
    last = data;
    const msg = data.choices?.[0]?.message ?? {};
    const finish = data.choices?.[0]?.finish_reason ?? null;
    if (msg.refusal) { o.emit({ type: "error", message: "Mô hình từ chối trả lời câu hỏi này." }); break; }
    if (typeof msg.content === "string" && msg.content) { finalText += msg.content; o.emit({ type: "text", delta: msg.content }); }
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls.filter((c) => c.type === "function") : [];
    if (o.snapshotOnly && calls.length) throw new Error("Snapshot mode returned an unexpected tool call.");
    if (!calls.length || lastRound) break;
    history.push({ role: "assistant", content: msg.content ?? null, tool_calls: calls });
    rounds++;
    const out = await Promise.all(calls.map(async (c) => {
      let input = {};
      try { input = c.function?.arguments ? JSON.parse(c.function.arguments) : {}; } catch { input = null; }
      o.emit({ type: "tool_call", id: c.id, name: c.function?.name, input });
      let r;
      try { r = input == null ? { ok: false, error: "Tham số công cụ không phải JSON hợp lệ." } : await o.execTool(c.function?.name, input); }
      catch (e) { r = { ok: false, error: e instanceof Error ? e.message : "Lỗi khi chạy công cụ." }; }
      results.push(r);
      if (r.ok && r.notice && !notices.has(r.notice)) { notices.add(r.notice); o.emit({ type: "notice", notice: r.notice }); }
      o.emit({ type: "tool_result", id: c.id, name: c.function?.name, result: r });
      return { role: "tool", tool_call_id: c.id, content: JSON.stringify(r) };
    }));
    history.push(...out);
    if (finish === "length") break;
  }
  const userText = o.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const untraceable = o.snapshotOnly ? [] : auditNumbers(finalText, results, userText);
  if (untraceable.length) o.emit({ type: "audit", untraceable });
  o.emit({ type: "done", stopReason: last?.choices?.[0]?.finish_reason ?? null, model: last?.model ?? model, rounds, fallback: false });
  return { text: finalText, toolResults: results, model: last?.model ?? model };
}
