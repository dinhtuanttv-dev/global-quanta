// Cấu trúc đa khung (T4) — dịch vụ Gateway với SSI / ta-series giả lập: ghim chú thích đúng nến, kho nến 1 giờ trên đĩa
// (phiên đã đóng chỉ tải một lần), job tóm tắt toàn universe ghi đĩa + KV (KV lỗi không làm hỏng job).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStructureService, h1FromCache, summaryRow } from "../src/market/structure/structureService.js";
import { createH1Cache } from "../src/market/structure/h1Cache.js";
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
  const svc = createStructureService({ service, taSeries, corporateActions: null, now: () => NOW, h1Cache: createH1Cache({ dir, log: { warn() {} } }), seriesSource });
  return { svc, calls, dir, series };
}

test("phân tích đa khung: đủ W/D/H1, chú thích ghim vào ngày có thật của khung tương ứng, kịch bản + bằng chứng", async () => {
  const { svc, series } = fixture();
  const r = await svc.analyze("FPT");
  assert.ok(r.tfs.W && r.tfs.D && r.tfs.H1);
  assert.equal(r.dataSource.daily.priceBasis, "ADJUSTED_CUMULATIVE");
  assert.equal(r.tfs.D.asOf, "2026-10-21");
  assert.equal(r.tfs.H1.asOf, "2026-10-21 14:00");
  const dDates = new Set(series.FPT.map((b) => b.date));
  for (const a of r.annotations.filter((x) => x.tf === "D")) assert.ok(dDates.has(a.date), a.date);
  for (const a of r.annotations.filter((x) => x.tf === "H1")) assert.match(a.date, /^\d{4}-\d{2}-\d{2} (09|10|11|13|14):00$/);
  assert.equal(r.scenarios.length, 2);
  assert.ok(["MUA", "CHỜ MUA", "ĐỨNG NGOÀI", "GIẢM TỶ TRỌNG", "BÁN"].includes(r.align.verdict));
  assert.equal(r.evidence.status, "DONE");
  assert.equal(r.cone, null, "nón dự báo không đạt kiểm định -> không trả");
  assert.match(r.evidence.coneNote, /KHÔNG đạt/);
  assert.equal(r.probability.value, null);
  assert.equal(r.stageOdds.label, "ĐÃ KIỂM ĐỊNH");
  assert.ok(r.stageOdds.up >= 0 && r.stageOdds.up <= 1 && r.stageOdds.down >= 0 && r.stageOdds.down <= 1);
  assert.equal(r.evidence.labels.alignment, "THỰC NGHIỆM");
  assert.ok(r.narrative.some((x) => x.startsWith("Kết luận")));
  assert.ok(r.dayContextOnH1.length >= 1);
});

test("kho nến 1 giờ: phiên đã đóng chỉ tải SSI một lần, lần sau đọc đĩa (kể cả tiến trình mới)", async () => {
  const f = fixture();
  await f.svc.analyze("FPT");
  assert.equal(f.calls.range.length, 1);
  await f.svc.analyze("FPT");
  assert.equal(f.calls.range.length, 1, "lần 2 không gọi SSI");
  const again = createH1Cache({ dir: f.dir, log: { warn() {} } });
  const days = await again.get("FPT");
  assert.equal(Object.keys(days).length, 120);
  assert.equal(days["2026-10-21"].length, 5);
});

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
});

test("v2: nhãn bằng chứng V1–V5, kết luận chưa kiểm định -> verdictValidated = false; có thống kê lịch sử theo giai đoạn", async () => {
  const { svc } = fixture();
  const r = await svc.analyze("FPT");
  assert.equal(r.version, "2.0.0");
  assert.equal(r.evidence.verdictValidated, false);
  for (const k of ["alignment", "rrGate", "entryDaily", "stageB", "sellSignal"]) assert.ok(k in r.evidence.labels, k);
  assert.ok(r.evidence.history.stageTable.B.OOS.n > 0);
  assert.ok(Array.isArray(r.evidence.history.stageTable.B.OOS.ci));
  assert.equal(r.evidence.previous.engine, "1.0.0");
  assert.ok("ext" in r && "rrNow" in r);
});

test("P2: job warmStructureH1 làm ấm kho nến 1 giờ cho rổ VN100 + VN30 (tải theo tháng, không phiên đang chạy); job quét dùng khung 1 giờ", async () => {
  const f = fixture();
  const w = await f.svc.jobs.warmStructureH1();
  assert.equal(w.symbols, 2);
  assert.equal(w.warm, 2);
  assert.equal(w.fetchedSessions, 240);
  assert.ok(f.calls.range.length >= 2 * 6, "tải theo từng tháng");
  assert.equal(f.calls.live, 0);
  const again = await f.svc.jobs.warmStructureH1();
  assert.equal(again.fetchedSessions, 0, "lần sau chỉ tải phiên còn thiếu");
  const out = await f.svc.jobs.scanStructure();
  assert.equal(out.withH1, 2);
  const doc = await f.svc.summary();
  assert.ok(doc.rows.every((r) => r.hs), "dòng tóm tắt có giai đoạn khung 1 giờ");
});

test("h1FromCache: neo nến 1 giờ danh nghĩa theo đóng cửa ngày (điều chỉnh), bỏ phiên không có trong chuỗi ngày", () => {
  const days = { "2026-10-20": [{ date: "2026-10-20 09:00", open: 10, high: 11, low: 9, close: 10, volume: 1 }, { date: "2026-10-20 14:00", open: 10, high: 10, low: 10, close: 20, volume: 1 }],
    "2026-10-21": [{ date: "2026-10-21 09:00", open: 5, high: 5, low: 5, close: 5, volume: 1 }] };
  const out = h1FromCache(days, [{ date: "2026-10-20", close: 10 }]);
  assert.equal(out.length, 2);
  assert.equal(out[1].close, 10);
  assert.equal(out[0].open, 5);
});

test("MTF v3 S1 (/structure3): Ngày · Tuần · Tháng từ cùng chuỗi nến ngày, không tải nến phút, khung lớn chỉ dùng kỳ đã đóng", async () => {
  const { svc, calls, series } = fixture();
  const r = await svc.analyze3("FPT");
  assert.match(r.version, /^3\./);
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
