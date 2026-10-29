// Sinh bộ dữ liệu khớp ngữ nghĩa bộ lọc Elite giữa Gateway (JS) và giao diện (TS):
//   node scripts/elite-filter-parity.mjs ../src/lib/elite10/__fixtures__/elite-filter-parity.json
import fs from "node:fs";
import { evaluateFilter } from "../src/market/elite/filterEngine.js";

let s = 20261030;
const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const sectors = ["8300", "8600", "2300"];
const rows = Array.from({ length: 40 }, (_, i) => ({
  ticker: `T${String(i).padStart(2, "0")}`, icb: { l2: sectors[i % 3] }, sector: null,
  values: {
    stealth20: i % 9 === 0 ? null : Math.round((rnd() * 6 - 3) * 100) / 100,
    stealth5: Math.round((rnd() * 6 - 3) * 100) / 100,
    top20_alpha: Math.round(rnd() * 100),
    sepa_s2: i % 7 === 0 ? 1 : 0,
    sepa_state: [2, 1, 0.5, 0, -0.5, -1][i % 6],
    rrg_quadrant: [2, 1, -1, -2][i % 4],
    ws_sector_alpha: Math.round((rnd() * 4 - 2) * 10) / 10,
  },
}));
const scores = Object.fromEntries(rows.map((r, i) => [r.ticker, { eligible: i % 5 !== 0, advBn: Math.round(rnd() * 80), close: 5000 + Math.round(rnd() * 90000) }]));
const buyZone = ["T03", "T11", "T20"];
const filters = [
  { v: 1, conds: [{ sig: "stealth20", op: ">=", val: 1.5 }], mode: "all" },
  { v: 1, conds: [{ sig: "stealth20", op: "p>=", val: 70 }, { sig: "stealth5", op: "p>=", val: 70 }, { sig: "top20_alpha", op: "p>=", val: 70 }, { sig: "sepa_s2", op: "==", val: 1 }, { sig: "ws_sector_alpha", op: ">=", val: 0 }], mode: "k", k: 2 },
  { v: 1, conds: [{ sig: "stealth5", op: "p>=", val: 60, neutral: true }], mode: "all", not: [{ sig: "rrg_quadrant", op: "in", val: [-2] }] },
  { v: 1, conds: [{ sig: "sepa_state", op: "in", val: [1, 2] }, { sig: "_adv", op: ">=", val: 20 }], mode: "all" },
  { v: 1, conds: [{ sig: "_buyzone", op: "==", val: 1 }], mode: "all", eligibleOnly: false },
  { v: 1, conds: [{ sig: "_price", op: "<=", val: 30000 }, { sig: "stealth20", op: "<=", val: -1 }], mode: "k", k: 1 },
];
const ctx = { rows, scores: new Map(Object.entries(scores)), buyZone: new Set(buyZone) };
const expected = filters.map((f) => { const r = evaluateFilter(f, ctx); return { pass: r.pass, perCond: r.perCond }; });
fs.writeFileSync(process.argv[2], JSON.stringify({ rows, scores, buyZone, filters, expected }));
console.log(expected.map((e) => e.pass.length).join(","));
