// Gateway resource diet (27/11/2026): các thay đổi tiết kiệm RAM/CPU không đổi hành vi tính năng.
import test from "node:test";
import assert from "node:assert/strict";
import { createWorkerProxy } from "../src/market/macro/workerProxy.js";
import { createLocalFirstStore } from "../src/market/store/localFirstStore.js";
import { createLocalBootstrap, BOOTSTRAP_KV } from "../src/market/store/localBootstrap.js";
import { eventRadarDelay } from "../src/market/news/eventRadar.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("b3: worker rảnh -> tự tắt; lần gọi sau khởi lại và PHÁT LẠI dữ liệu nạp cuối, kết quả không đổi", async () => {
  const p = createWorkerProxy({ url: new URL("./fixtures/replayWorker.mjs", import.meta.url), label: "thử", replayOp: "setReal", idleMs: 80 });
  try {
    assert.equal(await p.call("setReal", [1, 2, 3]), 3);
    const first = await p.call("get");
    assert.deepEqual(first.data, [1, 2, 3]);
    await sleep(250); // quá idleMs -> worker đã tắt
    const second = await p.call("get");
    assert.deepEqual(second.data, [1, 2, 3], "dữ liệu được phát lại sau khi khởi lại");
    assert.notEqual(second.bootId, first.bootId, "đúng là một worker mới");
  } finally { await p.close(); }
});

test("b3: không có replayOp -> không tự tắt (giữ hành vi cũ)", async () => {
  const p = createWorkerProxy({ url: new URL("./fixtures/replayWorker.mjs", import.meta.url), label: "thử", idleMs: 50 });
  try {
    await p.call("setReal", [9]);
    const a = await p.call("get");
    await sleep(200);
    const b = await p.call("get");
    assert.equal(a.bootId, b.bootId);
    assert.deepEqual(b.data, [9]);
  } finally { await p.close(); }
});

test("b5: replica=false -> không ghi bản sao, không đọc dự phòng sang kho ngoài; kho cục bộ vẫn hoạt động", async () => {
  const calls = [];
  const inner = new Proxy({}, { get: (_t, k) => async (...a) => { calls.push(String(k)); return null; } });
  const kv = new Map();
  const local = new Proxy({ setKv: async (k, v) => void kv.set(k, v), getKv: async (k) => (kv.has(k) ? { value: kv.get(k) } : null) },
    { get: (t, k) => t[k] ?? (async () => null) });
  const s = createLocalFirstStore({ local, inner, replica: false, log: { warn() {} } });
  await s.setKv("x", { a: 1 });
  assert.deepEqual((await s.getKv("x"))?.value, { a: 1 });
  await s.getKv("missing");
  await sleep(20);
  assert.deepEqual(calls, [], "không gọi kho ngoài");
});

test("b7: Event Radar poll 5 phút trong ngày giao dịch 06:00–22:00, gấp đôi ban đêm / cuối tuần", () => {
  const base = eventRadarDelay(new Date("2026-11-27T03:00:00Z")); // Thứ Sáu 10:00 giờ VN
  assert.ok(base >= 60_000);
  assert.equal(eventRadarDelay(new Date("2026-11-27T16:00:00Z")), base * 2); // 23:00 giờ VN
  assert.equal(eventRadarDelay(new Date("2026-11-29T03:00:00Z")), base * 2); // Chủ nhật
});

test("a3: bản ghi bootstrap 'running' của lần chạy bị ngắt -> 'interrupted' khi khởi động (không chạy lại)", async () => {
  const kv = new Map([[BOOTSTRAP_KV, { status: "running", reason: "auto", startedAt: "2026-10-22T22:30:07Z", steps: [{ name: "a", status: "ok" }, { name: "b", status: "running" }] }],
    ["scanner:latest", { items: [{ ticker: "FPT" }] }]]);
  const store = { getKv: async (k) => (kv.has(k) ? { value: kv.get(k) } : null), setKv: async (k, v) => void kv.set(k, v), getMarketDailyDates: async () => Array.from({ length: 300 }, (_, i) => `d${i}`) };
  const b = createLocalBootstrap({ jobs: {}, store, log: { warn() {}, info() {} } });
  const r = await b.autoStart();
  assert.equal(r.skipped, true);
  const st = kv.get(BOOTSTRAP_KV);
  assert.equal(st.status, "interrupted");
  assert.deepEqual(st.steps.map((s) => s.status), ["ok", "interrupted"]);
});
