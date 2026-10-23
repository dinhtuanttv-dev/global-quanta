import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { isLocalOnlyTable } from "../src/market/store/localFirstStore.js";
import { createElliottLedger, LEDGER_TABLE, outcomeOf } from "../src/market/elliott/scenarioLedger.js";

const day = (i) => new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10);
function series(n, seed = 5) {
  let x = 100;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  return Array.from({ length: n }, (_, i) => { x *= 1 + (rnd() - 0.48) * 0.05; return { date: day(i), open: x, high: x * 1.01, low: x * 0.99, close: x, volume: 1 }; });
}

test("kết quả chấm điểm: đạt MT1 trước vô hiệu = hit; vô hiệu sau kích hoạt = miss; chưa kích hoạt / chưa xong = null", () => {
  assert.equal(outcomeOf([{ type: "triggered" }, { type: "target1" }, { type: "invalidated" }]), "hit");
  assert.equal(outcomeOf([{ type: "triggered" }, { type: "invalidated" }]), "miss");
  assert.equal(outcomeOf([{ type: "invalidated" }]), null);
  assert.equal(outcomeOf([{ type: "triggered" }]), null);
});

test("sổ: ghi kịch bản đã xác nhận, không ghi trùng, chỉ tính nến SAU ngày ghi sổ; tóm tắt 'chưa đủ mẫu'", async () => {
  const store = createMemoryStore();
  await store.setKv("scanner:universe", { tickers: [{ ticker: "AAA" }, { ticker: "BBB" }] });
  const full = { AAA: series(700, 5), BBB: series(700, 9), VNINDEX: series(700, 13) };
  let upTo = 600;
  const taSeries = { get: async ({ symbol }) => ({ bars: full[symbol].slice(0, upTo) }) };
  let now = new Date(`${day(599)}T09:30:00Z`);
  const L = createElliottLedger({ store, taSeries, now: () => now, log: { warn() {} } });
  const r1 = await L.run();
  assert.equal(r1.symbols, 3);
  const rows1 = await store.selectRows(LEDGER_TABLE, {});
  assert.ok(rows1.length > 0, "phải ghi được kịch bản");
  for (const r of rows1) {
    assert.equal(r.doc.loggedAt, day(599));
    assert.equal(r.doc.scenario.provisional, false);
    assert.deepEqual(r.doc.events, []);               // ngày ghi sổ: chưa có sự kiện được tính
    assert.ok(["primary", "secondary"].includes(r.doc.scenario.role));
  }
  // chạy lại cùng ngày: không trùng
  await L.run();
  assert.equal((await store.selectRows(LEDGER_TABLE, {})).length, rows1.length);
  // 40 phiên sau: vòng đời chỉ dùng nến sau ngày ghi sổ
  upTo = 640; now = new Date(`${day(639)}T09:30:00Z`);
  await L.run();
  for (const r of await store.selectRows(LEDGER_TABLE, {})) for (const e of r.doc.events) assert.ok(e.time > r.doc.loggedAt, `${e.time} > ${r.doc.loggedAt}`);
  const s = await L.summary();
  assert.ok(s.total >= rows1.length);
  assert.equal(s.verdict, "chưa đủ mẫu");
  assert.equal(s.prereg.minN, 100);
  assert.equal((await L.forSymbol("AAA")).every((d) => d.scenario.id.startsWith("AAA|")), true);
});

test("bảng sổ chỉ ở kho cục bộ", () => assert.equal(isLocalOnlyTable(LEDGER_TABLE), true));
