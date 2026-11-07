// TO-v1: Săn cổ tức trước GDKHQ — quy tắc TO-r1, radar, sổ TO-L1 (lần xem, CUSUM), mô phỏng, W1–W5 trên Gateway.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  cashAnnouncements, cusumLow, eventFacts, legacyWindowStudy, radarRow, referenceStudy, runUpPercentile, simulatePortfolio, stockSeries, TO_RULE,
} from "../src/market/events/divRunup.js";
import { createDivRunup, TO_R1 } from "../src/market/events/divRunupService.js";

/** Lịch phiên (thứ 2–6) từ `from`, n phiên. */
function sessions(from, n) { const out = []; for (let d = Date.parse(`${from}T00:00:00Z`); out.length < n; d += 864e5) { const w = new Date(d).getUTCDay(); if (w && w < 6) out.push(new Date(d).toISOString().slice(0, 10)); } return out; }
const DATES = sessions("2025-06-02", 420);
const mkt = new Map(DATES.map((d) => [d, 1000]));
/** Giá phẳng 10 (nghìn đồng), tăng `daily` mỗi phiên trong [a, b]; GTGD 2 tỷ. */
function rows({ a = -1, b = -1, daily = 0.01, jumpAt = -1, jump = 0 } = {}) {
  let p = 10; return DATES.map((d, i) => { if (i > a && i <= b) p *= 1 + daily; if (i === jumpAt) p *= 1 + jump; return [d, +p.toFixed(6), 2e9, +p.toFixed(6)]; });
}

test("cashAnnouncements: gộp cùng GDKHQ, ngày công bố sớm nhất, bỏ đợt trùng cổ tức cổ phiếu", () => {
  const a = cashAnnouncements([
    { cat: "CASH", ex: "2026-01-10", cash: 500, disclosed: "2025-12-20" }, { cat: "CASH", ex: "2026-01-10", cash: 300, disclosed: "2025-12-18", check: { level: "CONFIRMED_2" } },
    { cat: "CASH", ex: "2026-03-05", cash: 1000, disclosed: "2026-02-20" }, { cat: "STOCK", ex: "2026-03-06" }, { cat: "CASH", ex: "2026-04-01", cash: 100 },
  ]);
  assert.deepEqual(a.map((x) => [x.ex, x.cash, x.disclosed, x.check]), [["2026-01-10", 800, "2025-12-18", "CONFIRMED_2"]]);
});

test("eventFacts: vào phiên đầu sau công bố, thoát phiên cuối còn quyền, vượt VN-Index trừ phí; đủ điều kiện TO-r1", () => {
  const D = DATES[100], E = DATES[110]; // công bố phiên 100, GDKHQ phiên 110 -> vào 101, thoát 109
  const s = stockSeries(rows({ a: 101, b: 109, daily: 0.01 }), mkt);
  const f = eventFacts({ ex: E, cash: 600, disclosed: D }, s, mkt, { exch: "HOSE" });
  assert.equal(f.entryDate, DATES[101]); assert.equal(f.outcome.exitDate, DATES[109]);
  assert.equal(f.y, 0.06); assert.equal(f.bucket, "≥5%"); assert.equal(f.qualifies, true); assert.equal(f.limitUp, false);
  assert.ok(Math.abs(f.outcome.excess - (1.01 ** 8 - 1 - 0.0045)) < 1e-4);
  assert.equal(f.path.length, 9); // phiên 101..109
  // Tin ra cuối tuần (ngày không giao dịch) -> phiên trước là phiên cuối ≤ ngày công bố
  const sat = new Date(Date.parse(`${DATES[100]}T00:00:00Z`)); while (sat.getUTCDay() !== 6) sat.setUTCDate(sat.getUTCDate() + 1);
  const f2 = eventFacts({ ex: E, cash: 600, disclosed: sat.toISOString().slice(0, 10) }, s, mkt);
  assert.ok(f2.entryDate > sat.toISOString().slice(0, 10));
});

