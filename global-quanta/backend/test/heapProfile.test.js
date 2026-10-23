import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createHeapProfileRouter, summarizeProfile } from "../src/routes/heapProfile.js";

const f = (functionName, url, lineNumber) => ({ functionName, url, lineNumber });
test("tổng hợp mẫu: self theo hàm, inclusive gồm hàm con, chỉ mã của app", () => {
  const head = { callFrame: f("(root)", "", -1), selfSize: 0, children: [
    { callFrame: f("load", "file:///app/src/a.js", 9), selfSize: 1048576, children: [{ callFrame: f("parse", "file:///app/src/b.js", 1), selfSize: 3 * 1048576, children: [] }] },
    { callFrame: f("JSON.parse", "", 0), selfSize: 1048576, children: [] },
  ] };
  const s = summarizeProfile(head);
  assert.equal(s.sampledLiveMb, 5);
  assert.deepEqual(s.bySelf.map((x) => x.site), ["parse src/b.js:2", "load src/a.js:10"]);
  assert.equal(s.byInclusive[0].site, "load src/a.js:10"); assert.equal(s.byInclusive[0].mb, 4);
});

test("route: cần admin; start -> GET trả mẫu thật -> stop", async () => {
  const app = express(); app.use("/hp", createHeapProfileRouter({ adminToken: () => "tok" }));
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}/hp`;
  const H = { authorization: "Bearer tok" };
  try {
    assert.equal((await fetch(base)).status, 401);
    assert.equal((await fetch(`${base}/start`, { method: "POST", headers: H })).status, 200);
    globalThis.keep = Array.from({ length: 2e5 }, (_, i) => ({ i, s: "x" + i }));
    const j = await (await fetch(`${base}?all=1`, { headers: H })).json();
    assert.ok(j.sampledLiveMb > 0 && Array.isArray(j.bySelf) && j.memory.heapLimitMb > 0, JSON.stringify(j).slice(0, 200));
    assert.equal((await fetch(`${base}/stop`, { method: "POST", headers: H })).status, 200);
  } finally { srv.close(); delete globalThis.keep; }
});
