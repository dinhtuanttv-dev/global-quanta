// PZ-v2 — bảng Theo dõi chờ nền: cổng mua (mặc định tắt), gắn ngăn CORE / RUNNER / WAIT, dịch vụ khoá ảnh chụp theo phiên.
import test from "node:test";
import assert from "node:assert/strict";
import { buildHlPortfolio as buildRaw, HL_PF } from "../src/market/elite/eliteHl.js";
import { hlScores } from "../src/market/elite/confluence.js";
import { annotatePz, basesFromStrategies, createHlWatch, PZ_GATE, PZ_KV } from "../src/market/elite/hlWatch.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";

const buildHlPortfolio = (o) => buildRaw({ cfg: { ...HL_PF, guardMinShare: 0 }, ...o });
const TA2 = { sepa_state: 2, base_breakout: 3 };
function world() {
  const ids = Array.from({ length: 40 }, (_, i) => i);
  const panelRows = ids.map((i) => ({ ticker: `T${String(i).padStart(2, "0")}`, values: { ls_v1: i, ...(i >= 30 ? TA2 : {}), rrg_quadrant: 2 } }));
  const scores = ids.map((i) => ({ ticker: `T${String(i).padStart(2, "0")}`, Z: i / 10, rank: 40 - i, close: 20000, advBn: 50, sigma20: 0.02, sectorKey: `S${i % 5}`, alpha5Pct: 0.1, pOutperform: 0.5 }));
  return { panelRows, scores };
}
const rec = (state, extra = {}) => ({ state, from: extra.from ?? null, since: "2026-11-16", sessions: 1, lane: null, held: false, hotReasons: state === "EXTENDED" ? ["x2", "x3"] : [], missingVi: [],
  base: { source: "SEPA", pivot: 20000, stop: 18500, status: null }, measures: { close: 20000, x1: 0.01, risk: 0.075, x2: 1, x3: 0.05, x4: false, zoneLow: 19400, zoneHigh: 21000, depth: null, climax: false },
  rebase: null, hStar: null, ...extra });

test("cổng tắt (mặc định): danh mục, hàng chờ, thay đổi GIỐNG HỆT khi không có vị trí giá", () => {
  assert.equal(PZ_GATE, false, "giai đoạn hiện tại chỉ hiển thị");
  const w = world();
  const zoneBy = new Map(w.panelRows.map((r, i) => [r.ticker, i % 2 ? "EXTENDED" : "BUY_ZONE"]));
  const a = buildHlPortfolio({ ...w, prev: [], rebalance: true, date: "2026-11-16" });
  const b = buildHlPortfolio({ ...w, prev: [], rebalance: true, date: "2026-11-16", zoneBy, gate: false });
  assert.deepEqual(b, a);
});

test("cổng bật: chỉ mua mã ở Vùng mua; mã khác vào hàng chờ với lý do vị trí giá; ô trống là tiền mặt", () => {
  const w = world();
  const zoneBy = new Map([["T39", "EXTENDED"], ["T38", "BUY_ZONE"], ["T37", "IN_BASE"], ["T36", "BUY_ZONE"], ["T35", "NO_SETUP"]]);
  const d = buildHlPortfolio({ ...w, prev: [], rebalance: true, date: "2026-11-16", zoneBy, gate: true });
  assert.deepEqual(d.portfolio.map((x) => x.ticker).sort(), ["T36", "T38"]);
  const q = Object.fromEntries(d.hl.queue.map((x) => [x.ticker, x.code]));
  assert.equal(q.T39, "extended"); assert.equal(q.T37, "in_base"); assert.equal(q.T35, "no_setup");
  assert.match(d.hl.queue.find((x) => x.ticker === "T39").reasonVi, /quá vùng mua/);
  assert.ok(d.hl.cash > 0.7, "không lấy mã ngoài vùng mua cho đủ 10 -> tiền mặt");
});

