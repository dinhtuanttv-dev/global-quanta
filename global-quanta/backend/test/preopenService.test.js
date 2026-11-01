import { test } from "node:test";
import assert from "node:assert/strict";
import { createPreopenService, esIsFresh, vnClock, worldFresh } from "../src/market/preopen/preopenService.js";

// Dữ liệu giả: 180 phiên đến 30/10/2026 (thứ Sáu), ES theo giờ cùng kỳ.
const end = Date.parse("2026-10-30T00:00:00Z");
const dates = Array.from({ length: 180 }, (_, i) => new Date(end - (179 - i) * 86_400_000).toISOString().slice(0, 10));
let a = 3; const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
let px = 1500;
const BARS = dates.map((date) => { const open = px * (1 + (r() - 0.5) * 0.01), close = open * (1 + (r() - 0.5) * 0.02); px = close; return { date, open, high: Math.max(open, close), low: Math.min(open, close), close }; });
const ES = []; let e = 5000;
for (let t = end / 1000 - 182 * 86400; t < end / 1000 + 4 * 86400; t += 3600) { e *= 1 + (r() - 0.5) * 0.002; ES.push({ t, close: e }); }
const world = (es = 4900) => async () => [{ group: "futures", symbol: "ES=F", name: "ES", price: es, at: "2026-11-02T01:00:00Z", changePct: -1 }, { group: "us", symbol: "^GSPC", name: "S&P 500", price: 7000, at: null, changePct: -1.5 }];
const memStore = () => { const kv = new Map(); return { kv, getKv: async (k) => (kv.has(k) ? { value: kv.get(k) } : null), setKv: async (k, v) => kv.set(k, structuredClone(v)) }; };
const make = (t, o = {}) => createPreopenService({ getVnBars: async () => o.bars ?? BARS, esHours: async () => ES, world: o.world ?? world(), now: () => t.v, tradingDay: (d) => ![0, 6].includes(new Date(d.getTime() + 7 * 3_600_000).getUTCDay()), store: o.store ?? memStore(), getMsGarch: async () => ({ available: true, grade: "C", asOf: "2026-10-30", regime: { label: "calm", probCalm: 0.9, probVolatile: 0.1 }, volAnnualPct: 14 }), log: {} });

test("giờ Việt Nam đúng khi qua nửa đêm UTC", () => {
  const c = vnClock(Date.parse("2026-11-01T18:30:00Z"));
  assert.equal(c.date, "2026-11-02");
  assert.equal(c.mins, 90);
});

test("trước giờ giao dịch: dùng phiên trước làm mốc, chưa đạt kiểm định thì không có % và vùng mở cửa", async () => {
  const t = { v: Date.parse("2026-11-02T01:30:00Z") };
  const d = await make(t).get();
  assert.equal(d.phase, "pre");
  assert.equal(d.session, "2026-11-02");
  assert.equal(d.prevDate, "2026-10-30");
  assert.equal(d.levels.close, Math.round(BARS.at(-1).close * 10) / 10);
  assert.equal(d.scenarios.length, 3);
  assert.ok(d.scenarios.every((s) => s.probability === null && s.open === null));
  assert.ok(d.volNext.ew > 0);
  assert.equal(d.tracking, null);
  assert.equal(d.risk.label, "calm");
  assert.equal(d.evidence.probabilities, false);
});

test("ES không dùng nến sau 15:00 phiên trước", async () => {
  const t = { v: Date.parse("2026-11-02T01:30:00Z") };
  const d = await make(t, { world: world(5000) }).get();
  const ref = [...ES].filter((b) => b.t + 3600 <= Date.parse("2026-10-30T08:00:00Z") / 1000).at(-1).close;
  assert.equal(d.es.refPrice, ref);
  assert.ok(Math.abs(d.es.movePct - (5000 / ref - 1) * 100) < 0.01);
});

test("ngày nghỉ báo đóng cửa và hướng tới phiên kế tiếp", async () => {
  const d = await make({ v: Date.parse("2026-10-31T03:00:00Z") }).get();
  assert.equal(d.phase, "closed");
  assert.equal(d.session, "2026-11-02");
});

