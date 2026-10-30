// Cấu trúc đa khung (T4) — dịch vụ Gateway với SSI / ta-series giả lập: ghim chú thích đúng nến, kho nến 1 giờ trên đĩa
// (phiên đã đóng chỉ tải một lần), job tóm tắt toàn universe ghi đĩa + KV (KV lỗi không làm hỏng job).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStructureService, STRUCTURE_SCHEDULE, summaryRow } from "../src/market/structure/structureService.js";
import { createStructureDisk, pruneLegacyH1 } from "../src/market/structure/structureDisk.js";
import { rng } from "../src/market/structure/ml.js";

const NOW = Date.parse("2026-10-21T10:00:00Z"); // 17:00 giờ VN, Thứ Tư — phiên đã đóng

function tradingDays(n, end = "2026-10-21") {
  const out = []; const d = new Date(`${end}T00:00:00Z`);
  while (out.length < n) { if (d.getUTCDay() % 6) out.unshift(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1); }
  return out;
}
function dailySeries(seed, n = 700) {
  const r = rng(seed); let p = 30_000;
  return tradingDays(n).map((date, i) => {
    const o = p; p = Math.max(6000, p * (1 + Math.sin(i / 40) * 0.004 + (r() - 0.5) * 0.03));
    return { date, open: o, high: Math.max(o, p) * 1.01, low: Math.min(o, p) * 0.99, close: p, volume: 1e6 };
  });
}
function minutesFor(day, close) {
  const out = [];
  for (const [hh, mm] of [[9, 15], [9, 45], [10, 30], [11, 20], [13, 5], [13, 50], [14, 20], [14, 45]]) {
    const p = close * (1 + (hh - 12) * 0.001);
    out.push({ date: `${day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+07:00`, open: p, high: p * 1.002, low: p * 0.998, close: p, volume: 1000 });
  }
  return out;
}

function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gq-structure-"));
  const series = { FPT: dailySeries(3), HPG: dailySeries(5), VNINDEX: dailySeries(7) };
  const calls = { range: [], live: 0 };
  const provider = {
    isConfigured: () => true,
    async getIntradayRange(symbol, from, to) {
      calls.range.push([symbol, from, to]);
      return series[symbol].filter((b) => b.date >= from && b.date <= to).flatMap((b) => minutesFor(b.date, b.close));
    },
    async getIntradayOhlcv() { calls.live++; return []; },
  };
  const kv = new Map([["scanner:universe", { value: { tickers: [{ ticker: "FPT" }, { ticker: "HPG" }] } }]]);
  const store = { async getKv(k) { return kv.get(k) ?? null; }, async setKv() { throw new Error("HTTP 402"); } };
  const service = { store, router: { providers: { ssiFcV2: provider } }, cache: { wrap: (_k, _t, fn) => fn() }, async getIndexComponents(code) { return { symbols: code === "VN30" ? ["FPT"] : ["FPT", "HPG"] }; } };
  const taSeries = { async get({ symbol }) { return { priceBasis: symbol === "VNINDEX" ? "INDEX_POINTS" : "ADJUSTED_CUMULATIVE", bars: series[symbol], corporateActions: [] }; } };
  const seriesSource = { async prepare() { return async (t) => ({ priceBasis: "ADJUSTED_CUMULATIVE", bars: series[t] }); } };
  const svc = createStructureService({ service, taSeries, corporateActions: null, now: () => NOW, disk: createStructureDisk({ dir, log: { warn() {}, info() {} } }), seriesSource });
  return { svc, calls, dir, series };
}

