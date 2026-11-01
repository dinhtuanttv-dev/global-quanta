import assert from "node:assert/strict";
import test from "node:test";
import { createLedgerBackup, packValue, unpackValue } from "../src/market/ledgerBackup.js";

const storeOf = (entries = {}) => {
  const kv = new Map(Object.entries(entries));
  return { kv, getKv: async (k) => (kv.has(k) ? { value: kv.get(k), updatedAt: "2026-11-01" } : null), setKv: async (k, v) => { kv.set(k, v); }, listKv: async (p) => [...kv.keys()].filter((k) => k.startsWith(p)) };
};
const redisOf = ({ corrupt = false } = {}) => {
  const db = new Map(), calls = [];
  const fetchImpl = async (_u, o) => {
    const c = JSON.parse(o.body); calls.push(c[0]);
    const result = c[0] === "SET" ? (db.set(c[1], c[2]), "OK") : c[0] === "GET" ? (corrupt ? "sai" : db.get(c[1]) ?? null) : ["0", [...db.keys()]];
    return { ok: true, status: 200, json: async () => ({ result }) };
  };
  return { db, calls, fetchImpl };
};
const make = (store, r, extra = {}) => createLedgerBackup({ store, url: "https://x", token: "t", fetchImpl: r.fetchImpl, notify: () => {}, ...extra });

test("nén rồi giải nén giữ nguyên nội dung", () => {
  const d = { value: { rows: [{ t: "FPT", p: 0.1 }] }, updatedAt: "x" };
  assert.deepEqual(unpackValue(packValue(d)), d);
});

test("chưa cấu hình thì bỏ qua, không gọi mạng", async () => {
  const r = redisOf();
  const out = await createLedgerBackup({ store: storeOf(), url: "", token: "", fetchImpl: r.fetchImpl }).backup();
  assert.match(out.skipped, /chưa cấu hình/);
  assert.equal(r.calls.length, 0);
});

test("chỉ đẩy khoá sổ theo dõi; khoá không đổi thì không đẩy lại, khoá đổi thì đẩy", async () => {
  const store = storeOf({ "cycles:ledger:2026-10-23": { rows: [1] }, "alpha:snap:2026-10-23": { rows: [2] }, "alpha:ic": { dates: [] }, "auth_users": { secret: 1 }, "scanner:latest": { x: 1 } });
  const r = redisOf(), b = make(store, r);
  const first = await b.backup();
  assert.equal(first.sent, 3);
  assert.deepEqual([...r.db.keys()].sort(), ["gq:ledger:alpha:ic", "gq:ledger:alpha:snap:2026-10-23", "gq:ledger:cycles:ledger:2026-10-23"]);
  const second = await b.backup();
  assert.equal(second.sent, 0); assert.equal(second.unchanged, 3);
  store.kv.set("alpha:ic", { dates: [1] });
  assert.equal((await b.backup()).sent, 1);
});

test("đọc lại không khớp thì báo lỗi và không ghi nhận đã sao lưu", async () => {
  const store = storeOf({ "alpha:ic": { dates: [] } });
  const alerts = [];
  const b = make(store, redisOf({ corrupt: true }), { notify: (k, t) => alerts.push(t) });
  await assert.rejects(() => b.backup(), /Sao lưu lỗi 1 khoá/);
  assert.equal(alerts.length, 1);
  assert.deepEqual(store.kv.get("local:ledger-backup").hashes, {});
});

test("khôi phục chỉ nạp khoá thiếu, không ghi đè khoá đang có", async () => {
  const src = storeOf({ "cycles:ledger:2026-10-23": { rows: ["cũ"] }, "cycles:ledger:2026-10-27": { rows: ["sao lưu"] } });
  const r = redisOf();
  await make(src, r).backup();
  const dst = storeOf({ "cycles:ledger:2026-10-27": { rows: ["đang có"] } });
  const out = await make(dst, r).restoreMissing();
  assert.deepEqual(out.restored, ["cycles:ledger:2026-10-23"]);
  assert.deepEqual(dst.kv.get("cycles:ledger:2026-10-23"), { rows: ["cũ"] });
  assert.deepEqual(dst.kv.get("cycles:ledger:2026-10-27"), { rows: ["đang có"] });
});