test("sổ tiến: ghi số bị ẩn một lần mỗi mốc, chấm lúc 15:05, không trùng", async () => {
  const store = memStore(), t = { v: Date.parse("2026-11-02T00:15:00Z") }; // 07:15 VN
  const bars = [...BARS, { date: "2026-11-02", open: BARS.at(-1).close * 0.99, high: 0, low: 0, close: BARS.at(-1).close * 0.985 }];
  const s = make(t, { store, bars });
  assert.equal(await s.tick(), "07:15");
  const again = await s.snapshot("07:15");
  assert.equal(again, false);
  const day = store.kv.get("preopen:ledger:v1").days["2026-11-02"];
  assert.ok(day.slots["07:15"].shadow.every((x) => x.open && Number.isFinite(x.probability)));
  assert.equal(day.prevClose, BARS.at(-1).close);
  t.v = Date.parse("2026-11-02T08:16:00Z");
  await s.tick();
  const sc = store.kv.get("preopen:ledger:v1").days["2026-11-02"].score;
  assert.equal(sc.outcome, "neg");
  assert.equal(sc.ccPct, -1.5);
  assert.equal(await s.score("2026-11-02"), false);
  const d = await s.get();
  assert.equal(d.ledger.scored, 1);
  assert.equal(d.phase, "post");
});

test("ES đóng băng trong giờ giao dịch thì không kết luận; cuối tuần giá cũ là bình thường", async () => {
  assert.equal(esIsFresh("2026-11-02T00:00:00Z", Date.parse("2026-11-02T01:30:00Z")), true);
  assert.equal(esIsFresh("2026-10-30T21:00:00Z", Date.parse("2026-11-02T01:30:00Z")), false);
  assert.equal(esIsFresh("2026-10-30T21:00:00Z", Date.parse("2026-10-31T10:00:00Z")), true);
  assert.equal(esIsFresh(null, Date.parse("2026-10-31T10:00:00Z")), false);
  const stale = await make({ v: Date.parse("2026-11-02T01:30:00Z") }, { world: async () => [{ group: "futures", symbol: "ES=F", name: "ES", price: 4900, at: "2026-10-30T21:00:00Z", changePct: -1 }] }).get();
  assert.equal(stale.lead, null);
  assert.equal(stale.es.movePct, null);
  assert.equal(stale.es.fresh, false);
  const missing = await make({ v: Date.parse("2026-11-02T01:30:00Z") }, { world: async () => [] }).get();
  assert.equal(missing.lead, null);
});

test("số châu Á chưa mở hôm nay bị đánh dấu phiên trước", () => {
  const now = Date.parse("2026-11-02T00:15:00Z");
  assert.equal(worldFresh({ group: "asia", at: "2026-10-30T08:08:00Z" }, now), false);
  assert.equal(worldFresh({ group: "asia", at: "2026-11-02T00:10:00Z" }, now), true);
  assert.equal(worldFresh({ group: "us", at: "2026-11-01T21:00:00Z" }, now), true);
  assert.equal(worldFresh({ group: "us", at: null }, now), false);
});

test("trong phiên giữ nguyên kịch bản của ảnh chụp cuối, ES đang chạy không đổi kết luận", async () => {
  const store = memStore(), t = { v: Date.parse("2026-11-02T01:50:00Z") }, ref = [...ES].filter((b) => b.t + 3600 <= Date.parse("2026-10-30T08:00:00Z") / 1000).at(-1).close;
  const at = (price) => async () => [{ group: "futures", symbol: "ES=F", name: "ES", price, at: new Date(t.v - 60_000).toISOString(), changePct: -1 }];
  let w = at(ref * 0.9);
  const bars = [...BARS, { date: "2026-11-02", open: BARS.at(-1).close * 0.99, high: 0, low: 0, close: BARS.at(-1).close * 0.985 }];
  const s = createPreopenService({ getVnBars: async () => bars, esHours: async () => ES, world: () => w(), now: () => t.v, tradingDay: () => true, store, log: {} });
  await s.tick();
  t.v = Date.parse("2026-11-02T03:30:00Z");
  w = at(ref * 1.2);
  const d = await s.get();
  assert.equal(d.phase, "session");
  assert.equal(d.lead, "neg");
  assert.equal(d.es.frozenAt, "08:50");
  assert.ok(d.es.livePct > 10);
  assert.ok(d.tracking);
  assert.ok(d.scenarios.every((x) => !("shadowOpen" in x) && !("shadowProbability" in x)), "không lộ số ẩn qua API");
});

test("ngày nghỉ không ghi ảnh chụp", async () => {
  const store = memStore();
  assert.equal(await make({ v: Date.parse("2026-10-31T00:15:00Z") }, { store }).tick(), null);
  assert.equal(store.kv.size, 0);
});
