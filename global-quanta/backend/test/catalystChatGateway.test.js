// V4 (19/11/2026) — "Hỏi đáp xúc tác" + "Sự kiện trong nước" trên Gateway: cùng hợp đồng với Project A, mô hình giả có kịch bản
// (không gọi API thật), kiểm đăng nhập, hạn mức, khoá chưa cấu hình, vòng công cụ, kiểm tra con số, luồng SSE.
process.env.MARKET_ALERTS_ENABLED = "false";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { createCatalystRouter } from "../src/routes/catalysts.js";
import { createCatalystChat, parseMessages } from "../src/market/catalystChat/chatService.js";
import { buildToolList, buildSystemPrompt, createToolExecutor } from "../src/market/catalystChat/chatTools.js";
import { runChatGemini, toGeminiTools } from "../src/market/catalystChat/geminiEngine.js";
import { auditNumbers } from "../src/market/catalystChat/numberAudit.js";
import { domesticEventsWithCountdown, DOMESTIC_EVENTS } from "../src/market/catalystChat/domesticEvents.js";

const T = Date.parse("2026-11-19T03:00:00Z");
const SNAP = { scannedAt: "2026-11-19T02:35:00Z", ageMinutes: 25, isStale: false, sectors: [{ sector: "Thép", netScore: 2.4, tickerCount: 3, primaryCards: [{ ticker: "HPG", sourceTitle: "Thuế chống bán phá giá", direction: "benefit", netSignedImpact: 1.234, propagationDistance: "direct", horizon: "short", daysRemaining: 5, corroborationCount: 2, historicalWinRate: 46, priceInStatus: "fresh", volumeFlag: "normal", foreignFlowDirection: "in", compositeScore: 3.21, trustScore: 0.7, isConflicted: false }], cascadeCards: [] }], upMovers: [{ rank: 1, ticker: "HPG", label: "x", compositeScore: 3.21 }] };
const MACRO_SPECS = { anthropic: [{ name: "macro_score", description: "điểm vĩ mô", input_schema: { type: "object", properties: { target: { type: "string" } }, required: [] } }], systemPrompt: "Hướng dẫn vĩ mô.", mode: "real", notice: null };

/** Mô hình Claude giả: lượt 1 gọi catalyst_ticker + macro_score, lượt 2 trả lời có một con số bịa (99,9). */
function fakeClaude(calls) {
  let n = 0;
  return {
    stream(params) {
      calls.push(params);
      n++;
      const textByRound = n === 1 ? "Để em xem. " : "HPG có điểm 3,21; tỷ lệ thắng 46% (dưới 50%). Con số bịa 99,9.";
      const msg = n === 1
        ? { stop_reason: "tool_use", model: "claude-opus-5-5", content: [{ type: "text", text: textByRound }, { type: "tool_use", id: "t1", name: "catalyst_ticker", input: { ticker: "hpg" } }, { type: "tool_use", id: "t2", name: "macro_score", input: {} }] }
        : { stop_reason: "end_turn", model: "claude-opus-5-5", content: [{ type: "text", text: textByRound }] };
      return { on: (ev, cb) => { if (ev === "text") cb(textByRound); }, finalMessage: async () => msg };
    },
  };
}

function makeApp({ env, verify = async (a) => (a === "Bearer good" ? "user-1" : null), api, gemini, store = createMemoryStore() }) {
  const chat = createCatalystChat({
    env, now: () => T, store, verifyUser: verify, log: { log() {}, error() {} },
    sources: { macro: async () => MACRO_SPECS, world: async () => { throw new Error("world hỏng"); } },
    run: { macro: async (name) => ({ ok: true, data: { name, score: 0.03 } }) },
    getSnapshot: async () => SNAP,
    calendar: async () => ({ asOf: "2026-11-19", mode: "real", events: [], caveat: "ước tính" }),
    anthropicApi: async () => api, geminiModel: async () => gemini,
  });
  const app = express();
  app.use(express.json());
  app.use("/api/catalysts", createCatalystRouter({ getStore: () => null, getChat: () => chat, getDomesticEvents: domesticEventsWithCountdown, now: () => T }));
  const srv = app.listen(0);
  return { base: `http://127.0.0.1:${srv.address().port}/api/catalysts`, close: () => srv.close() };
}
const post = (base, body, auth = "Bearer good") => fetch(`${base}/chat`, { method: "POST", headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: JSON.stringify(body) });
const events = (text) => text.split("\n\n").filter((p) => p.startsWith("data:")).map((p) => JSON.parse(p.slice(5)));
const Q = { messages: [{ role: "user", content: "HPG có xúc tác gì?" }] };

