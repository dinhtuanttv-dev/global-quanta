// I0 (19/11/2026) — nền dữ liệu cho chương trình "Tác động lên cổ phiếu": chấm sổ xúc tác theo X6, kho lưu trữ Event Radar, vũ trụ đúng thời điểm.
process.env.MARKET_ALERTS_ENABLED = "false";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { addWeekdays, contextOf, createLedgerEvaluator, CONTEXT_KEY, EVAL_KEY, LEDGER_KEY } from "../src/market/catalystLedger/ledgerEvaluator.js";
import { createEventRadarRepository } from "../src/market/news/eventRadarRepository.js";
import { createEventArchive } from "../src/market/news/eventArchive.js";
import { universeAt } from "../src/market/research/universeAt.js";

const sessions = (from, n) => { const out = []; let d = from; while (out.length < n) { const wd = new Date(`${d}T00:00:00Z`).getUTCDay(); if (wd && wd !== 6) out.push(d); d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10); } return out; };

test("chấm sổ xúc tác: t0 và AR đúng giao thức X6, ngữ cảnh lấy một lần, ghi KHOÁ RIÊNG (không đụng khoá ledger)", async () => {
  const days = sessions("2026-10-26", 30);
  const idx = days.map((date, i) => ({ date, close: 1000 * Math.exp(0.001 * i) }));
  const stock = days.map((date, i) => ({ date, close: 50 * Math.exp(0.003 * i) }));
  const kv = new Map([[LEDGER_KEY, {
    a: { id: "a", ticker: "HPG", direction: "benefit", category: "contract", sourceId: "evt_1", scannedAt: "2026-10-30T23:05:49Z" }, // VN 31/10 (thứ Bảy) -> t0 = phiên đầu tiên >= 31/10 = thứ Hai 02/11
    b: { id: "b", ticker: "ZZZ", direction: "harm", category: "insider", sourceId: "evt_2", scannedAt: "2026-11-02T03:00:00Z" },
  }]]);
  const ledgerBefore = JSON.stringify(kv.get(LEDGER_KEY));
  let radarCalls = 0;
  const ev = createLedgerEvaluator({
    kvGet: async (k) => kv.get(k) ?? null, kvSet: async (k, v) => { kv.set(k, structuredClone(v)); },
    getBars: async (s) => (s === "VNINDEX" ? idx : s === "HPG" ? stock : []),
    getRadarEvent: async (id) => { radarCalls++; return id === "evt_1" ? { eventType: "contract_award", severity: "high", severityScore: 3, corroborationCount: 2, publishedAt: "2026-10-30T22:00:00Z", firstSeenAt: "2026-10-30T22:10:00Z", classifierVersion: "v3", title: "không lưu" } : null; },
    now: () => Date.parse("2026-11-28T10:00:00Z"), log: { log() {} },
  });
  const meta = await ev.run();
  assert.equal(meta.scored, 1); assert.equal(meta.noPrice, 1);
  const e = kv.get(EVAL_KEY).a;
  assert.equal(e.t0, "2026-11-02");
  const i0 = days.indexOf("2026-11-02");
  const expect20 = Math.log(stock[i0 + 20].close / stock[i0].close) - Math.log(idx[i0 + 20].close / idx[i0].close);
  assert.ok(Math.abs(e.ar20 - expect20) < 1e-12);
  assert.deepEqual(Object.keys(kv.get(CONTEXT_KEY).a).filter((k) => k !== "capturedAt").sort(), ["classifierVersion", "corroborationCount", "entityConfidence", "eventType", "firstSeenAt", "publishedAt", "sentiment", "severity", "severityScore", "sourceAuthority"]);
  assert.equal(kv.get(CONTEXT_KEY).b, null);
  assert.equal(JSON.stringify(kv.get(LEDGER_KEY)), ledgerBefore, "khoá ledger của tác vụ quét không bị ghi");
  await ev.run();
  assert.equal(radarCalls, 2, "ngữ cảnh chỉ lấy một lần cho mỗi bản ghi");
  // sổ bịt mắt: tiến độ chỉ có số đếm
  const p = await ev.progress();
  assert.equal(p.blind, true); assert.equal(p.signals, 2); assert.equal(p.matured20, 1); assert.equal(p.withContext, 1);
  assert.ok(!JSON.stringify(p).match(/ar5|ar20|sar|mean/i), "không lộ lợi suất");
  assert.equal(addWeekdays("2026-11-20", 1), "2026-11-23");
  assert.equal(contextOf(null), null);
});

