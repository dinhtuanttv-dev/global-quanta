import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildCycleContext, queryCycles } from "../src/market/cycles/cycleService.js";
import { decodeCtx, encodeCtx, readCtxMeta } from "../src/market/cycles/ctxCodec.js";
import { createCycleHost } from "../src/market/cycles/cycleHost.js";
import { cycleOps } from "../src/market/cycles/cycleOps.js";

const DATES = (() => { const out = []; const d = new Date(Date.UTC(2021, 0, 4)); while (out.length < 900) { const w = d.getUTCDay(); if (w >= 1 && w <= 5) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); } return out; })();
function walk(seed) { let a = seed >>> 0; const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 2 ** 32 - 0.5; }; let p = 100; return DATES.map((date) => { p *= Math.exp(0.02 * r()); return { date, close: p, volume: 1e6, value: 2e10 }; }); }
function makeCtx() {
  const seriesOf = new Map(), sectorOf = new Map();
  for (let k = 0; k < 16; k++) { const t = `T${String(k).padStart(2, "0")}`; seriesOf.set(t, walk(k + 7)); sectorOf.set(t, k % 2 ? "S1" : "S2"); }
  const ctx = buildCycleContext({ seriesOf, benchBars: walk(999), sectorOf, now: () => Date.parse("2026-11-05T09:00:00Z") });
  ctx.sectorOf = sectorOf; ctx.skipped = 1; ctx.viaTaSeries = 2;
  return ctx;
}
const ctx = makeCtx();
const meta = { sha256: "abcdef0123456789", engine: "cycles/CF2", dataAsOf: ctx.dataAsOf, builtAt: ctx.builtAt };

test("mã hoá rồi giải mã: đúng từng bit cho mảng có kiểu, Map, NaN; truy vấn cho kết quả giống hệt", () => {
  const buf = encodeCtx(ctx, meta);
  assert.deepEqual(readCtxMeta(buf), meta);
  const back = decodeCtx(buf).ctx;
  assert.ok(back.lib.z instanceof Float32Array && back.lib.ySum instanceof Float64Array && back.lib.sid instanceof Int16Array);
  assert.deepEqual(Buffer.from(back.lib.z.buffer), Buffer.from(ctx.lib.z.buffer));
  assert.ok(back.cal.calOf instanceof Map && back.cal.calOf.size === ctx.cal.calOf.size);
  const sm = [...ctx.prep.sectorMedian.values()][0], sm2 = [...back.prep.sectorMedian.values()][0];
  assert.ok(Number.isNaN(sm[0]) && Number.isNaN(sm2[0]), "NaN giữ nguyên");
  for (const t of ["T00", "T05", "T15"]) assert.deepEqual(queryCycles(back, t), queryCycles(ctx, t));
});

test("file hỏng hoặc khác phiên bản thì báo lỗi rõ, không trả dữ liệu sai", () => {
  assert.throws(() => decodeCtx(Buffer.from("rác rác rác rác")), /không hợp lệ/);
  const buf = encodeCtx(ctx, meta); buf.writeUInt32LE(99, 4);
  assert.throws(() => readCtxMeta(buf), /Phiên bản/);
});

for (const useWorker of [true, false]) {
  test(`nơi giữ thư viện (${useWorker ? "worker" : "trong tiến trình"}): kết quả giống hệt tính trực tiếp; lưu file và nạp lại từ đĩa`, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gq-cycles-"));
    const host = createCycleHost({ dir, useWorker, log: { warn() {} } });
    try {
      const info = await host.put(ctx, meta);
      assert.equal(host.status().mode, useWorker ? "worker" : "in-process");
      assert.equal(info.windows, ctx.lib.N);
      assert.deepEqual(info.calDates, ctx.cal.dates);
      for (const t of ["T01", "T08"]) assert.deepEqual(await host.run("query", { symbol: t }), queryCycles(ctx, t));
      assert.deepEqual(await host.run("snapshotRows"), cycleOps.snapshotRows(ctx));
      assert.equal(await host.run("query", { symbol: "KHONGCO" }), null);
      assert.deepEqual(fs.readdirSync(dir), [`ctx-${ctx.dataAsOf}-abcdef01.bin`]);

      const again = createCycleHost({ dir, useWorker, log: { warn() {} } });
      assert.equal(await again.loadFromDisk("khac-cau-hinh"), null, "cấu hình khác thì không dùng file");
      const fromDisk = await again.loadFromDisk(meta.sha256);
      assert.equal(again.status().source, "disk");
      assert.equal(fromDisk.dataAsOf, ctx.dataAsOf);
      assert.deepEqual(await again.run("query", { symbol: "T03" }), queryCycles(ctx, "T03"));
      again.close();
    } finally { host.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  });
}

test("chưa nạp thì báo lỗi rõ; lưu file mới thì xoá file cũ", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gq-cycles-"));
  const host = createCycleHost({ dir, useWorker: false, log: { warn() {} } });
  try {
    await assert.rejects(() => host.run("query", { symbol: "T00" }), /chưa nạp/);
    await host.put(ctx, meta);
    await host.put(ctx, { ...meta, dataAsOf: "2099-01-01" });
    assert.deepEqual(fs.readdirSync(dir), ["ctx-2099-01-01-abcdef01.bin"]);
  } finally { host.close(); fs.rmSync(dir, { recursive: true, force: true }); }
});

test("job hằng ngày dùng lại thư viện đã nạp khi đã dựng sau giờ chốt dữ liệu của chính phiên đó", async () => {
  const { libraryIsCurrent } = await import("../src/market/cycles/cycleService.js");
  const lib = (dataAsOf, builtAtUtc) => ({ dataAsOf, builtAt: builtAtUtc });
  assert.equal(libraryIsCurrent(lib("2026-11-05", "2026-11-05T09:43:53Z"), "2026-11-05"), true, "16:43 VN cùng phiên");
  assert.equal(libraryIsCurrent(lib("2026-11-05", "2026-11-05T08:30:00Z"), "2026-11-05"), false, "15:30 VN, trước đối soát");
  assert.equal(libraryIsCurrent(lib("2026-11-04", "2026-11-04T09:10:00Z"), "2026-11-05"), false, "đã có phiên mới");
  assert.equal(libraryIsCurrent(lib("2026-11-05", "2026-11-06T01:00:00Z"), "2026-11-05"), true, "dựng sáng hôm sau, chưa có phiên mới");
  assert.equal(libraryIsCurrent(null, "2026-11-05"), false);
});
