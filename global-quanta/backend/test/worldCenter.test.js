import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  REAL_WORLD_EVENTS, SECTOR_BASKETS, alignForeignReturns, equalWeightReturns, firstFullIndex, monthlyIndexFromReturns,
} from "../src/market/world/worldData.js";
import { createWorldCore, screenEvents, worldCoverage, worldSignalFromScore } from "../src/market/world/worldCore.js";
import { WORLD_KV_KEY, createWorldService } from "../src/market/world/worldService.js";
import { createWorldRouter } from "../src/routes/world.js";

// KV giả CÙNG hợp đồng với kho Gateway (memoryStore/supabaseStore): getKv trả { value, updatedAt }; m giữ giá trị thô để kiểm tra
const memKv = () => {
  const m = new Map();
  return { m, getKv: async (k) => (m.has(k) ? { value: structuredClone(m.get(k)), updatedAt: "t" } : null), setKv: async (k, v) => void m.set(k, structuredClone(v)) };
};
const NOW = Date.parse("2026-10-16T03:00:00Z");

/** Ngày giao dịch giả lập (thứ 2–6) từ một ngày bắt đầu. */
function weekdays(start, n) {
  const out = [];
  const d = new Date(`${start}T00:00:00Z`);
  while (out.length < n) {
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
const rng = (seed) => {
  let x = seed >>> 0;
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 2 ** 32) - 0.5;
};

test("alignForeignReturns: sàn Mỹ lấy phiên NGÀY TRƯỚC (lag1), sàn châu Á cùng ngày; thiếu giá -> 0", () => {
  const days = ["2026-01-05", "2026-01-06", "2026-01-07"];
  const bars = [{ date: "2026-01-02", close: 100 }, { date: "2026-01-05", close: 110 }, { date: "2026-01-06", close: 121 }];
  assert.deepEqual(alignForeignReturns(days, bars).ret, [0, 10, 0]);
  // lag1: phiên VN 06/01 thấy giá Mỹ 05/01 (110) so với 02/01 (100)
  assert.deepEqual(alignForeignReturns(days, bars, { lag1: true }).ret, [0, 10, 10]);
});

test("equalWeightReturns + firstFullIndex + chỉ số tháng: trung bình các mã có giá ở cả 2 phiên; chỉ tháng đã đóng", () => {
  const days = ["2026-08-28", "2026-08-31", "2026-09-01", "2026-09-30", "2026-10-01"];
  const A = [{ date: "2026-08-28", close: 10 }, { date: "2026-08-31", close: 11 }, { date: "2026-09-01", close: 11 }, { date: "2026-09-30", close: 12.1 }, { date: "2026-10-01", close: 12.1 }];
  const B = [{ date: "2026-08-31", close: 20 }, { date: "2026-09-01", close: 22 }, { date: "2026-09-30", close: 22 }, { date: "2026-10-01", close: 22 }];
  const ew = equalWeightReturns(days, { A, B });
  assert.deepEqual(ew.members, [0, 1, 2, 2, 2]);
  assert.deepEqual(ew.ret, [0, 10, 5, 5, 0]);
  assert.equal(firstFullIndex(ew.members), 2);
  const m = monthlyIndexFromReturns(days, ew.ret, "2026-10-16", { startIndex: 2 });
  assert.deepEqual(m.map((x) => x.period), ["2026-09"]);
  assert.equal(m[0].value, 105);
  assert.equal(m[0].asOf, "2026-10-01");
});

test("Sự kiện thật: mọi bản ghi qua validator của gói; FOMC đúng giờ 14:00 ET theo mùa", () => {
  const { accepted, rejected } = screenEvents(REAL_WORLD_EVENTS);
  assert.deepEqual(rejected, []);
  assert.equal(accepted.length, REAL_WORLD_EVENTS.length);
  const byId = Object.fromEntries(REAL_WORLD_EVENTS.map((e) => [e.id, e]));
  assert.equal(byId["fomc-2025-12-10"].tsUtc, "2025-12-10T19:00:00Z"); // EST
  assert.equal(byId["fomc-2025-09-17"].tsUtc, "2025-09-17T18:00:00Z"); // EDT
  assert.equal(byId["us-tariff-2025-04-02"].polarityHint, -1);
  assert.ok(screenEvents([{ id: "x", kind: "surprise", type: "other", titleVi: "t", tsUtc: "2025-01-01T00:00:00Z", region: "US", sectorsHint: [], polarityHint: 0, source: { name: "AI" }, extraction: { method: "llm", confidence: 0.4, reviewed: false } }]).rejected.length === 1, "tin AI độ tin cậy thấp chưa duyệt bị từ chối");
  for (const t of Object.values(SECTOR_BASKETS)) assert.ok(t.length >= 3);
});

function realPayload(n = 520) {
  const days = weekdays("2024-06-03", n);
  const r = rng(3);
  const series = () => days.map((_, t) => (t ? Math.round(r() * 300) / 100 : 0));
  const markets = Object.fromEntries(["US", "CN", "JP", "KR", "TH", "VN"].map((k) => [k, series()]));
  const sectors = Object.fromEntries(Object.keys(SECTOR_BASKETS).map((k) => [k, series()]));
  return { daily: { tradingDays: days, markets, sectors }, observations: [], events: REAL_WORLD_EVENTS, meta: { builtAt: "x" } };
}

test("worldCore: chưa có dữ liệu ngày -> MÔ PHỎNG (biểu ngữ); có dữ liệu ngày -> THẬT; thiếu 60 tháng -> ma trận 422 chứ không lấp số mô phỏng", async () => {
  const core = createWorldCore({ today: () => "2026-10-16" });
  assert.equal(core.source().mode, "synthetic");
  assert.match(core.source().notice, /MÔ PHỎNG/);
  core.setData(realPayload());
  const src = core.source();
  assert.equal(src.mode, "real");
  assert.equal(src.notice, null);
  assert.equal(src.events.rejected.length, 0);
  const mx = await core.handle({ method: "POST", path: "/api/world/matrix", query: {}, body: {} });
  assert.equal(mx.status, 422);
  const conn = await core.handle({ method: "GET", path: "/api/world/connectedness", query: {}, body: undefined });
  assert.equal(conn.status, 200, JSON.stringify(conn.body).slice(0, 200));
  assert.equal(conn.body.notice, undefined);
  const ev = await core.handle({ method: "GET", path: "/api/world/events", query: {}, body: undefined });
  assert.equal(ev.status, 200);
  assert.ok(ev.body.events.some((e) => e.tier !== "pending"), "có sự kiện đủ 250 phiên trước để đo");
  const st = await core.handle({ method: "GET", path: "/api/world/stock/HPG", query: {}, body: undefined });
  assert.equal(st.status, 422);
  assert.match(st.body.error, /phơi nhiễm/);
});

test("worldCoverage: chuỗi ngừng cập nhật bị đánh dấu và không dùng", () => {
  const obs = [];
  for (let i = 0; i < 70; i++) {
    const y = 2018 + Math.floor(i / 12), m = String((i % 12) + 1).padStart(2, "0");
    obs.push({ seriesId: "VIX", period: `${y}-${m}`, value: 20, asOf: `${y}-${m}-28`, source: "Yahoo:^VIX" });
  }
  const vix = worldCoverage(obs, "2026-10-16").find((c) => c.id === "VIX");
  assert.equal(vix.stale, true);
  assert.equal(vix.usable, false);
  assert.deepEqual(vix.sources, ["Yahoo:^VIX"]);
});

function fakes({ budgetAt = Infinity } = {}) {
  const days = weekdays("2019-10-01", 1800);
  const r = rng(7);
  const px = (seed) => {
    let p = 100;
    const rr = rng(seed);
    return days.map((d) => ({ date: d, close: (p *= 1 + rr() * 0.04) }));
  };
  let calls = 0;
  const history = {
    get: async (sym) => {
      if (sym !== "VNINDEX" && ++calls > budgetAt) throw Object.assign(new Error("budget"), { statusCode: 503 });
      return { bars: px(sym.length * 97 + sym.charCodeAt(0)) };
    },
  };
  const corporateActions = { get: async () => ({ covered: true, events: [] }) };
  const yahooBars = (start) => {
    const ts = [], close = [];
    for (let i = 0; i < 1800; i++) { ts.push(Date.parse(days[i]) / 1000 + 14 * 3600); close.push(100 + i * 0.01 + r()); }
    return { chart: { result: [{ timestamp: ts, indicators: { quote: [{ close }] } }] } };
  };
  const fetchImpl = async (url) => new Response(JSON.stringify(yahooBars(url)), { status: 200 });
  const macroObservations = async () => [{ seriesId: "FED", period: "2026-09", value: 3.75, asOf: "2026-10-01", source: "FRED:FEDFUNDS" }];
  return { history, corporateActions, fetchImpl, macroObservations };
}

test("worldService: dựng đủ -> lưu KV + chế độ THẬT, kèm báo cáo nguồn; chạm ngân sách tải -> KHÔNG dùng bản thiếu", async () => {
  const kv = memKv();
  const svc = createWorldService({ store: kv, inline: true, now: () => NOW, ...fakes() });
  const r = await svc.refresh({ force: true });
  assert.equal(r.complete, true, JSON.stringify(r.report.notes));
  assert.equal(r.source.mode, "real");
  assert.ok(kv.m.get(WORLD_KV_KEY).daily.tradingDays.length >= 1700);
  assert.equal(r.report.markets.TH.source, "Yahoo:THD");
  assert.ok(r.report.missingFactors.CONTAINER);
  assert.ok(r.report.sectors.S_BANK.members.length >= 3);
  assert.ok(r.report.monthly.SEMI.months > 60);

  const kv2 = memKv();
  const svc2 = createWorldService({ store: kv2, inline: true, now: () => NOW, ...fakes({ budgetAt: 10 }) });
  const r2 = await svc2.refresh({ force: true });
  assert.equal(r2.complete, false);
  assert.equal(kv2.m.has(WORLD_KV_KEY), false, "bản thiếu không được lưu");
  assert.equal(r2.source.mode, "synthetic");
  // bản chưa đủ: request kế tiếp KHÔNG được kích hoạt dựng lại ngay (không đốt ngân sách tải lịch sử)
  assert.equal((await svc2.refresh()).skipped, "retry-later");
  await svc2.close();
});

test("router: route engine, nguồn, admin cần token, route lạ 404", async () => {
  const core = createWorldCore({ today: () => "2026-10-16" });
  const svc = { source: async () => core.source(), handle: (req) => core.handle(req), refresh: async () => ({ ok: true }) };
  const app = express();
  app.use(express.json());
  app.use("/api/world", createWorldRouter({ getService: () => svc, adminToken: () => "t0k" }));
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}/api/world`;
  try {
    const s = await (await fetch(`${base}/series`)).json();
    assert.equal(s.factors.length, 13);
    assert.equal((await (await fetch(`${base}/source`)).json()).mode, "synthetic");
    assert.equal((await fetch(`${base}/events/ev1`)).status, 200);
    assert.equal((await fetch(`${base}/nope`)).status, 404);
    assert.equal((await fetch(`${base}/admin/refresh`, { method: "POST" })).status, 401);
    assert.equal((await fetch(`${base}/admin/refresh`, { method: "POST", headers: { authorization: "Bearer t0k" } })).status, 200);
  } finally {
    server.close();
  }
});

test("worldSignalFromScore: chỉ dùng khi có liên kết bậc A VÀ cổng ngoài mẫu đạt; xác suất = tỷ lệ đúng hướng ngoài mẫu theo chiều điểm, chặn [0,3; 0,7]", () => {
  const pass = { pass: true, reasons: [] };
  assert.equal(worldSignalFromScore(null, []).usable, false);
  const fail = worldSignalFromScore({ thermometer: { value: 0.6 }, backtest: { ic: 0.02, hitRate: 0.52, gate: { pass: false, reasons: ["IC không có ý nghĩa"] } } }, ["DXY"]);
  assert.equal(fail.usable, false);
  assert.equal(fail.probability, null);
  assert.match(fail.reason, /CHƯA đạt/);
  assert.equal(worldSignalFromScore({ thermometer: { value: 0.4 }, backtest: { ic: 0.2, hitRate: 0.64, gate: pass } }, ["DXY"]).probability, 0.64);
  assert.ok(Math.abs(worldSignalFromScore({ thermometer: { value: -0.4 }, backtest: { ic: 0.2, hitRate: 0.64, gate: pass } }, ["DXY"]).probability - 0.36) < 1e-12);
  assert.equal(worldSignalFromScore({ thermometer: { value: 0.01 }, backtest: { ic: 0.2, hitRate: 0.64, gate: pass } }, ["DXY"]).probability, 0.5);
  assert.equal(worldSignalFromScore({ thermometer: { value: 0.9 }, backtest: { ic: 0.4, hitRate: 0.9, gate: pass } }, ["DXY"]).probability, 0.7);
});

test("worldCore: công cụ chat world_* chạy qua engine; tín hiệu ngành ở chế độ mô phỏng = không dùng được", async () => {
  const core = createWorldCore({ today: () => "2026-10-16" });
  const specs = core.toolSpecs();
  assert.equal(specs.anthropic.length, 5);
  assert.match(specs.guidelines, /bậc C/);
  const ev = await core.runTool("world_events", {});
  assert.equal(ev.ok, true);
  assert.match(ev.notice, /MÔ PHỎNG/);
  assert.equal((await core.runTool("world_nope", {})).ok, false);
  const sig = await core.sectorSignals();
  assert.equal(sig.mode, "synthetic");
  assert.deepEqual(sig.sectors, []);
  core.setData(realPayload());
  const real = await core.sectorSignals();
  assert.equal(real.mode, "real");
  assert.ok(real.reason || real.sectors.every((x) => x.usable === false || typeof x.probability === "number"));
});

import { createMemoryStore } from "../src/market/store/memoryStore.js";

test("worldService + macroService: dữ liệu đã lưu được ĐỌC LẠI sau khởi động lại (kho thật của Gateway trả { value, updatedAt })", async () => {
  const store = createMemoryStore();
  const svc = createWorldService({ store, inline: true, now: () => NOW, ...fakes() });
  assert.equal((await svc.refresh({ force: true })).complete, true);
  // "khởi động lại": dịch vụ mới, cùng kho, KHÔNG gọi refresh
  const svc2 = createWorldService({ store, inline: true, now: () => NOW, ...fakes({ budgetAt: 0 }) });
  await svc2.init();
  const src = await svc2.source();
  assert.equal(src.mode, "real");
});

test("W2 spliceSectorReturns: rổ trước ngày ICB bắt đầu, ICB sau đó; ICB < 3 mã bị bỏ; không nguồn -> start null", async () => {
  const { spliceSectorReturns, SECTOR_ICB, SECTOR_BASKETS: B } = await import("../src/market/world/worldData.js");
  const days = ["d0", "d1", "d2", "d3", "d4", "d5"];
  const basket = [0, 1, 1, 1, 1, 1];
  const icb = [["d1", 100, 2], ["d2", 100, 5], ["d3", 110, 5], ["d4", 99, 5], ["d5", 99, 5]];
  const sp = spliceSectorReturns(days, basket, 1, icb);
  assert.equal(sp.icbFrom, "d2"); // d1 có 2 mã < 3 -> bỏ
  assert.deepEqual(sp.ret, [0, 1, 1, 10, -10, 0]);
  assert.equal(sp.start, 1);
  assert.equal(sp.basketDays, 2);
  assert.equal(sp.icbDays, 3);
  const none = spliceSectorReturns(days, basket, null, null);
  assert.equal(none.start, null);
  const onlyIcb = spliceSectorReturns(days, basket, null, icb);
  assert.equal(onlyIcb.start, 2);
  assert.deepEqual(onlyIcb.ret.slice(0, 3), [0, 0, 0]);
  for (const k of Object.keys(SECTOR_ICB)) assert.ok(B[k], k);
  assert.equal(SECTOR_ICB.S_SEAFOOD, undefined);
});
