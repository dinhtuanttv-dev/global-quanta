import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { evaluateFilter, filterHash, percentiles, sanitizeFilter } from "../src/market/elite/filterEngine.js";
import { buildDecision, constructPortfolio } from "../src/market/elite/decisionCore.js";
import { createUserFilters } from "../src/market/elite/userFilters.js";

const fx = JSON.parse(fs.readFileSync(new URL("../../src/lib/elite10/__fixtures__/elite-filter-parity.json", import.meta.url), "utf8"));
const ctx = { rows: fx.rows, scores: new Map(Object.entries(fx.scores)), buyZone: new Set(fx.buyZone) };

test("Bộ lọc Elite: kết quả cố định của bộ dữ liệu khớp (giao diện TS dùng cùng tệp)", () => {
  fx.filters.forEach((f, i) => assert.deepEqual(evaluateFilter(f, ctx).pass, fx.expected[i].pass, `bộ lọc ${i}`));
});

test("Bộ lọc Elite: ngưỡng, k/n, loại trừ, phân vị trung lập ngành, giá trị thiếu không đạt, chỉ mã đủ điều kiện", () => {
  const rows = [
    { ticker: "A", icb: { l2: "X" }, values: { s: 3, q: 2 } }, { ticker: "B", icb: { l2: "X" }, values: { s: 1, q: -2 } },
    { ticker: "C", icb: { l2: "Y" }, values: { s: 2, q: 1 } }, { ticker: "D", icb: { l2: "Y" }, values: { s: null, q: 1 } },
  ];
  const scores = new Map(["A", "B", "C", "D"].map((t) => [t, { eligible: t !== "C" }]));
  const ev = (f) => evaluateFilter(f, { rows, scores }).pass;
  assert.deepEqual(ev({ conds: [{ sig: "s", op: ">=", val: 1 }] }), ["A", "B"]); // C không đủ điều kiện, D thiếu giá trị
  assert.deepEqual(ev({ conds: [{ sig: "s", op: ">=", val: 1 }], eligibleOnly: false }), ["A", "B", "C"]);
  assert.deepEqual(ev({ conds: [{ sig: "s", op: ">=", val: 9 }, { sig: "q", op: ">=", val: 1 }], mode: "k", k: 1 }), ["A", "D"]);
  assert.deepEqual(ev({ conds: [{ sig: "q", op: ">=", val: -9 }], not: [{ sig: "q", op: "in", val: [-2] }] }), ["A", "D"]);
  // trung lập ngành: C là mã duy nhất có giá trị trong ngành Y -> hạng giữa 50
  assert.equal(percentiles(rows, "s", (r) => r.icb.l2).get("C"), 50);
  assert.ok(Math.abs(percentiles(rows, "s").get("A") - (100 * 2.5) / 3) < 1e-9);
});

test("Bộ lọc Elite: làm sạch đầu vào (tín hiệu lạ / phép toán sai bị bỏ), băm ổn định theo nội dung", () => {
  const f = sanitizeFilter({ name: "x".repeat(99), conds: [{ sig: "stealth20", op: ">=", val: 1.5 }, { sig: "evil", op: ">=", val: 1 }, { sig: "stealth5", op: "eval", val: 1 }, { sig: "_adv", op: ">=", val: "1" }], mode: "k", k: 9 }, new Set(["stealth20", "stealth5"]));
  assert.equal(f.conds.length, 1);
  assert.equal(f.k, 1);
  assert.equal(f.name.length, 60);
  assert.equal(filterHash({ a: 1, b: [{ x: 1 }] }), filterHash({ b: [{ x: 1 }], a: 1 }));
  assert.notEqual(filterHash({ a: 1, b: [{ x: 1 }] }), filterHash({ a: 1, b: [{ x: 2 }] }));
});

function world() {
  const cal = Array.from({ length: 140 }, (_, i) => new Date(Date.UTC(2026, 4, 1) + i * 86_400_000).toISOString().slice(0, 10));
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const tickers = Array.from({ length: 30 }, (_, i) => `M${String(i).padStart(2, "0")}`);
  const prices = new Map(tickers.map((t) => { let p = 20000; return [t, cal.map((date) => ({ date, closeAdj: (p *= Math.exp((rnd() - 0.5) * 0.04)), value: 30e9 }))]; }));
  const rows = tickers.map((t, i) => ({ ticker: t, icb: { l2: ["A", "B", "C", "D", "E"][i % 5] }, values: { stealth20: (i % 10) / 3 - 1, stealth5: ((i * 7) % 10) / 3 - 1 } }));
  const evidence = { signals: [{ id: "stealth20", tier: "A", mainH: 5, byH: { 5: { n: 0 } } }, { id: "stealth5", tier: "A", mainH: 5, byH: { 5: { n: 0 } } }] };
  return { cal, prices, rows, evidence, date: cal[cal.length - 1] };
}

test("constructPortfolio = danh mục của buildDecision (tách hàm không đổi kết quả chính thức)", () => {
  const w = world();
  const d = buildDecision({ panel: { date: w.date, rows: w.rows }, evidence: w.evidence, prices: w.prices, cal: w.cal });
  assert.ok(d.portfolio.length > 0);
  assert.deepEqual(constructPortfolio({ scores: d.scores, prices: w.prices, date: w.date }).portfolio, d.portfolio);
});

test("Sổ bộ lọc cá nhân: chỉ ghi phiên dựng SAU khi lưu (không hồi cứu); danh mục chỉ gồm mã đạt bộ lọc", async () => {
  const w = world();
  const kv = new Map();
  const store = { getKv: async (k) => (kv.has(k) ? { value: kv.get(k) } : null), setKv: async (k, v) => { kv.set(k, v); } };
  const t = Date.parse(`${w.date}T12:00:00Z`);
  const uf = createUserFilters({ store, now: () => t });
  await uf.save("u1", { filter: { conds: [{ sig: "stealth20", op: ">=", val: 0.5 }] } }, new Set(["stealth20", "stealth5"]));
  const d = buildDecision({ panel: { date: w.date, rows: w.rows }, evidence: w.evidence, prices: w.prices, cal: w.cal });
  const px = new Map();
  for (const [tk, l] of w.prices) for (const r of l) px.set(`${tk}|${r.date}`, r.closeAdj);
  const run = (builtAt) => uf.updateLedgers({ panel: { rows: w.rows }, doc: { ...d, builtAt }, prices: w.prices, px, cal: w.cal, vn: new Map(), buyZone: new Set() });
  await run(new Date(t - 3600_000).toISOString()); // dựng TRƯỚC khi lưu -> không ghi
  assert.equal((await uf.get("u1")).ledger, null);
  await run(new Date(t + 3600_000).toISOString());
  const g = await uf.get("u1");
  assert.equal(g.ledger.entries.length, 1);
  const passing = new Set(w.rows.filter((r) => r.values.stealth20 >= 0.5).map((r) => r.ticker));
  assert.ok(g.ledger.entries[0].holdings.length > 0 && g.ledger.entries[0].holdings.length <= 10);
  assert.ok(g.ledger.entries[0].holdings.every((h) => passing.has(h.ticker)));
  await run(new Date(t + 7200_000).toISOString()); // dựng lại cùng phiên -> không ghi trùng
  assert.equal((await uf.get("u1")).ledger.entries.length, 1);
  assert.ok([...kv.keys()].every((k) => k.startsWith("local:")));
});
