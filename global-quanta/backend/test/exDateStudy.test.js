import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { cashExEvents, exAggregate, exEventMetrics, tickerSummary } from "../src/market/events/exDateStudy.js";
import { createEventStudyService } from "../src/market/fundamentals/eventStudyService.js";

const days = (n, start = "2025-01-01") => Array.from({ length: n }, (_, i) => new Date(Date.parse(`${start}T00:00:00Z`) + i * 864e5).toISOString().slice(0, 10));

test("LSK5 XD-v1: tỷ lệ giảm giá / cổ tức (giá chưa điều chỉnh, nghìn đồng), số phiên lấp khoảng, chờ đủ phiên", () => {
  const d = days(220);
  // giá 50 (nghìn); GDKHQ ngày 200: cổ tức 2.000 đ -> giá chưa điều chỉnh 48, rồi hồi về 50 sau 3 phiên
  const raw = d.map((_, i) => (i < 200 ? 50 : i < 203 ? 48 : 50));
  const rows = d.map((x, i) => [x, raw[i] * (i < 200 ? 0.96 : 1), 1e9, raw[i]]);
  const mkt = new Map(d.map((x) => [x, { close: 1000, val: 1e12 }]));
  const m = exEventMetrics(rows, mkt, d[200], 2000);
  assert.equal(m.dropRatio, 1); assert.equal(m.yieldCum, 0.04); assert.equal(m.fillDays, 3); assert.equal(m.pending, false);
  const short = exEventMetrics(rows.slice(0, 202), mkt, d[200], 2000);
  assert.equal(short.fillDays, null); assert.equal(short.pending, true); // chưa đủ phiên để biết đã lấp hay chưa
  assert.equal(exEventMetrics(rows.map((r) => [r[0], r[1], r[2], null]), mkt, d[200], 2000), null); // thiếu giá chưa điều chỉnh
  assert.equal(exEventMetrics(rows, mkt, d[0], 2000), null); // không có phiên trước GDKHQ
});

test("LSK5 chọn đợt: gộp tiền cùng ngày, bỏ đợt trùng cổ tức cổ phiếu / thưởng; tổng hợp theo nhóm lợi suất", () => {
  const ev = [{ cat: "CASH", ex: "2026-09-14", cash: 3000 }, { cat: "CASH", ex: "2026-09-14", cash: 5000 }, { cat: "CASH", ex: "2026-05-10", cash: 1000 }, { cat: "STOCK", ex: "2026-05-11" }, { cat: "CASH", ex: "2025-12-24", cash: 3000 }];
  assert.deepEqual(cashExEvents(ev), [{ ex: "2025-12-24", cash: 3000 }, { ex: "2026-09-14", cash: 8000 }]);
  const list = [{ dropRatio: 1, yieldCum: 0.02, fillDays: 2, pending: false }, { dropRatio: 0.8, yieldCum: 0.04, fillDays: null, pending: false }, { dropRatio: 1.2, yieldCum: 0.08, fillDays: 30, pending: false }, { dropRatio: 0.9, yieldCum: 0.02, fillDays: null, pending: true }];
  const a = exAggregate(list);
  assert.equal(a.all.n, 4); assert.equal(a.all.dropRatioMedian, 0.95);
  assert.equal(a.all.fillWithin20, 0.3333); // 1/3 đợt đã rõ (bỏ đợt đang chờ)
  assert.equal(a.byYield["<3%"].n, 2); assert.equal(a.byYield["≥6%"].n, 1);
  assert.equal(tickerSummary(list).fillDaysMedian, 16);
});

test("LSK5 dịch vụ: lưu giá chưa điều chỉnh (cột 4), file cũ 3 cột -> nạp lại; dựng ex-study.json.gz cùng job", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xd-"));
  fs.mkdirSync(path.join(dir, "px"), { recursive: true });
  fs.writeFileSync(path.join(dir, "AAA.json.gz"), zlib.gzipSync(JSON.stringify({ ticker: "AAA", quarters: [] })));
  fs.writeFileSync(path.join(dir, "px", "AAA.json.gz"), zlib.gzipSync(JSON.stringify({ rows: [["2025-01-01", 10, 1]] })));
  const d = days(230);
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); const mk = url.includes("vnmarket");
    return { ok: true, json: async () => ({ data: d.filter((x) => x >= (url.match(/gte:([0-9-]+)/)?.[1] ?? "")).map((x, i) => (mk ? { date: x, close: 1000, nmValue: 1e12 } : { date: x, adClose: 50, close: x >= d[200] ? 48 : 50, nmValue: 1e9 })) }) }; };
  const es = createEventStudyService({ dir, fetchImpl, since: d[0], log: { log() {} }, exEvents: () => [{ cat: "CASH", ex: d[200], cash: 2000 }] });
  await es.run({ disclosures: {} });
  const px = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, "px", "AAA.json.gz"))).toString()).rows;
  assert.equal(px[0].length, 4); assert.equal(px[0][0], d[0]); // nạp lại toàn bộ từ `since`
  const x = es.exDoc();
  assert.equal(x.events, 1); assert.equal(x.byTicker.AAA.n, 1); assert.equal(x.byTicker.AAA.events[0].dropRatio, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});
