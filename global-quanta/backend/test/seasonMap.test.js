import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { compactQuarter, createSeasonMap, scoreEntry, SM_RULES, windowStatus } from "../src/market/fundamentals/seasonMap.js";
import { pooledEvidence } from "../src/market/fundamentals/eventStudy.js";

const w = (id, o) => ({ id, label: id.toUpperCase(), nEvents: 6, netExpectancy: -0.01, netExpectancyLcb: -0.02, fdrQValue: 0.9, winRate: 0.5, ...o });

test("S2 trạng thái cửa sổ: đúng quy tắc giao diện Mùa vụ (ĐẠT / THEO DÕI / CHƯA ĐỦ MẪU / KHÔNG CÓ LỢI THẾ)", () => {
  assert.equal(windowStatus(w("e1"), "e1"), "SELECTED");
  assert.equal(windowStatus(w("e1", { fdrQValue: 0.15 }), null), "WATCH");
  assert.equal(windowStatus(w("e1", { netExpectancyLcb: 0.001 }), null), "WATCH");
  assert.equal(windowStatus(w("e1"), null), "THIN");
  assert.equal(windowStatus(w("e1", { nEvents: 9 }), null), "NONE");
  const c = compactQuarter({ selectedWindowId: null, windows: [w("e1"), w("e2", { fdrQValue: 0.1, netExpectancy: 0.02 }), w("e3", { netExpectancy: 0.03 })] });
  assert.equal(c.status, "WATCH");
  assert.equal(c.best.id, "e3");
  assert.equal(c.n, 6);
  assert.equal(compactQuarter(null), null);
});

test("S6 chấm: vào entryTo, thoát exitOffset, CAR = log giá − log VN-Index, ròng = exp(CAR) − 1 − 0,45%", () => {
  const dates = Array.from({ length: 30 }, (_, i) => `2027-01-${String(i + 1).padStart(2, "0")}`);
  const px = dates.map((d, i) => [d, 100 * (1 + 0.01 * i)]);
  const vn = new Map(dates.map((d) => [d, 1000]));
  const s = scoreEntry({ window: "e2" }, "2027-01-11", px, vn); // day0 = i 10; vào i 8, thoát i 13
  assert.equal(s.entry, "2027-01-09"); assert.equal(s.exit, "2027-01-14");
  const car = Math.log(px[13][1] / px[8][1]);
  assert.ok(Math.abs(s.car - car) < 1e-4);
  assert.ok(Math.abs(s.net - (Math.exp(car) - 1 - SM_RULES.cost)) < 1e-4);
  assert.equal(scoreEntry({ window: "e4" }, "2027-01-20", px, vn).pending, true); // chưa đủ phiên
});

test("S2+S6 dịch vụ: gom Project A, ghi sổ một lần trước kỳ cho cửa sổ THEO DÕI, không ghi trùng", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-"));
  fs.writeFileSync(path.join(dir, "AAA.json.gz"), zlib.gzipSync(JSON.stringify({ ticker: "AAA", quarters: [] })));
  const fetchImpl = async (url) => {
    if (url.includes("annual-earnings-calendar")) return { ok: true, status: 200, json: async () => ({ asOf: "2026-11-05T22:00:00Z", quarters: [{ quarter: 4, typicalAnnounceMonth: 1 }] }) };
    const q = Number(new URL(url).searchParams.get("quarter"));
    return { ok: true, status: 200, json: async () => ({ selectedWindowId: null, windows: [w("e1", { fdrQValue: q === 4 ? 0.12 : 0.9 }), w("e2")] }) };
  };
  const cal = { current: { quarter: { label: "Q3/2026", fiscal: "2026-09-30" }, rows: [] }, next: { quarter: { label: "Q4/2026", fiscal: "2026-12-31" }, rows: [{ t: "AAA", status: "UPCOMING", expected: "2027-01-20" }] } };
  let clock = Date.parse("2026-12-20T05:00:00Z");
  const sm = createSeasonMap({ dir, fetchImpl, now: () => clock, log: { log() {}, warn() {} }, getCalendar: async () => cal });
  await sm.build();
  assert.equal(sm.map().rows.AAA.q[4].status, "WATCH");
  assert.equal(sm.map().rows.AAA.months[4], 1);
  assert.deepEqual(await sm.ledgerTick(), { added: 0, scored: 0, entries: 0 }); // còn 31 ngày: chưa ghi
  clock = Date.parse("2027-01-05T05:00:00Z");
  assert.equal((await sm.ledgerTick()).added, 1); // còn 15 ngày: ghi cửa sổ e1 THEO DÕI
  assert.equal((await sm.ledgerTick()).added, 0); // không ghi trùng
  const L = sm.ledger();
  assert.equal(L.total, 1);
  assert.equal(L.entries[0].window, "e1");
  assert.equal(L.entries[0].backtest.q, 0.12);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("S4 gộp theo nhóm mã × loại quý: chỉ ngày chính xác; chênh 1/3 SUE cao − thấp", () => {
  const ev = [];
  for (let i = 0; i < 60; i++) ev.push({ t: `T${i % 10}`, q: 3, s: i % 6 === 0 ? 0 : 1, sue: i - 30, pre: 0, ann: (i - 30) / 1000, post: 0 });
  const p = pooledEvidence(ev, new Set(["T0", "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9"]));
  assert.equal(p[3].n, 50);
  assert.ok(p[3].sueSplit.diff > 0);
  assert.equal(p[1].n, 0);
});