test("job scanStructure: tóm tắt từng mã, ghi đĩa; KV lỗi 402 không làm hỏng job; đọc lại từ đĩa", async () => {
  const { svc } = fixture();
  const out = await svc.jobs.scanStructure();
  assert.equal(out.symbols, 2);
  assert.equal(out.disk, true);
  assert.equal(out.kv, false);
  const doc = await svc.summary();
  assert.equal(doc.rows.length, 2);
  const row = doc.rows[0];
  for (const k of ["t", "st", "age", "v", "sc", "sup", "res", "trigL", "trigS"]) assert.ok(k in row, k);
  assert.ok(row.sc >= 0 && row.sc <= 8);
  assert.equal(typeof summaryRow, "function");
  assert.equal(doc.momentum.recordedDays, 0, "phiên 21/10 (trước triển khai) không vào sổ đà tăng tiếp diễn");
  assert.equal(doc.momentum.verdict, "PENDING");
  assert.equal(doc.momentum.prereg, "structure/MTF-momentum-prereg-2026-10-24");
  // MTF v3 trong bản tóm tắt (bảng bộ lọc) + không còn khung 1 giờ / job làm ấm 15:40
  assert.ok(["S1", "S2", "S3", "S4", "NA"].includes(row.s3.st));
  assert.ok(["setup", "blocked", "wait"].includes(row.s3.dec));
  assert.ok(!("hs" in row));
  assert.deepEqual(STRUCTURE_SCHEDULE.map((j) => j.name), ["scanStructure"]);
  assert.equal(typeof svc.analyze, "undefined", "endpoint v2 /structure/:symbol đã gỡ");
});

test("MTF v3 S1 (/structure3): Ngày · Tuần · Tháng từ cùng chuỗi nến ngày, không tải nến phút, khung lớn chỉ dùng kỳ đã đóng", async () => {
  const { svc, calls, series } = fixture();
  const r = await svc.analyze3("FPT");
  assert.match(r.version, /^3\./);
  assert.ok(r.evidence.verdicts && r.evidence.H.H1, "kết quả kiểm định MTF-v3");
  assert.equal(r.asOf, series.FPT.at(-1).date);
  assert.ok(r.bars.W > 130 && r.bars.M > 30);
  const c = r.ribbon.context;
  assert.equal(c.D.date, series.FPT.at(-1).date);
  assert.ok(c.W.date < series.FPT.at(-1).date, "tuần đang chạy không được dùng");
  assert.equal(c.W.ma200, null, "MA200 tuần để trống khi < 200 tuần");
  assert.ok(Math.abs(c.align) <= 3);
  assert.equal(r.ribbon.lines.D.dates.length, 260);
  assert.equal(calls.range.length, 0, "v3 không dùng khung 1 giờ");
  const st = r.structure.context;
  assert.ok(["S1", "S2", "S3", "S4", "NA"].includes(st.D.stage));
  assert.ok(st.W.date < series.FPT.at(-1).date);
  assert.ok(Array.isArray(st.trigger.steps) && st.trigger.steps.length === 2);
  assert.equal(r.structure.frames.D.segments.reduce((n, s) => n + s.bars, 0), 260);
  assert.ok(!r.elliott.error, r.elliott.error);
  assert.ok(["strong", "partial", "none"].includes(r.elliott.confluence));
  assert.ok(Array.isArray(r.bases.levels));
  assert.ok(["setup", "blocked", "wait"].includes(r.decision.state));
  assert.equal(r.decision.setups.length, 4);
  assert.equal(r.decision.gates.length, 4);
  for (const l of r.bases.levels) assert.equal(l.role, l.price < r.ribbon.context.D.close ? "support" : "resistance");
  await assert.rejects(svc.analyze3("??"), /không hợp lệ/);
});

test("dọn kho nến 1 giờ cũ (MTF v2): xoá thư mục h1/ một lần khi khởi tạo, giữ tệp tóm tắt; gọi lại không lỗi", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gq-structure-prune-"));
  fs.mkdirSync(path.join(dir, "h1"));
  for (const s of ["FPT", "HPG", "VCB"]) fs.writeFileSync(path.join(dir, "h1", `${s}.json.gz`), "x".repeat(100));
  fs.writeFileSync(path.join(dir, "summary.json.gz"), "keep");
  const d = createStructureDisk({ dir, log: { warn() {}, info() {} } });
  assert.equal(d.stats().prunedH1, 3);
  assert.equal(fs.existsSync(path.join(dir, "h1")), false);
  assert.equal(fs.existsSync(path.join(dir, "summary.json.gz")), true);
  assert.equal(pruneLegacyH1(dir, { info() {} }), 0);
  assert.equal(await d.writeJson("x", { a: 1 }), true);
  assert.deepEqual(await d.readJson("x"), { a: 1 });
});