test("eventFacts: trần lúc vào / thanh khoản thấp / lợi suất < 5% -> không đủ điều kiện", () => {
  const D = DATES[100], E = DATES[110];
  const up = eventFacts({ ex: E, cash: 600, disclosed: D }, stockSeries(rows({ jumpAt: 101, jump: 0.07 }), mkt), mkt, { exch: "HOSE" });
  assert.equal(up.limitUp, true); assert.equal(up.qualifies, false);
  const upc = eventFacts({ ex: E, cash: 600, disclosed: D }, stockSeries(rows({ jumpAt: 101, jump: 0.07 }), mkt), mkt, { exch: "UPCOM" });
  assert.equal(upc.limitUp, false);
  const thin = stockSeries(rows().map((r) => [r[0], r[1], 5e8, r[3]]), mkt);
  assert.equal(eventFacts({ ex: E, cash: 600, disclosed: D }, thin, mkt).qualifies, false);
  assert.equal(eventFacts({ ex: E, cash: 400, disclosed: D }, stockSeries(rows(), mkt), mkt).qualifies, false);
  // T+2: thoát cách vào < 2 phiên -> không có kết quả
  assert.equal(eventFacts({ ex: DATES[102], cash: 600, disclosed: D }, stockSeries(rows(), mkt), mkt).outcome, null);
});

test("referenceStudy + runUpPercentile + radarRow (T+2, đã chạy quá xa, ngành yếu)", () => {
  const facts = [];
  for (let k = 0; k < 30; k++) facts.push({ ex: `2025-${String((k % 9) + 1).padStart(2, "0")}-15`, bucket: "≥5%", y: 0.06, adv: 2e9, limitUp: false, qualifies: true, sector: k < 10 ? "Tiêu dùng" : "Công nghiệp",
    outcome: { excess: k < 10 ? -0.02 : 0.03 }, path: Array.from({ length: 8 }, (_, i) => (i + 1) * 0.003 * ((k % 5) + 1)) });
  const ref = referenceStudy(facts);
  assert.equal(ref.byBucket["≥5%"].n, 30); assert.deepEqual(ref.weakSectors, ["Tiêu dùng"]);
  const prof = ref.runUp["≥5%"].profile; assert.equal(prof[0].k, 1);
  assert.ok(runUpPercentile(prof, 3, prof[2].p90 + 0.01) >= 0.9);
  const f = { ex: "2026-02-10", disclosed: "2026-02-02", cash: 600, y: 0.06, bucket: "≥5%", adv: 2e9, check: "CONFIRMED_2", entryDate: "2026-02-03", limitUp: false, qualifies: true, path: [0.01, 0.02, 0.2] };
  const r = radarRow(f, ref, { t: "AAA", sector: "Tiêu dùng", today: "2026-02-05", lastCumDate: "2026-02-09", sessionsUntil: () => 2, lastPrice: 10 });
  assert.equal(r.t2Ok, true); assert.equal("ranTooFar" in r, false); assert.equal(r.weakSector, true); assert.equal(r.yieldNow, 0.06); assert.equal(r.label, "THĂM DÒ");
  assert.equal(radarRow(f, ref, { t: "AAA", today: "2026-02-06", lastCumDate: "2026-02-09", sessionsUntil: () => 1 }).t2Ok, false);
});

test("cusumLow báo động khi kết quả thấp hơn μ0 kéo dài; simulatePortfolio tính phí, giới hạn vị thế", () => {
  assert.equal(cusumLow(Array(10).fill(0.0176), { mu0: 0.0176, sigma0: 0.0573 }).alarmed, false);
  const c = cusumLow(Array(20).fill(-0.03), { mu0: 0.0176, sigma0: 0.0573 }); assert.equal(c.alarmed, true); assert.equal(c.alarmAt, 12); // mỗi lệnh −0,33 -> qua −4 ở lệnh 13
  const px = new Map(rows({ a: 10, b: 20, daily: 0.01 }).map((r) => [r[0], r[1]]));
  const sim = simulatePortfolio([{ t: "A", entryDate: DATES[10], exitDate: DATES[20], y: 0.06 }, { t: "B", entryDate: DATES[10], exitDate: DATES[20], y: 0.05 }],
    { dates: DATES, vn: mkt, priceOf: (_t, d) => px.get(d), from: DATES[0], slots: 1 });
  assert.equal(sim.trades, 1); assert.ok(Math.abs(sim.total - (1 / 1.002 * 1.01 ** 10 * 0.9975 - 1)) < 1e-3); // 1 vị thế = toàn bộ vốn assert.equal(sim.vnTotal, 0);
});

test("legacyWindowStudy: q-value Benjamini–Hochberg trên toàn bộ mã × cửa sổ", () => {
  const by = {}; for (let t = 0; t < 20; t++) by[`T${t}`] = Array.from({ length: 10 }, (_, i) => ({ w: "w1", ex: `2024-0${(i % 9) + 1}-01`, x: t === 0 ? 0.05 + i * 0.001 : (i % 2 ? 0.01 : -0.01), known: false }));
  const r = legacyWindowStudy(by);
  assert.equal(r.tests, 20); assert.deepEqual(r.significant, ["T0:w1"]); assert.equal(r.pooled.w1.knownAtEntry, 0);
});

