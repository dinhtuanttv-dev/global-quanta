import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { LEDGER_TABLE, ledgerRows, liveTracking, recordSignals, signalId } from "../src/market/strategies/signalTracking.js";
import { bootstrapCi, byHalfYear, evidenceFromTrades, welchT } from "../src/market/strategies/vnBacktest.js";

const doc = (strategy, results) => ({ strategy, engine: "screener-v2/S6", market: { up: false }, results });
const res = (ticker, status, extra = {}) => ({ ticker, status, date: "2026-10-08", grade: "B", metrics: { score: 61, pivot: 100 }, plan: { entry: 99, stop: 95, target: 119 }, ...extra });

test("sổ cái: mỗi tín hiệu một dòng SCR_*, mua (direction 1), kèm kế hoạch; ghi idempotent", async () => {
  const docs = { camslim: doc("camslim", [res("HDB", "SETUP", { handle: { handleAtConfluence: true } })]), "base-breakout": doc("base-breakout", [res("PLX", "BREAKOUT")]) };
  const rows = ledgerRows(docs);
  assert.deepEqual(rows.map((r) => `${r.symbol}:${r.signal}`), ["HDB:SCR_CS_SETUP", "PLX:SCR_BB_BO"]);
  assert.equal(rows[0].direction, 1);
  assert.deepEqual([rows[0].features.entry, rows[0].features.stop, rows[0].features.handleAtConfluence, rows[0].features.marketUp], [99, 95, true, false]);
  const store = createMemoryStore();
  assert.equal(await recordSignals(store, docs), 2);
  await recordSignals(store, docs);
  assert.equal((await store.selectRows(LEDGER_TABLE)).length, 2, "ghi lại cùng phiên không nhân đôi");
});

test("hiệu suất thực tế đọc từ research:performance (regime ALL), tách BREAKOUT / SETUP", () => {
  const perf = { generatedAt: "2026-10-20T10:00:00Z", rows: [
    { signal: signalId("camslim", "BREAKOUT"), regime: "ALL", horizon: 5, n: 12, hitRate: 0.58, baseline: 0.5, hitLow: 0.32, hitHigh: 0.8, zHitClustered: 0.6, verdict: "insufficient" },
    { signal: signalId("camslim", "BREAKOUT"), regime: "UNKNOWN", horizon: 5, n: 12 },
    { signal: "STEALTH_5", regime: "ALL", horizon: 5, n: 999 },
  ] };
  const t = liveTracking(perf, "camslim");
  assert.equal(t.breakout.h5.n, 12);
  assert.equal(t.breakout.h5.verdict, "insufficient");
  assert.equal(t.breakout.h3, null);
  assert.equal(t.setup.h5, null);
  assert.equal(liveTracking(null, "base-breakout").breakout.h5, null);
});

test("bootstrap theo ngày vào lệnh: KTC chứa trung bình mẫu, lặp lại được; Welch t; nửa năm", () => {
  const trades = Array.from({ length: 60 }, (_, i) => ({ entryDate: `2025-${String(1 + (i % 12)).padStart(2, "0")}-1${i % 9}`, exitDate: "2026-01-01", netPct: (i % 5) - 1, R: 0, bars: 5, reason: "TIME" }));
  const ci = bootstrapCi(trades);
  const mean = trades.reduce((a, x) => a + x.netPct, 0) / trades.length;
  assert.ok(ci.mean[0] <= mean && mean <= ci.mean[1]);
  assert.deepEqual(bootstrapCi(trades), ci, "hạt giống cố định");
  assert.equal(bootstrapCi(trades.slice(0, 5)), null, "< 10 lệnh");
  assert.ok(welchT([3, 4, 5, 6], [0, 1, 0, 1]) > 3);
  const p = byHalfYear(trades);
  assert.deepEqual(p.map((x) => x.period), ["H1/2025", "H2/2025"]);
  assert.equal(p[0].n + p[1].n, 60);
});

test("VALIDATED đòi thêm cận dưới KTC 95% ngoài mẫu > 0; ghi số cấu hình đã thử", () => {
  const mk = (date, v) => ({ entryDate: date, exitDate: date, netPct: v, R: v / 5, bars: 5, reason: "TIME" });
  const good = [];
  for (let d = 1; d <= 28; d++) for (const v of [6, 4, -2]) good.push(mk(`2026-0${d <= 14 ? 8 : 9}-${String(((d - 1) % 14) + 10).padStart(2, "0")}`, v));
  const inS = Array.from({ length: 40 }, (_, i) => mk(`2025-0${1 + (i % 9)}-15`, i % 2 ? 3 : -1));
  const base = [{ date: "2026-08-20", netPct: 0 }, { date: "2026-09-20", netPct: 0.2 }];
  const e = evidenceFromTrades([...inS, ...good], base, { first: "2025-01-01", last: "2026-10-01", trials: 26 });
  assert.equal(e.label, "VALIDATED");
  assert.ok(e.validation.ciOutOfSample.mean[0] > 0);
  assert.equal(e.validation.trials, 26);
  // TB +1%, PF 1,25 nhưng chỉ do 2 ngày trái ngược -> KTC 95% chứa 0 -> EXPERIMENTAL
  const twoDays = [...Array.from({ length: 15 }, () => mk("2026-08-20", 10)), ...Array.from({ length: 15 }, () => mk("2026-09-21", -8))];
  const e2 = evidenceFromTrades([...inS, ...twoDays], base, { first: "2025-01-01", last: "2026-10-01" });
  assert.ok(e2.outOfSample.avgNetPct > 0 && e2.outOfSample.profitFactor >= 1.1);
  assert.ok(e2.validation.ciOutOfSample.mean[0] < 0);
  assert.equal(e2.label, "EXPERIMENTAL");
});
