// GPT-1 (26/11/2026): GPT là mô hình chính của làn "claude", Claude dự phòng. Mô hình giả có kịch bản — không gọi API thật.
process.env.MARKET_ALERTS_ENABLED = "false";
import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { createCatalystRouter } from "../src/routes/catalysts.js";
import { createCatalystChat, restrictSealedSchema } from "../src/market/catalystChat/chatService.js";
import { openaiError, runChatOpenAI, toOpenAiTools } from "../src/market/catalystChat/openaiEngine.js";
import { domesticEventsWithCountdown } from "../src/market/catalystChat/domesticEvents.js";
import { sealedClaimsJsonSchema } from "../src/market/vendor/evidenceRoom.mjs";

const T = Date.parse("2026-11-26T03:00:00Z");
const SNAP = { scannedAt: "2026-11-26T02:35:00Z", ageMinutes: 25, isStale: false, sectors: [], topSignals: [] };
const MACRO = { anthropic: [{ name: "macro_score", description: "điểm vĩ mô", input_schema: { type: "object", properties: { target: { type: "string" } }, required: [] } }], systemPrompt: "Hướng dẫn vĩ mô." };
const ok = (body) => ({ ok: true, status: 200, json: async () => body, headers: { get: () => null } });
const fail = (status, error, retryAfter = null) => ({ ok: false, status, json: async () => ({ error }), headers: { get: (k) => (k === "retry-after" ? retryAfter : null) } });

/** OpenAI giả: lượt 1 gọi macro_score, lượt 2 trả lời. */
function fakeOpenAi(calls, script) {
  let n = 0;
  return async (url, init) => {
    calls.push(JSON.parse(init.body)); n++;
    return script(n);
  };
}
const twoRounds = (n) => n === 1
  ? ok({ model: "gpt-5.5-2026-04-23", choices: [{ finish_reason: "tool_calls", message: { content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "macro_score", arguments: "{\"target\":\"VN\"}" } }] } }] })
  : ok({ model: "gpt-5.5-2026-04-23", choices: [{ finish_reason: "stop", message: { content: "Điểm vĩ mô 0,03." } }] });