test("gắn ngăn: mã đang giữ nóng -> Chạy lãi (vẫn trong vốn); mã chưa giữ nóng -> Chờ nền; tổng ba phần = 100%", () => {
  const w = world();
  const prev = [{ ticker: "T39", weight: 0.1, since: "2026-11-09" }, { ticker: "T38", weight: 0.1, since: "2026-11-09" }];
  const H = buildHlPortfolio({ ...w, prev, rebalance: true, date: "2026-11-16" });
  const records = { T39: rec("EXTENDED", { held: true, from: "BUY_ZONE" }), T38: rec("BUY_ZONE", { held: true }), T37: rec("COOLING", { from: "EXTENDED" }), T36: rec("REBASING", { from: "COOLING" }), T35: rec("EXTENDED", { from: "IN_BASE" }), T34: rec("IN_BASE") };
  const rows = hlScores(w.panelRows);
  const a = annotatePz(H, { version: "PZ-v2", date: "2026-11-16", records }, rows, { tradable: new Set(w.scores.map((x) => x.ticker)) });
  const by = Object.fromEntries(a.portfolio.map((x) => [x.ticker, x.hl.pz]));
  assert.equal(by.T39.lane, "RUNNER"); assert.equal(by.T38.lane, "CORE");
  assert.ok(a.portfolio.every((x) => x.weight === H.portfolio.find((y) => y.ticker === x.ticker).weight), "không đổi tỷ trọng");
  assert.deepEqual(a.portfolio.map((x) => x.ticker), H.portfolio.map((x) => x.ticker), "không thêm / bớt mã");
  // Mã mua mới phiên này mà đang nóng -> Chạy lãi + cờ mua ngoài vùng mua (khi cổng tắt).
  for (const x of a.portfolio.filter((x) => x.hl.status === "NEW" && ["EXTENDED", "COOLING", "REBASING"].includes(records[x.ticker]?.state))) {
    assert.equal(x.hl.pz.lane, "RUNNER"); assert.equal(x.hl.pz.boughtOutsideZone, true);
  }
  const watch = a.hl.watch;
  const lastHeld = watch.map((x) => x.held).lastIndexOf(true), firstWait = watch.findIndex((x) => !x.held);
  assert.ok(firstWait < 0 || firstWait > lastHeld, "nhóm Chạy lãi (đang giữ) đứng trước nhóm Chờ nền");
  assert.ok(watch.some((x) => x.ticker === "T39" && x.held));
  const heldOrder = watch.filter((x) => x.held).map((x) => x.pz.state);
  assert.deepEqual(heldOrder, [...heldOrder].sort((p, q) => ({ REBASING: 0, COOLING: 1, EXTENDED: 2 })[p] - ({ REBASING: 0, COOLING: 1, EXTENDED: 2 })[q]), "gần vùng mua nhất đứng trên");
  const waitTickers = watch.filter((x) => !x.held).map((x) => x.ticker);
  for (const t of waitTickers) assert.ok(!a.portfolio.some((x) => x.ticker === t));
  const sum = a.hl.pz.coreWeight + a.hl.pz.runnerWeight + a.hl.cash;
  assert.ok(Math.abs(sum - 1) < 1e-3, `Danh mục chính + Chạy lãi + Tiền mặt = 100% (${sum})`);
  assert.equal(a.hl.pz.gate, false); assert.match(a.hl.pz.modeVi, /chỉ hiển thị/);
  assert.deepEqual(a.hl.changes.toWatch.sort(), ["T35", "T39"]);
  assert.equal(a.hl.funnel.inZone, Object.entries(records).filter(([t, r]) => r.state === "BUY_ZONE" && rows.find((x) => x.ticker === t && (x.cls === "STRONG" || x.cls === "CONFLUENCE"))).length);
});

test("nền từ tài liệu chiến lược: chỉ nhận tài liệu CÙNG PHIÊN; SEPA thắng Base Breakout", () => {
  const sepa = { dataAsOf: "2026-11-13", results: [{ ticker: "AAA", status: "EXTENDED", metrics: { pivot: 100, stop: 92 } }] };
  const baseBreakout = { dataAsOf: "2026-11-13", results: [{ ticker: "AAA", status: "SETUP", metrics: { basePivot: 99, baseLow: 90 } }, { ticker: "BBB", metrics: { basePivot: 50, baseLow: 46 } }] };
  const same = basesFromStrategies({ sepa, baseBreakout }, "2026-11-13");
  assert.equal(same.bases.get("AAA").source, "SEPA"); assert.equal(same.bases.get("AAA").status, "EXTENDED");
  assert.equal(same.bases.get("BBB").source, "BASE_BREAKOUT");
  const lag = basesFromStrategies({ sepa, baseBreakout }, "2026-11-12");
  assert.equal(lag.bases.size, 0, "tài liệu chiến lược phiên 13/11 không dùng cho bảng phiên 12/11");
  assert.deepEqual(lag.sameSession, { sepa: false, baseBreakout: false });
});