test("parseMessages: giữ quy tắc của Project A", () => {
  assert.equal(parseMessages({}), "Thiếu messages.");
  assert.equal(parseMessages({ messages: [{ role: "assistant", content: "x" }] }), "Tin nhắn cuối phải là câu hỏi của người dùng.");
  assert.equal(parseMessages({ messages: [{ role: "user", content: "a" }, { role: "user", content: "b" }] }), "messages phải xen kẽ user/assistant.");
  assert.match(parseMessages({ messages: [{ role: "user", content: "x".repeat(2001) }] }), /tối đa 2000/);
  assert.deepEqual(parseMessages({ messages: [{ role: "assistant", content: "chào" }, { role: "user", content: "hỏi" }] }), [{ role: "user", content: "hỏi" }]);
});

test("chat Claude trên Gateway: SSE đúng hợp đồng, vòng công cụ gọi thẳng dịch vụ, kiểm tra con số bắt số bịa", async () => {
  const calls = [];
  const app = makeApp({ env: { ANTHROPIC_API_KEY: "x", GEMINI_API_KEY: "y" }, api: fakeClaude(calls) });
  try {
    const r = await post(app.base, Q);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/event-stream/);
    const ev = events(await r.text());
    assert.deepEqual(ev.map((e) => e.type), ["meta", "text", "tool_call", "tool_call", "tool_result", "tool_result", "text", "audit", "done"]);
    assert.equal(ev[0].provider, "claude"); assert.equal(ev[0].model, "claude-opus-5-5"); assert.equal(ev[0].host, "gateway"); assert.equal(ev[0].remaining, 39);
    assert.equal(ev[0].worldMode, null, "nhóm công cụ lỗi -> vắng mặt, chat vẫn chạy");
    const tk = ev.find((e) => e.type === "tool_result" && e.name === "catalyst_ticker").result;
    assert.equal(tk.data.ticker, "HPG"); assert.equal(tk.data.cards[0].compositeScore, 3.21);
    assert.deepEqual(ev.find((e) => e.type === "audit").untraceable, ["99,9"]);
    // tham số gửi mô hình: giữ đúng cấu hình đã chạy ở Project A
    assert.equal(calls[0].model, "claude-opus-5-5");
    assert.deepEqual(calls[0].thinking, { type: "adaptive" });
    assert.equal(calls[0].fallbacks, "default");
    assert.ok(calls[0].tools.every((t) => t.eager_input_streaming === true));
    assert.ok(calls[0].tools.some((t) => t.name === "macro_catalyst_calendar"));
    assert.match(calls[0].system, /Hướng dẫn vĩ mô\./);
    assert.match(calls[0].system, /Kết nối thế giới hiện không khả dụng/);
    // lượt 2 nhận MỘT tin nhắn user chứa đủ 2 tool_result
    const lastUser = calls[1].messages.at(-1);
    assert.equal(lastUser.role, "user"); assert.equal(lastUser.content.length, 2);
  } finally { app.close(); }
});

test("chat: chưa có khoá -> 503 provider-not-configured (giao diện chuyển Project A); chưa đăng nhập -> 401; hết hạn mức -> 429", async () => {
  const app = makeApp({ env: { GEMINI_API_KEY: "y", CATALYST_CHAT_DAILY_LIMIT: "1" }, api: fakeClaude([]) });
  try {
    const a = await post(app.base, Q);
    assert.equal(a.status, 503);
    assert.deepEqual(await a.json(), { error: "Gateway chưa cấu hình mô hình Claude.", code: "provider-not-configured", provider: "claude" });
    const cfg = await (await fetch(`${app.base}/chat/config`)).json();
    assert.deepEqual(cfg.providers, { claude: false, gemini: true });
    assert.equal((await post(app.base, { ...Q, provider: "gemini" }, null)).status, 401);
  } finally { app.close(); }
  const gem = { startChat: () => ({ sendMessageStream: async () => ({ stream: (async function* () { yield { text: () => "Chưa có dữ liệu." }; })(), response: Promise.resolve({ functionCalls: () => undefined }) }) }) };
  const app2 = makeApp({ env: { GEMINI_API_KEY: "y", CATALYST_CHAT_DAILY_LIMIT: "1" }, gemini: gem });
  try {
    const ok = await post(app2.base, { ...Q, provider: "gemini" });
    assert.equal(ok.status, 200);
    assert.equal(events(await ok.text()).at(-1).type, "done");
    const over = await post(app2.base, { ...Q, provider: "gemini" });
    assert.equal(over.status, 429);
  } finally { app2.close(); }
});

