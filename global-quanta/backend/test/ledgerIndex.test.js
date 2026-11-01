import assert from "node:assert/strict";
import test from "node:test";
import { assertLatestSession, loadLedgerIndex, missingSessions } from "../src/market/ledgerIndex.js";
import { LEDGER_INDEX_KV, ledgerKv, recordSnapshot } from "../src/market/cycles/ledger.js";
import { createLocalStore } from "../src/market/store/localStore.js";

const fakeStore = (entries = {}, { failRead = new Set() } = {}) => {
  const kv = new Map(Object.entries(entries));
  return {
    kv,
    getKv: async (k) => (failRead.has(k) || !kv.has(k) ? null : { value: kv.get(k) }),
    setKv: async (k, v) => { kv.set(k, v); },
    listKv: async (p) => [...kv.keys()].filter((k) => k.startsWith(p)),
  };
};

test("mục lục đọc không được: không làm rơi các ngày đã có bản chụp", async () => {
  const store = fakeStore({ [ledgerKv("2026-10-09")]: { rows: [] }, [ledgerKv("2026-10-12")]: { rows: [] }, [LEDGER_INDEX_KV]: { dates: ["2026-10-09", "2026-10-12"] } }, { failRead: new Set([LEDGER_INDEX_KV]) });
  await recordSnapshot(store, { date: "2026-10-13", engine: "x", sha256: "y", rows: [{ t: "A" }] });
  assert.deepEqual(store.kv.get(LEDGER_INDEX_KV).dates, ["2026-10-09", "2026-10-12", "2026-10-13"]);
});

test("không ghi đè bản chụp đã có, dù mục lục thiếu ngày đó; mục lục được khôi phục", async () => {
  const old = { date: "2026-10-09", rows: [{ t: "OLD" }] };
  const store = fakeStore({ [ledgerKv("2026-10-09")]: old });
  assert.deepEqual(await recordSnapshot(store, { date: "2026-10-09", engine: "x", sha256: "y", rows: [{ t: "NEW" }] }), { written: false, rows: 0 });
  assert.equal(store.kv.get(ledgerKv("2026-10-09")).rows[0].t, "OLD");
  assert.deepEqual(store.kv.get(LEDGER_INDEX_KV).dates, ["2026-10-09"]);
});

test("kho không liệt kê được: vẫn hoạt động theo mục lục", async () => {
  const kv = new Map([["i", { dates: ["2026-10-09"] }]]);
  const r = await loadLedgerIndex({ getKv: async (k) => (kv.has(k) ? { value: kv.get(k) } : null) }, "i", "p:");
  assert.deepEqual(r.dates, ["2026-10-09"]);
  assert.equal(r.healed, false);
});

test("kho cục bộ liệt kê đúng khoá theo tiền tố, kể cả ký tự đặc biệt", async () => {
  const store = createLocalStore({ dir: null });
  await store.setKv("cycles:ledger:2026-10-09", { rows: [] });
  await store.setKv("cycles:ledger:index", { dates: [] });
  await store.setKv("alpha:snap:2026-10-15", { rows: [] });
  const r = await loadLedgerIndex(store, "cycles:ledger:index", "cycles:ledger:");
  assert.deepEqual(r.dates, ["2026-10-09"]);
  assert.equal(r.healed, true);
});

test("phiên thiếu trong sổ: chỉ tính giữa ngày đầu và ngày cuối", () => {
  const cal = ["2026-10-22", "2026-10-23", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"];
  assert.deepEqual(missingSessions(["2026-10-23", "2026-10-27", "2026-10-28"], cal), ["2026-10-26"]);
  assert.deepEqual(missingSessions([], cal), []);
  assert.deepEqual(missingSessions(["2026-10-23"], cal), []);
});

test("dữ liệu chưa có phiên vừa đóng thì báo lỗi để thử lại; đủ thì không", () => {
  const afterClose = Date.parse("2026-10-26T09:10:00Z"); // 16:10 giờ VN, thứ Hai
  assert.throws(() => assertLatestSession("2026-10-23", "job", afterClose), /chưa có phiên 2026-10-26/);
  assert.doesNotThrow(() => assertLatestSession("2026-10-26", "job", afterClose));
  const sunday = Date.parse("2026-11-01T09:10:00Z");
  assert.doesNotThrow(() => assertLatestSession("2026-10-30", "job", sunday));
});