test("kho lưu trữ Event Radar: chuyển bản sửa cũ của sự kiện đã rời danh sách sang tệp nén theo tháng, đọc lại đủ; sự kiện đang hiển thị không bị đụng", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "er-"));
  const repo = createEventRadarRepository({ dataDir: dir });
  const ev = (id, at) => ({ event_id: id, first_seen_at: at, content_hash: id, payload: { eventId: id } });
  const rev = (id, at) => ({ revision_id: `${id}:00000001`, event_id: id, content_hash: id, observed_at: at, payload: { eventId: id, title: `t-${id}` } });
  await repo.saveBatch({ events: [ev("old", "2026-09-01T00:00:00Z"), ev("live", "2026-11-18T00:00:00Z")], revisions: [rev("old", "2026-09-01T01:00:00Z"), rev("gone", "2026-09-15T01:00:00Z"), rev("live", "2026-09-02T00:00:00Z")], retain: 1 });
  // retain 1 -> chỉ "live" còn trong danh sách
  const arch = createEventArchive({ repository: repo, now: () => Date.parse("2026-11-19T00:00:00Z"), log: { log() {}, warn() {} } });
  const r = await arch.rotate();
  assert.equal(r.archived, 2);
  assert.deepEqual(r.months, ["2026-09"]);
  const back = await arch.read({ from: "2026-09-01", to: "2026-09-30T23:59:59Z" });
  assert.deepEqual(back.map((x) => x.event_id).sort(), ["gone", "old"]);
  assert.equal(back[0].payload.title.startsWith("t-"), true, "giữ nguyên nội dung đầy đủ");
  assert.equal((await repo.listRevisions("live")).rows.length, 1, "bản sửa của sự kiện đang hiển thị vẫn trong sổ");
  assert.deepEqual(await arch.rotate(), { archived: 0, cutoff: "2026-10-20T00:00:00.000Z" });
  // ghi kho lỗi -> trả lại bản sửa vào sổ
  const repo2 = createEventRadarRepository({ dataDir: await mkdtemp(path.join(tmpdir(), "er2-")) });
  await repo2.saveBatch({ events: [], revisions: [rev("x", "2026-09-03T00:00:00Z")], retain: 10 });
  const blocker = path.join(dir, "blocker"); await writeFile(blocker, "file, không phải thư mục");
  const bad = createEventArchive({ repository: repo2, dir: path.join(blocker, "sub"), now: () => Date.parse("2026-11-19T00:00:00Z"), log: { log() {}, warn() {} } });
  await assert.rejects(bad.rotate());
  assert.equal((await repo2.listRevisions("x")).rows.length, 1, "không mất dữ liệu khi ghi kho lỗi");
});

test("vũ trụ đúng thời điểm: mã đã huỷ niêm yết có mặt trước ngày huỷ; mã niêm yết sau chưa có; lọc thanh khoản, số phiên, mã tạm ngừng", () => {
  const ds = sessions("2015-01-05", 400);
  const mk = (val, until = ds.length) => ({ dates: ds.slice(0, until), values: ds.slice(0, until).map(() => val) });
  const data = {
    listings: [
      { code: "OLD", listedDate: "2010-01-01", delistedDate: "2016-03-01" },
      { code: "BIG", listedDate: "2010-01-01" },
      { code: "THIN", listedDate: "2010-01-01" },
      { code: "NEW", listedDate: "2016-01-04" },
      { code: "HALT", listedDate: "2010-01-01" },
    ],
    series: new Map([["OLD", mk(3e9)], ["BIG", mk(20e9)], ["THIN", mk(2e8)], ["NEW", mk(5e9)], ["HALT", mk(5e9, 200)]]),
  };
  const at = (d) => universeAt(d, data).map((x) => x.code);
  assert.ok(at("2015-08-03").includes("OLD"), "mã sau này bị huỷ vẫn có mặt trước ngày huỷ");
  assert.ok(!at("2016-06-01").includes("OLD"), "sau ngày huỷ thì không còn");
  assert.ok(!at("2015-08-03").includes("NEW"), "chưa niêm yết thì chưa có");
  assert.ok(!at("2015-08-03").includes("THIN"), "dưới ngưỡng GTGD 1 tỷ");
  assert.ok(!at("2015-03-02").includes("BIG"), "chưa đủ 120 phiên");
  assert.ok(!at("2016-06-01").includes("HALT"), "đang tạm ngừng (phiên cuối quá 10 ngày)");
  assert.equal(at("2015-08-03")[0], "BIG", "xếp theo GTGD giảm dần");
});
