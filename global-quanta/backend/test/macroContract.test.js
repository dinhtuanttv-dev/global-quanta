// V6 (19/11/2026) — Hợp đồng JSON của /api/macro/*: mọi khoá mà giao diện, bản tin AI, chat và Kết nối thế giới đang đọc phải còn.
// Thêm khoá thì được; xoá/đổi tên khoá đang dùng -> test đỏ. Dữ liệu: số liệu thật đo ở production 19/11/2026 (fixture).
process.env.MARKET_ALERTS_ENABLED = "false";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import express from "express";
import { createMacroService, MACRO_KV_KEY } from "../src/market/macro/macroService.js";
import { createMacroRouter } from "../src/routes/macro.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";

const FX = JSON.parse(readFileSync(new URL("./fixtures/macro-series-2026-11-19.json", import.meta.url), "utf8")).series;
const next = (p) => { const [y, m] = p.split("-").map(Number); return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`; };

async function app() {
  const store = createMemoryStore();
  const observations = Object.entries(FX).flatMap(([seriesId, pts]) => pts.filter(([, v]) => v > 0 && v < 50_000 && v > 5).map(([period, value]) => ({ seriesId, period, value, asOf: next(period), source: "fixture" })));
  await store.setKv(MACRO_KV_KEY, { observations });
  const svc = createMacroService({ store, history: null, globalFeeds: null, inline: true, now: () => Date.parse("2026-11-19T03:00:00Z"), log: { warn() {} } });
  const a = express();
  a.use(express.json());
  a.use("/api/macro", createMacroRouter({ getService: () => svc }));
  const srv = a.listen(0);
  return { base: `http://127.0.0.1:${srv.address().port}/api/macro`, close: () => { srv.close(); svc.close(); } };
}
const has = (obj, keys, where) => { for (const k of keys) assert.ok(obj && k in obj, `${where}: thiếu khoá "${k}"`); };

test("hợp đồng /source, /series, /catalyst-events, /alerts, /calendar, /report: đủ khoá đang được dùng", async () => {
  const s = await app();
  try {
    const src = await (await fetch(`${s.base}/source`)).json();
    // MacroHub, DataSourcePanel (V0 quarantined, V1 vintages/conflicts/release, V3 lastRefresh)
    has(src, ["mode", "series", "usableFactors", "usableTargets", "staleSeries", "minMonths", "realObservations", "bySource", "quarantined", "vintages", "conflicts", "lastRefresh"], "/source");
    has(src.series[0], ["id", "nameVi", "role", "n", "first", "last", "stale", "sources", "release"], "/source.series[]");

    const ser = await (await fetch(`${s.base}/series?tail=3`)).json();
    // MacroPulse (tail), bản tin AI vnBriefEvidence (tail=3)
    has(ser, ["asOf", "series"], "/series");
    const vni = ser.series.find((x) => x.id === "VNINDEX");
    has(vni, ["id", "nameVi", "role", "kind", "unit", "source", "n", "first", "last", "issues", "points"], "/series.series[]");
    has(vni.points[0], ["period", "value"], "/series.points[]");

    const ce = await (await fetch(`${s.base}/catalyst-events?horizonDays=60`)).json();
    // MacroUpcoming, MacroCalendarPanel, công cụ chat macro_catalyst_calendar
    has(ce, ["mode", "asOf", "caveat", "events", "fomcCoverage"], "/catalyst-events");
    has(ce.events.find((e) => e.kind === "fomc"), ["id", "kind", "title", "date", "daysRemaining", "country", "estimated", "evidence"], "/catalyst-events.events[]");

    for (const [path, keys] of [["alerts", ["asOf", "alerts"]], ["calendar", ["asOf", "releases"]], ["report", ["asOf", "markdown"]]]) {
      const r = await fetch(`${s.base}/${path}`);
      assert.equal(r.status, 200, `/${path} HTTP ${r.status}`);
      has(await r.json(), keys, `/${path}`);
    }
  } finally { s.close(); }
});

test("hợp đồng POST /score (Kết nối thế giới gọi trong tiến trình): khoá + MacroScore luôn CHỈ THAM KHẢO", async () => {
  const s = await app();
  try {
    const r = await fetch(`${s.base}/score`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ target: "VNINDEX", lag: 1 }) });
    assert.equal(r.status, 200);
    const b = await r.json();
    has(b, ["target", "lag", "factors", "thermometer", "series", "backtest", "usableForDecisions", "gateNote", "evidence"], "/score");
    assert.equal(b.usableForDecisions, false);
    assert.equal(b.evidence, "REFERENCE_ONLY");
  } finally { s.close(); }
});

test("chế độ thiếu biến (không có CPI/IR/M2) -> 422 có thông báo, không 500", async () => {
  const s = await app();
  try {
    const r = await fetch(`${s.base}/regime`);
    assert.equal(r.status, 422);
    assert.match((await r.json()).error, /IR, CPI, M2|Chưa đủ dữ liệu/);
  } finally { s.close(); }
});