test("dịch vụ: build + tick ghi lệnh từ ngày bắt đầu, chấm sau phiên cuối còn quyền, lần xem không sửa; radar đợt đang diễn ra", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "to-"));
  const startI = DATES.indexOf(DATES.find((d) => d >= TO_R1.start));
  const evs = { AAA: [{ cat: "CASH", ex: DATES[startI - 40], cash: 600, disclosed: DATES[startI - 50] }, { cat: "CASH", ex: DATES[startI + 12], cash: 700, disclosed: DATES[startI + 2] }, { cat: "CASH", ex: DATES[DATES.length - 1], cash: 800, disclosed: DATES[DATES.length - 4] }] };
  const vnRows = DATES.map((d) => [d, 1000, 0]); const px = rows({ a: startI + 3, b: startI + 11, daily: 0.01 });
  const nowAt = Date.parse(`${DATES[DATES.length - 2]}T05:00:00Z`);
  const svc = createDivRunup({ dir, pricesOf: (t) => (t === "VNINDEX" ? vnRows : t === "AAA" ? px : null), getUniverse: async () => ({ tickers: [{ ticker: "AAA", exchange: "HOSE", sectorGroup: "Công nghiệp", name: "A" }] }),
    eventsOf: (t) => evs[t] ?? [], now: () => nowAt, log: {} });
  const b = await svc.build(); assert.equal(b.events, 3);
  const t1 = await svc.tick(); assert.equal(t1.added, 2); assert.equal(t1.scored, 1); // đợt trước ngày bắt đầu không ghi
  const L = svc.ledger(); assert.equal(L.counts.done, 1); assert.ok(L.entries.find((e) => e.status === "DONE").result.excess > 0.07); assert.equal(L.label, "THĂM DÒ"); assert.equal(L.nextLook, 30);
  const t2 = await svc.tick(); assert.equal(t2.added, 0); assert.equal(t2.scored, 0);
  const rd = await svc.radar(); assert.equal(rd.rows.length, 1); assert.equal(rd.rows[0].cash, 800); assert.equal(rd.rows[0].qualifies, true);
  const ov = await svc.overview(); assert.equal(ov.reference.rule.n, 2); assert.equal(svc.sim().forward.trades, 2);
  assert.ok(svc.legacy("AAA").pooled.w1);
});

test("EX-r1: phần giữ qua GDKHQ 5 phiên — gồm cổ tức sau thuế, vượt VN-Index; tham chiếu theo nhóm; lịch sử theo mã", async () => {
  // Công bố phiên 100, GDKHQ phiên 110 (phiên cuối còn quyền 109). Giá giảm đúng bằng cổ tức trước thuế ở GDKHQ (giá điều chỉnh không đổi) rồi giảm 1%/phiên.
  const D = DATES[100], E = DATES[110];
  const s = stockSeries(rows({ a: 109, b: 114, daily: -0.01 }), mkt);
  const f = eventFacts({ ex: E, cash: 600, disclosed: D }, s, mkt);
  const expect5 = 0.99 ** 5 * (1 - 0.05 * 600 / (10 * 1000)) - 1;
  assert.equal(f.postEx5.date, DATES[114]); assert.ok(Math.abs(f.postEx5.excess - expect5) < 1e-4);
  const ref = referenceStudy([{ ...f, adv: 2e9, outcome: { excess: 0.01 }, sector: "X", qualifies: true }]);
  assert.equal(ref.postEx["≥5%"].n, 1); assert.ok(ref.postEx["≥5%"].mean < 0);
  // Dữ liệu chưa tới GDKHQ + 4 -> null
  assert.equal(eventFacts({ ex: DATES[DATES.length - 2], cash: 600, disclosed: DATES[DATES.length - 10] }, stockSeries(rows(), mkt), mkt).postEx5, null);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "to-h-"));
  const svc = createDivRunup({ dir, pricesOf: (t) => (t === "VNINDEX" ? DATES.map((d) => [d, 1000, 0]) : t === "AAA" ? rows() : null),
    getUniverse: async () => ({ tickers: [{ ticker: "AAA", exchange: "HOSE", sectorGroup: "Công nghiệp" }] }), eventsOf: () => [{ cat: "CASH", ex: E, cash: 600, disclosed: D }], log: {} });
  const h = await svc.tickerHistory("AAA"); assert.equal(h.events.length, 1); assert.equal(h.events[0].qualifies, true); assert.ok("postEx5" in h.events[0]); assert.ok(!("path" in h.events[0]));
  assert.equal(await svc.tickerHistory("ZZZ"), null);
});