test("Gemini: vòng gọi công cụ + chuyển đặc tả JSON Schema sang dạng Gemini", async () => {
  const tools = buildToolList({ macro: MACRO_SPECS });
  const g = toGeminiTools(tools)[0].functionDeclarations;
  assert.ok(g.every((d) => !JSON.stringify(d).includes("additionalProperties")));
  let round = 0;
  const model = { startChat: () => ({ sendMessageStream: async () => {
    round++;
    const calls = round === 1 ? [{ name: "catalyst_overview", args: { topN: 1 } }] : undefined;
    const text = round === 1 ? "" : "Ngành Thép điểm ròng 2,4.";
    return { stream: (async function* () { if (text) yield { text: () => text }; })(), response: Promise.resolve({ functionCalls: () => calls }) };
  } }) };
  const out = [];
  const exec = createToolExecutor({ getSnapshot: async () => SNAP, calendar: async () => ({}), run: {} });
  await runChatGemini({ messages: Q.messages, system: "s", tools, model, execTool: exec, emit: (e) => out.push(e) });
  assert.deepEqual(out.map((e) => e.type), ["tool_call", "tool_result", "text", "done"]);
  assert.equal(out[1].result.data.topSectors[0].netScore, 2.4);
});

test("executor: nhóm công cụ không bật -> lỗi rõ ràng; tên lạ -> báo không có", async () => {
  const exec = createToolExecutor({ getSnapshot: async () => null, calendar: async () => { throw new Error("x"); }, run: {} });
  assert.match((await exec("elite_decision", {})).error, /Elite hiện không khả dụng/);
  assert.match((await exec("catalyst_overview", {})).error, /Chưa có snapshot/);
  assert.match((await exec("macro_catalyst_calendar", {})).error, /Không lấy được lịch vĩ mô/);
  assert.match((await exec("xyz", {})).error, /Không có công cụ xyz/);
  assert.match(buildSystemPrompt({}, "2026-11-19", "judge"), /^VAI TRÒ: trọng tài/);
});

test("kiểm tra con số: số từ công cụ, ×100, năm, số nhỏ không bị báo", () => {
  assert.deepEqual(auditNumbers("Tỷ lệ 46%, điểm 3,21, năm 2026, 3 ngành, 0,46 và 12,5", [{ data: { a: 46, b: 3.21, c: 0.46 } }]), ["12,5"]);
});

test("Sự kiện trong nước: có dấu, giai đoạn sắp theo ngày, giai đoạn hiện hành tính theo ngày; route giữ hợp đồng", async () => {
  const [ev] = domesticEventsWithCountdown(T);
  assert.equal(ev.title, "FTSE Russell nâng hạng Việt Nam lên Thị trường mới nổi thứ cấp");
  assert.deepEqual(ev.stages.map((s) => s.date), ["2018-09-01", "2026-03-01", "2026-04-07", "2026-09-21"]);
  assert.equal(ev.activeStageIndex, 3);
  assert.equal(ev.isPast, true);
  assert.equal(domesticEventsWithCountdown(Date.parse("2026-03-15T00:00:00Z"))[0].activeStageIndex, 1);
  assert.ok(DOMESTIC_EVENTS.every((e) => e.sourceUrl.startsWith("https://")));
  const app = makeApp({ env: {} });
  try {
    const body = await (await fetch(`${app.base}/domestic-events`)).json();
    assert.deepEqual(Object.keys(body.events[0]).sort(), ["activeStageIndex", "daysUntil", "effectiveDate", "id", "isPast", "note", "sourceName", "sourceUrl", "stages", "tag", "title"]);
  } finally { app.close(); }
});

test("Gemini quá tải: chuyển mô hình dự phòng với cùng lịch sử, báo người dùng, ghi đúng mô hình trả lời; lỗi không tạm thời thì báo thẳng", async () => {
  const { withGeminiFallback, geminiChain, isTransientGeminiError } = await import("../src/market/catalystChat/chatService.js");
  assert.deepEqual(geminiChain({}), ["gemini-3.6-flash", "gemini-flash-latest", "gemini-flash-lite-latest"]);
  assert.deepEqual(geminiChain({ GEMINI_CHAT_MODEL: "gemini-flash-lite-latest" }), ["gemini-flash-lite-latest", "gemini-flash-latest"]);
  assert.equal(isTransientGeminiError(new Error("[503 Service Unavailable] This model is currently experiencing high demand")), true);
  assert.equal(isTransientGeminiError(new Error("[400 Bad Request] Invalid JSON payload")), false);
  const opened = [];
  const model = withGeminiFallback(["m1", "m2", "m3"], (name, opts) => {
    opened.push([name, opts.history.length]);
    return {
      getHistory: async () => [{ role: "user", parts: [{ text: "cũ" }] }],
      sendMessageStream: async () => {
        if (name !== "m3") throw new Error("[503 Service Unavailable] high demand");
        return { stream: (async function* () { yield { text: () => "Trả lời." }; })(), response: Promise.resolve({ functionCalls: () => undefined }) };
      },
    };
  });
  const out = [];
  await runChatGemini({ messages: Q.messages, system: "s", tools: [], model, execTool: async () => ({ ok: true }), emit: (e) => out.push(e) });
  assert.deepEqual(opened, [["m1", 0], ["m2", 1], ["m3", 1]]);
  assert.deepEqual(out.map((e) => e.type), ["notice", "text", "done"]);
  assert.match(out[0].notice, /m1 đang quá tải — câu trả lời do m3 thực hiện/);
  assert.equal(out.at(-1).model, "m3");
  assert.equal(out.at(-1).fallback, true);
  const hard = withGeminiFallback(["m1", "m2"], () => ({ sendMessageStream: async () => { throw new Error("[400 Bad Request] bad"); } }));
  await assert.rejects(runChatGemini({ messages: Q.messages, system: "s", tools: [], model: hard, execTool: async () => ({ ok: true }), emit: () => {} }), /400/);
});