function fakeClaude(calls) {
  return { stream(params) { calls.push(params); const msg = { stop_reason: "end_turn", model: "claude-opus-5-5", content: [{ type: "text", text: "Claude trả lời." }] };
    return { on: (ev, cb) => { if (ev === "text") cb("Claude trả lời."); }, finalMessage: async () => msg }; } };
}
function makeApp({ env, fetchImpl, api }) {
  const chat = createCatalystChat({
    env, now: () => T, store: createMemoryStore(), verifyUser: async (a) => (a === "Bearer good" ? "user-1" : null), log: { log() {}, error() {}, warn() {} },
    sources: { macro: async () => MACRO, world: async () => { throw new Error("world hỏng"); } },
    run: { macro: async (name) => ({ ok: true, data: { name, score: 0.03 } }) },
    getSnapshot: async () => SNAP, calendar: async () => ({ asOf: "2026-11-26", mode: "real", events: [], caveat: "" }),
    anthropicApi: async () => api, fetchImpl,
  });
  const app = express(); app.use(express.json());
  app.use("/api/catalysts", createCatalystRouter({ getStore: () => null, getChat: () => chat, getDomesticEvents: domesticEventsWithCountdown, now: () => T }));
  const srv = app.listen(0);
  return { chat, base: `http://127.0.0.1:${srv.address().port}/api/catalysts`, close: () => srv.close() };
}
const post = (base, body) => fetch(`${base}/chat`, { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer good" }, body: JSON.stringify(body) });
const events = (text) => text.split("\n\n").filter((p) => p.startsWith("data:")).map((p) => JSON.parse(p.slice(5)));
const Q = { messages: [{ role: "user", content: "Vĩ mô hôm nay?" }] };

test("engine GPT: vòng công cụ đúng hợp đồng sự kiện; công cụ đổi sang dạng hàm; kết quả công cụ quay lại hội thoại", async () => {
  const calls = [], ev = [];
  const r = await runChatOpenAI({ messages: Q.messages, system: "S", tools: MACRO.anthropic, apiKey: "k", fetchImpl: fakeOpenAi(calls, twoRounds),
    execTool: async (name, input) => ({ ok: true, data: { name, input, score: 0.03 } }), emit: (e) => ev.push(e) });
  assert.deepEqual(ev.map((e) => e.type), ["tool_call", "tool_result", "text", "done"]);
  assert.deepEqual(ev[0].input, { target: "VN" });
  assert.equal(ev.at(-1).model, "gpt-5.5-2026-04-23");
  assert.equal(r.text, "Điểm vĩ mô 0,03.");
  assert.deepEqual(calls[0].tools, toOpenAiTools(MACRO.anthropic));
  assert.equal(calls[0].messages[0].role, "system");
  assert.equal(calls[1].messages.at(-1).role, "tool"); assert.equal(calls[1].messages.at(-1).tool_call_id, "c1");
});

test("lỗi OpenAI: hết tín dụng (429 credit_balance_exhausted) được gắn billing; Retry-After được giữ", async () => {
  const e = await openaiError(fail(429, { code: "credit_balance_exhausted", message: "You have no credits remaining." }, "30"));
  assert.equal(e.status, 429); assert.equal(e.billing, true); assert.equal(e.headers["retry-after"], "30");
  const r = await openaiError(fail(429, { code: "rate_limit_exceeded", message: "Rate limit" }));
  assert.equal(r.billing, undefined);
});

test("chat: có khoá GPT -> GPT là mô hình chính; meta / done báo đúng mô hình GPT; Claude không bị gọi", async () => {
  const oa = [], cl = [];
  const app = makeApp({ env: { OPENAI_API_KEY: "o", ANTHROPIC_API_KEY: "a" }, fetchImpl: fakeOpenAi(oa, twoRounds), api: fakeClaude(cl) });
  try {
    const ev = events(await (await post(app.base, Q)).text());
    assert.equal(ev[0].type, "meta"); assert.equal(ev[0].model, "gpt-5.5");
    assert.equal(ev.find((e) => e.type === "done").model, "gpt-5.5-2026-04-23");
    assert.ok(ev.some((e) => e.type === "text" && e.delta === "Điểm vĩ mô 0,03."));
    assert.equal(oa.length, 2); assert.equal(cl.length, 0);
    assert.deepEqual(app.chat.config().engines, { claude: "openai", fallback: "claude-opus-5-5" });
  } finally { app.close(); }
});

test("chat: GPT hết tín dụng -> chuyển Claude dự phòng, báo rõ, meta mới mang mô hình Claude, done.fallback = true", async () => {
  const cl = [];
  const app = makeApp({ env: { OPENAI_API_KEY: "o", ANTHROPIC_API_KEY: "a" }, fetchImpl: async () => fail(429, { code: "credit_balance_exhausted", message: "You have no credits remaining." }), api: fakeClaude(cl) });
  try {
    const ev = events(await (await post(app.base, Q)).text());
    const metas = ev.filter((e) => e.type === "meta");
    assert.deepEqual(metas.map((m) => m.model), ["gpt-5.5", "claude-opus-5-5"]);
    assert.match(ev.find((e) => e.type === "notice").notice, /GPT không khả dụng \(hết tín dụng\).*Claude dự phòng/);
    assert.equal(ev.find((e) => e.type === "done").fallback, true);
    assert.ok(ev.some((e) => e.type === "text" && e.delta === "Claude trả lời."));
    assert.equal(cl.length, 1);
  } finally { app.close(); }
});

test("chat: cả GPT lẫn dự phòng đều không có -> báo hết tín dụng rõ ràng; chỉ có khoá Claude -> chạy như cũ", async () => {
  const app = makeApp({ env: { OPENAI_API_KEY: "o" }, fetchImpl: async () => fail(429, { code: "credit_balance_exhausted", message: "You have no credits remaining." }) });
  try {
    const ev = events(await (await post(app.base, Q)).text());
    assert.equal(ev.find((e) => e.type === "error").message, "Nhà cung cấp AI hết tín dụng — chủ dự án cần nạp thêm.");
  } finally { app.close(); }
  const cl = [];
  const app2 = makeApp({ env: { ANTHROPIC_API_KEY: "a" }, fetchImpl: async () => assert.fail("không được gọi GPT"), api: fakeClaude(cl) });
  try {
    const ev = events(await (await post(app2.base, Q)).text());
    assert.equal(ev[0].model, "claude-opus-5-5"); assert.equal(cl.length, 1);
    assert.equal(app2.chat.config().engines.claude, "anthropic");
  } finally { app2.close(); }
});

test("phân tích khoá snapshot (phe thuận / trọng tài): GPT nhận JSON schema giới hạn đúng snapshot, vai, mã, ref; GPT lỗi -> Claude", async () => {
  const snapshot = { snapshotId: "snap-1", ticker: "FPT", refs: [{ id: "r1" }, { id: "r2" }] };
  const restricted = restrictSealedSchema(sealedClaimsJsonSchema(), "BULL", snapshot);
  assert.deepEqual(restricted.properties.snapshotId.enum, ["snap-1"]);
  assert.deepEqual(restricted.properties.claims.items.properties.side.enum, ["BULL"]);
  assert.deepEqual(restricted.properties.claims.items.properties.refs.items.enum, ["r1", "r2"]);
  const oa = [];
  const app = makeApp({ env: { OPENAI_API_KEY: "o", ANTHROPIC_API_KEY: "a" }, api: fakeClaude([]),
    fetchImpl: fakeOpenAi(oa, () => ok({ model: "gpt-5.5", choices: [{ finish_reason: "stop", message: { content: "{\"schemaVersion\":\"claims-1.0\"}" } }] })) });
  try {
    assert.equal(await app.chat.analyzeSealed("BULL", "review", snapshot), "{\"schemaVersion\":\"claims-1.0\"}");
    assert.equal(oa[0].response_format.type, "json_schema");
    assert.deepEqual(oa[0].response_format.json_schema.schema.properties.claims.items.properties.ticker.enum, ["FPT"]);
    assert.equal(oa[0].tools, undefined, "chế độ snapshot không có công cụ");
  } finally { app.close(); }
  const cl = [];
  const app2 = makeApp({ env: { OPENAI_API_KEY: "o", ANTHROPIC_API_KEY: "a" }, api: fakeClaude(cl), fetchImpl: async () => fail(503, { message: "busy" }) });
  try { assert.equal(await app2.chat.analyzeSealed("JUDGE", "review", snapshot), "Claude trả lời."); assert.equal(cl.length, 1); }
  finally { app2.close(); }
});
