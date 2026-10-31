import { test } from "node:test";
import assert from "node:assert/strict";
import { callGeminiJSON } from "../src/services/geminiClient.js";

test("khoá đi qua header, không nằm trong URL; ghép phần nội dung, bỏ phần suy luận", async () => {
  const saved = [process.env.GEMINI_API_KEY, globalThis.fetch];
  process.env.GEMINI_API_KEY = "k-test";
  let url, init;
  globalThis.fetch = async (u, i) => { url = u; init = i; return { ok: true, json: async () => ({ usageMetadata: { totalTokenCount: 5 }, candidates: [{ content: { parts: [{ text: "nghĩ", thought: true }, { text: '{"a":' }, { text: "1}" }] } }] }) }; };
  try {
    const r = await callGeminiJSON({ systemPrompt: "s", parts: [{ text: "u" }], model: "m", generationConfig: { temperature: 0.2 } });
    assert.deepEqual(r.json, { a: 1 });
    assert.equal(r.usage.totalTokenCount, 5);
    assert.ok(!url.includes("k-test"));
    assert.equal(init.headers["x-goog-api-key"], "k-test");
    assert.equal(JSON.parse(init.body).generationConfig.temperature, 0.2);
    assert.ok(init.signal);
  } finally { process.env.GEMINI_API_KEY = saved[0]; if (saved[0] === undefined) delete process.env.GEMINI_API_KEY; globalThis.fetch = saved[1]; }
});

test("lỗi HTTP giữ mã trạng thái cho thông báo công khai", async () => {
  const saved = [process.env.GEMINI_API_KEY, globalThis.fetch];
  process.env.GEMINI_API_KEY = "k-test";
  globalThis.fetch = async () => ({ ok: false, status: 429 });
  try { await assert.rejects(callGeminiJSON({ systemPrompt: "s", parts: [], model: "m", retryMs: 0 }), (e) => e.attempts.length === 2 && e.attempts[0].status === 429 && !e.message.includes("k-test")); }
  finally { process.env.GEMINI_API_KEY = saved[0]; if (saved[0] === undefined) delete process.env.GEMINI_API_KEY; globalThis.fetch = saved[1]; }
});