test("geminiSession: lịch sử tự quản lý giữ thoughtSignature + lượt gọi công cụ; kết quả công cụ gửi kèm id", async () => {
  const { geminiSession } = await import("../src/market/catalystChat/chatService.js");
  const sent = [];
  const chunks = [
    [{ candidates: [{ content: { parts: [{ functionCall: { name: "catalyst_overview", args: {}, id: "call_1" }, thoughtSignature: "SIG" }, { text: "" }] } }] }],
    [{ candidates: [{ content: { parts: [{ text: "Thép " }] } }] }, { candidates: [{ content: { parts: [{ text: "2,4.", thoughtSignature: "S2" }] } }] }],
  ];
  let i = 0;
  const genModel = { generateContentStream: async ({ contents }) => {
    sent.push(structuredClone(contents));
    const cs = chunks[i];
    const calls = i === 0 ? [{ name: "catalyst_overview", args: {}, id: "call_1" }] : undefined;
    i++;
    return { stream: (async function* () { for (const c of cs) yield { ...c, text: () => c.candidates[0].content.parts.map((p) => p.text ?? "").join("") }; })(), response: Promise.resolve({ functionCalls: () => calls }) };
  } };
  const out = [];
  const model = { startChat: ({ history }) => geminiSession(genModel, history) };
  await runChatGemini({ messages: Q.messages, system: "s", tools: [], model, execTool: async () => ({ ok: true, data: { netScore: 2.4 } }), emit: (e) => out.push(e) });
  // lượt 2 gửi: [user hỏi, model gọi công cụ (giữ chữ ký, bỏ phần text rỗng), user trả kết quả có id]
  assert.equal(sent[1].length, 3);
  assert.deepEqual(sent[1][1], { role: "model", parts: [{ functionCall: { name: "catalyst_overview", args: {}, id: "call_1" }, thoughtSignature: "SIG" }] });
  assert.equal(sent[1][2].parts[0].functionResponse.id, "call_1");
  assert.equal(out.filter((e) => e.type === "text").map((e) => e.delta).join(""), "Thép 2,4.");
});

test("Gemini: mô hình vừa quá tải được cho nghỉ 5 phút — câu hỏi sau đi thẳng mô hình dự phòng, vẫn báo người dùng", async () => {
  const { withGeminiFallback, resetGeminiCooldown, GEMINI_COOLDOWN_MS } = await import("../src/market/catalystChat/chatService.js");
  resetGeminiCooldown();
  let t = 1_000;
  const opened = [];
  const open = (name) => ({
    getHistory: async () => [],
    sendMessageStream: async () => {
      opened.push(name);
      if (name === "a") throw new Error("[503] high demand");
      return { stream: (async function* () { yield { text: () => "ok" }; })(), response: Promise.resolve({ functionCalls: () => undefined }) };
    },
  });
  const ask = async () => { const out = []; await runChatGemini({ messages: Q.messages, system: "s", tools: [], model: withGeminiFallback(["a", "b"], open, () => t), execTool: async () => ({ ok: true }), emit: (e) => out.push(e) }); return out; };
  await ask();
  assert.deepEqual(opened, ["a", "b"]);
  const second = await ask();
  assert.deepEqual(opened, ["a", "b", "b"], "câu hỏi thứ hai không chờ lại mô hình đang nghỉ");
  assert.match(second.find((e) => e.type === "notice").notice, /a đang quá tải — câu trả lời do b/);
  t += GEMINI_COOLDOWN_MS + 1;
  await ask();
  assert.deepEqual(opened.slice(3), ["a", "b"], "hết thời gian nghỉ -> thử lại mô hình chính");
  resetGeminiCooldown();
});
