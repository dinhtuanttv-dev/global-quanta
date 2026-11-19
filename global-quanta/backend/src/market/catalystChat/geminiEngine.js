// V4 (19/11/2026) — Vòng lặp gọi công cụ với Gemini (function calling, streaming), chuyển từ Project A
// (lib/catalyst/chat/geminiEngine.ts). Cùng sự kiện, cùng bộ công cụ, cùng giới hạn vòng và cùng kiểm tra con số như engine Claude.
// Thuần: model được truyền vào (test bằng model giả có kịch bản).
import { auditNumbers } from "./numberAudit.js";

export const GEMINI_CHAT_MODEL = process.env.GEMINI_CHAT_MODEL || "gemini-3.6-flash";
export const GEMINI_MAX_TOOL_ROUNDS = 4;

/** JSON Schema của công cụ -> tập con OpenAPI mà Gemini chấp nhận (bỏ additionalProperties, minimum/maximum…; kiểm tra lại phía server). */
export function toGeminiSchema(s) {
  if (!s || typeof s !== "object") return undefined;
  const out = {};
  if (typeof s.type === "string") out.type = s.type;
  if (typeof s.description === "string") out.description = s.description;
  if (Array.isArray(s.enum)) out.enum = s.enum.map(String);
  if (s.items) out.items = toGeminiSchema(s.items);
  if (s.properties && typeof s.properties === "object") {
    out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v) ?? { type: "string" }]));
    if (Array.isArray(s.required) && s.required.length) out.required = s.required;
  }
  return out;
}

export function toGeminiTools(tools) {
  return [{
    functionDeclarations: tools.map((t) => {
      const params = toGeminiSchema(t.input_schema);
      const hasProps = params?.properties && Object.keys(params.properties).length > 0;
      return { name: t.name, description: t.description, ...(hasProps ? { parameters: params } : {}) };
    }),
  }];
}

/**
 * @param {{ messages: {role:"user"|"assistant", content:string}[], system: string, tools: object[], execTool: Function, emit: Function,
 *           model: { startChat(o: { history: object[], systemInstruction: string, tools: object[], lastRound: boolean }): { sendMessageStream(p: string|object[]): Promise<any> } },
 *           modelName?: string, maxRounds?: number, signal?: AbortSignal }} o
 */
export async function runChatGemini(o) {
  const maxRounds = o.maxRounds ?? GEMINI_MAX_TOOL_ROUNDS;
  const prior = o.messages.slice(0, -1).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const question = o.messages[o.messages.length - 1].content;
  const gTools = toGeminiTools(o.tools);
  const results = [];
  const notices = new Set();
  let finalText = "", rounds = 0, callId = 0;
  const announced = new Set();
  let chat = o.model.startChat({ history: prior, systemInstruction: o.system, tools: gTools, lastRound: false });
  let next = question;
  while (true) {
    if (o.signal?.aborted) throw new Error("aborted");
    const res = await chat.sendMessageStream(next);
    // mô hình chính quá tải (vừa lỗi hoặc đang nghỉ) -> câu trả lời do mô hình dự phòng: nói rõ với người dùng, mỗi mô hình một lần
    const cur = o.model.currentModel?.();
    const primary = o.model.primary ?? o.model.models?.[0];
    if (cur && primary && cur !== primary && !announced.has(cur)) {
      announced.add(cur);
      o.emit({ type: "notice", notice: `Mô hình Gemini ${primary} đang quá tải — câu trả lời do ${cur} thực hiện.` });
    }
    for await (const chunk of res.stream) {
      let t = "";
      try { t = chunk.text(); } catch { t = ""; }
      if (t) { finalText += t; o.emit({ type: "text", delta: t }); }
    }
    const response = await res.response;
    const calls = response.functionCalls() ?? [];
    if (!calls.length) break;
    if (rounds >= maxRounds) {
      // hết lượt: yêu cầu trả lời bằng dữ liệu đã có (phiên mới, không công cụ)
      chat = o.model.startChat({ history: [...prior, { role: "user", parts: [{ text: question }] }], systemInstruction: `${o.system}\n\nĐã hết lượt gọi công cụ: trả lời ngay bằng dữ liệu đã có ở dưới, nói rõ phần nào chưa lấy được.`, tools: [], lastRound: true });
      next = `Kết quả công cụ đã có:\n${JSON.stringify(results).slice(0, 60_000)}`;
      rounds++;
      if (rounds > maxRounds + 1) break;
      continue;
    }
    rounds++;
    next = await Promise.all(calls.map(async (c) => {
      const id = `g${++callId}`;
      o.emit({ type: "tool_call", id, name: c.name, input: c.args ?? {} });
      let r;
      try { r = await o.execTool(c.name, c.args ?? {}); } catch (e) { r = { ok: false, error: e instanceof Error ? e.message : "Lỗi khi chạy công cụ." }; }
      results.push(r);
      if (r.ok && r.notice && !notices.has(r.notice)) { notices.add(r.notice); o.emit({ type: "notice", notice: r.notice }); }
      o.emit({ type: "tool_result", id, name: c.name, result: r });
      // mô hình Gemini hiện hành gắn id cho từng lượt gọi công cụ -> trả kết quả kèm đúng id
      return { functionResponse: { ...(c.id ? { id: c.id } : {}), name: c.name, response: { result: r } } };
    }));
  }
  const userText = o.messages.filter((m) => m.role === "user").map((m) => m.content).join("\n");
  const untraceable = auditNumbers(finalText, results, userText);
  if (untraceable.length) o.emit({ type: "audit", untraceable });
  const used = o.model.currentModel?.();
  const primary = o.model.primary ?? o.model.models?.[0];
  o.emit({ type: "done", stopReason: "end_turn", model: used ?? o.modelName ?? GEMINI_CHAT_MODEL, rounds, fallback: !!(used && primary && used !== primary) });
  return { text: finalText, toolResults: results };
}