// Chuỗi giá tổng hợp cho dịch vụ: T01 đi ngang (vùng mua theo hộp giá), T02 tăng vọt (tăng nóng), T03 có nến lỗi giá 0 ở phiên cuối.
const day = (i) => new Date(Date.UTC(2026, 0, 5) + i * 86_400_000).toISOString().slice(0, 10);
const series = (fn, n) => Array.from({ length: n }, (_, i) => { const c = fn(i); return { date: day(i), open: c, high: c * 1.004, low: c * 0.996, close: c, volume: 1e6 }; });
const BARS = {
  T01: series((i) => (i < 60 ? 80 * 1.004 ** i : 102 * (1 + 0.002 * Math.sin(i))), 90),
  T02: series((i) => (i < 82 ? 100 * (1 + 0.003 * Math.sin(i)) : 100 * 1.045 ** (i - 81)), 90),
  T03: [...series((i) => 50 + Math.sin(i), 89), { date: day(89), open: 0, high: 0, low: 0, close: 0, volume: 5e5 }],
};

test("dịch vụ: khoá ảnh chụp theo phiên, nhật ký chuyển trạng thái, nến lỗi giá 0 -> Chưa xác định", async () => {
  const store = createMemoryStore();
  const ohlcBars = async (tickers, to) => new Map(tickers.filter((t) => BARS[t]).map((t) => [t, BARS[t].filter((b) => b.date <= to)]));
  const svc = createHlWatch({ store, ohlcBars, now: () => Date.parse("2026-04-01T11:00:00Z"), log: { warn() {} } });
  const d1 = day(88), d2 = day(89);
  const s1 = await svc.run({ date: d1, tier1: new Set(["T01", "T02", "T03"]), held: new Set(["T01"]) });
  assert.equal(s1.records.T02.state, "EXTENDED"); assert.equal(s1.records.T02.lane, "WAIT");
  assert.equal(s1.records.T01.lane, "CORE");
  const again = await svc.run({ date: d1, tier1: new Set(), held: new Set() });
  assert.deepEqual(again, s1, "ảnh chụp đã khoá: chạy lại cùng phiên trả nguyên bản");
  const s2 = await svc.run({ date: d2, tier1: new Set(["T01", "T02", "T03"]), held: new Set(["T01"]) });
  assert.equal(s2.prevDate, d1);
  assert.equal(s2.records.T03.state, "UNKNOWN", "nến giá 0 bị loại -> giá mới tới phiên trước -> Chưa xác định");
  const log = (await store.getKv(PZ_KV.log)).value.entries;
  // Lần chạy đầu phát lại 40 phiên: T02 đã vào Tăng nóng TRƯỚC phiên d1 (trong phần phát lại) nên d1 không phải phiên chuyển trạng thái.
  assert.equal(s1.warmupSessions, 40); assert.equal(s2.warmupSessions, 0, "phiên sau có ảnh chụp phiên trước -> không phát lại");
  assert.equal(s1.records.T02.from, "EXTENDED");
  assert.ok(!log.some((e) => e.to === "UNKNOWN"), "Chưa xác định không ghi vào nhật ký chuyển");
  assert.deepEqual((await store.getKv(PZ_KV.index)).value.dates, [d1, d2]);
  assert.equal((await svc.snapshot()).date, d2);
});


test("route /hl/watch: tham số ngày hợp lệ được dùng; ngày sai dạng -> phiên mới nhất; nhật ký theo ngày", async () => {
  const express = (await import("express")).default;
  const { createEliteRouter } = await import("../src/routes/elite.js");
  const asked = [];
  const getHlWatch = () => ({ snapshot: async (d) => { asked.push(d); return { date: d ?? "latest" }; }, log: async (d) => [{ date: d }] });
  const app = express(); app.use("/api/elite", createEliteRouter({ getHlWatch, getPanel: () => null }));
  const server = app.listen(0), base = `http://127.0.0.1:${server.address().port}/api/elite`;
  try {
    assert.equal((await (await fetch(`${base}/hl/watch?date=2026-11-12`)).json()).date, "2026-11-12");
    assert.equal((await (await fetch(`${base}/hl/watch?date=12-11-2026`)).json()).date, "latest");
    assert.deepEqual((await (await fetch(`${base}/hl/watch/log?date=2026-11-13`)).json()).entries, [{ date: "2026-11-13" }]);
  } finally { server.close(); }
});
