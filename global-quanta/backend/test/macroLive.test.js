// MV-L1 (27/11/2026): /api/macro/live — trạng thái công bố (quá hạn) + điểm ngày "hiện tại" chỉ để hiển thị.
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createMacroService, MACRO_KV_KEY } from "../src/market/macro/macroService.js";
import { fetchLivePoints, parseYahooDaily, withVsClose } from "../src/market/macro/macroLive.js";
import { createMacroRouter } from "../src/routes/macro.js";

const memKv = () => {
  const m = new Map();
  return { m, getKv: async (k) => (m.has(k) ? { value: structuredClone(m.get(k)), updatedAt: "t" } : null), setKv: async (k, v) => void m.set(k, structuredClone(v)) };
};
const NOW = Date.parse("2026-11-27T05:00:00Z"); // 12:00 giờ VN 27/11/2026

test("parseYahooDaily: bỏ ô null, ngày theo múi giờ sàn", () => {
  const json = { chart: { result: [{ meta: { gmtoffset: -18000 }, timestamp: [Date.parse("2026-11-26T05:00:00Z") / 1000, Date.parse("2026-11-27T05:00:00Z") / 1000], indicators: { quote: [{ close: [99.5, null] }] } }] } };
  assert.deepEqual(parseYahooDaily(json), [{ date: "2026-11-26", value: 99.5 }]);
});

test("withVsClose: chỉ ghép khi điểm ngày MỚI HƠN cuối tháng đã đóng; lỗi -> null", () => {
  const closed = { period: "2026-10", value: 120 };
  assert.equal(withVsClose({ date: "2026-10-31", value: 118 }, closed), null);
  const r = withVsClose({ date: "2026-11-24", value: 90, source: "x" }, closed);
  assert.equal(r.closedPeriod, "2026-10");
  assert.ok(Math.abs(r.vsClosePct - -25) < 1e-9);
  assert.equal(withVsClose({ error: "lỗi" }, closed), null);
});

test("fetchLivePoints: FRED + Yahoo + lịch sử HOSE; lỗi một nguồn không chặn nguồn khác", async () => {
  const fetchImpl = async (url) => {
    if (url.includes("fredgraph")) return { ok: true, status: 200, text: async () => "observation_date,DCOILBRENTEU\n2026-11-20,92.5\n2026-11-24,.\n2026-11-25,91.2\n" };
    if (url.includes("DX-Y.NYB")) throw new Error("mất mạng");
    return { ok: true, status: 200, text: async () => JSON.stringify({ chart: { result: [{ meta: { gmtoffset: 25200 }, timestamp: [Date.parse("2026-11-26T03:00:00Z") / 1000], indicators: { quote: [{ close: [25410] }] } }] } }) };
  };
  const history = { get: async () => ({ bars: [{ date: "2026-11-26", close: 1630.2 }, { date: "2026-11-27", close: 1643.5 }] }) };
  const pts = await fetchLivePoints({ fetchImpl, history, todayIso: "2026-11-27" });
  assert.deepEqual([pts.OIL.date, pts.OIL.value], ["2026-11-25", 91.2]);
  assert.deepEqual([pts.EX.date, pts.EX.value], ["2026-11-26", 25410]);
  assert.match(pts.DXY.error, /mất mạng/);
  assert.deepEqual([pts.VNINDEX.date, pts.VNINDEX.value], ["2026-11-27", 1643.5]);
});

test("service.live + GET /api/macro/live: CPI quá hạn (kỳ 2026-10 dự kiến 06/11) có cảnh báo; OIL có 'hiện tại' so cuối tháng 10", async () => {
  const kv = memKv();
  kv.m.set(MACRO_KV_KEY, { observations: [
    { seriesId: "CPI", period: "2026-09", value: 5.08, asOf: "2026-10-06", source: "IMF:CPI VNM (TCTK)" },
    { seriesId: "OIL", period: "2026-10", value: 120.15, asOf: "2026-11-01", source: "FRED:DCOILBRENTEU" },
  ] });
  const warns = [];
  const svc = createMacroService({ globalFeeds: null, store: kv, inline: true, now: () => NOW, log: { warn: (m) => warns.push(m) },
    liveFeeds: async () => ({ OIL: { date: "2026-11-24", value: 92.81, source: "FRED" }, DXY: { error: "x", source: "Yahoo" } }) });
  const body = await svc.live();
  assert.equal(body.series.CPI.overdue, true);
  assert.equal(body.series.CPI.release.nextPeriod, "2026-10");
  assert.ok(body.series.CPI.release.overdueDays > 7);
  assert.equal(body.series.CPI.live, null);
  assert.equal(body.series.OIL.overdue, false);
  assert.equal(body.series.OIL.live.closedPeriod, "2026-10");
  assert.ok(Math.abs(body.series.OIL.live.vsClosePct - (92.81 / 120.15 - 1) * 100) < 1e-9);
  assert.equal(body.series.DXY.liveError, "x");
  assert.deepEqual(body.overdue.map((o) => o.id), ["CPI"]);
  assert.equal(warns.filter((w) => /CPI quá hạn/.test(w)).length, 1);
  await svc.live(); // bộ đệm + chỉ cảnh báo một lần mỗi ngày
  assert.equal(warns.filter((w) => /CPI quá hạn/.test(w)).length, 1);

  const app = express();
  app.use("/api/macro", createMacroRouter({ getService: () => svc }));
  const server = app.listen(0);
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/macro/live`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).series.CPI.overdue, true);
  } finally { server.close(); }
});
