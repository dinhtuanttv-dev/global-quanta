// PX-r1 (prereg: backend/src/market/elite/PX-r1-prereg.md) — mua mới sau GDKHQ pha loãng ≥ 10%: chênh lệch 30 phiên so với đối chứng cùng ngày.
//   node backend/scripts/px-r1-eventstudy.mjs --px <thư mục OHLC VNDirect> --index <VNINDEX.json> --out <tệp json> [--from 2020-01-02 --to 2026-11-12 --split 2023-06-01]
// Dòng OHLC: [date, adOpen, adHigh, adLow, adClose, close, nmValue, nmVolume, ceiling, floor, basic] (giá nghìn đồng).
import fs from "node:fs";
const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const PX = arg("px"), IDX = arg("index"), OUT = arg("out");
const FROM = arg("from", "2020-01-02"), TO = arg("to", "2026-11-12"), SPLIT = arg("split", "2023-06-01");
const RULE = Object.freeze({ kMax: 1 / 1.1, kMin: 0.3, top: 300, minAdv: 5e9, hold: 30, entryOff: 1, crit: { mean: -0.01, t: -2 } });
if (!PX || !IDX || !OUT) { console.error("thiếu --px / --index / --out"); process.exit(1); }

const idx = JSON.parse(fs.readFileSync(IDX, "utf8")).filter((r) => r[4] > 0);
const days = idx.map((r) => r[0]), pos = new Map(days.map((d, i) => [d, i]));
const ser = new Map();
for (const f of fs.readdirSync(PX)) {
  let rows; try { rows = JSON.parse(fs.readFileSync(`${PX}/${f}`, "utf8")); } catch { continue; }
  const m = new Map(); for (const r of rows) if (r[4] > 0 && r[5] > 0 && pos.has(r[0])) m.set(pos.get(r[0]), { a: r[4], c: r[5], v: r[6] ?? 0 });
  if (m.size) ser.set(f.replace(/\.json$/, ""), m);
}
const adv20 = (m, i) => { let s = 0, n = 0; for (let k = i - 19; k <= i; k++) { const x = m.get(k); if (x) { s += x.v; n++; } } return n ? s / 20 : 0; };
const uniCache = new Map();
/** Vũ trụ tại phiên i: top 300 theo GTGD TB20 tính tới i, GTGD ≥ 5 tỷ. */
function universe(i) {
  if (uniCache.has(i)) return uniCache.get(i);
  const arr = []; for (const [t, m] of ser) { const a = adv20(m, i); if (a >= RULE.minAdv) arr.push([t, a]); }
  arr.sort((x, y) => y[1] - x[1]); const s = new Set(arr.slice(0, RULE.top).map(([t]) => t)); uniCache.set(i, s); return s;
}
const lr = (m, i, j) => { const x = m.get(i), y = m.get(j); return x && y ? Math.log(y.a / x.a) : null; };
const ctrlCache = new Map();
/** Đối chứng cùng ngày d: trung bình ln(P_{d+h}/P_d) của vũ trụ tại d. */
function control(d, h) {
  const key = `${d}:${h}`; if (ctrlCache.has(key)) return ctrlCache.get(key);
  let s = 0, n = 0; for (const t of universe(d)) { const r = lr(ser.get(t), d, d + h); if (r != null) { s += r; n++; } }
  const v = n ? s / n : null; ctrlCache.set(key, v); return v;
}

const i0 = pos.get(days.find((d) => d >= FROM)), i1 = pos.get(days.filter((d) => d <= TO).at(-1));
const events = [];
for (const [t, m] of ser) for (let i = i0; i <= i1; i++) {
  const x = m.get(i), p = m.get(i - 1); if (!x || !p) continue;
  const k = (p.a / p.c) / (x.a / x.c); if (!(k <= RULE.kMax) || k < RULE.kMin) continue;
  if (!universe(i - 1).has(t)) continue;
  const e = { t, ex: days[i], k: +k.toFixed(4), dil: +(1 / k - 1).toFixed(4) };
  const mom = lr(m, i - 61, i - 1), mom0 = (() => { let s = 0, n = 0; for (const u of universe(i - 1)) { const r = lr(ser.get(u), i - 61, i - 1); if (r != null) { s += r; n++; } } return n ? s / n : null; })();
  e.mom60 = mom != null && mom0 != null ? +(mom - mom0).toFixed(5) : null;
  for (const off of [1, 5, 10]) for (const h of [10, 20, 30]) {
    const d = i + off; if (d + h > days.length - 1) continue;
    const r = lr(m, d, d + h), c = control(d, h); if (r != null && c != null) e[`x${off}_${h}`] = +(r - c).toFixed(6);
  }
  if (e[`x${RULE.entryOff}_${RULE.hold}`] != null) events.push(e);
}
function stats(list, key) {
  const v = list.filter((e) => Number.isFinite(e[key])); if (v.length < 3) return { n: v.length };
  const byM = new Map(); for (const e of v) byM.set(e.ex.slice(0, 7), [...(byM.get(e.ex.slice(0, 7)) ?? []), e[key]]);
  const ms = [...byM.values()].map((a) => a.reduce((s, y) => s + y, 0) / a.length), mu = ms.reduce((s, y) => s + y, 0) / ms.length;
  const sd = Math.sqrt(ms.reduce((s, y) => s + (y - mu) ** 2, 0) / Math.max(1, ms.length - 1));
  const s = v.map((e) => e[key]).sort((a, b) => a - b);
  return { n: v.length, months: ms.length, mean: v.reduce((a, e) => a + e[key], 0) / v.length, median: s[Math.floor(s.length / 2)], pos: v.filter((e) => e[key] > 0).length / v.length, tMonth: sd > 0 && ms.length > 1 ? mu / (sd / Math.sqrt(ms.length)) : null };
}
const K = `x${RULE.entryOff}_${RULE.hold}`;
const all = stats(events, K), h1 = stats(events.filter((e) => e.ex < SPLIT), K), h2 = stats(events.filter((e) => e.ex >= SPLIT), K);
const c1 = all.mean <= RULE.crit.mean, c2 = all.tMonth != null && all.tMonth <= RULE.crit.t, c3 = h1.mean < 0 && h2.mean < 0;
const momQ = events.map((e) => e.mom60).filter((x) => x != null).sort((a, b) => a - b), hiMom = momQ[Math.floor(momQ.length * 2 / 3)];
const secondary = {};
for (const off of [1, 5, 10]) for (const h of [10, 20, 30]) secondary[`ex+${off}·${h}p`] = stats(events, `x${off}_${h}`);
secondary["động lượng mạnh (phần ba trên)"] = stats(events.filter((e) => e.mom60 != null && e.mom60 >= hiMom), K);
secondary["động lượng còn lại"] = stats(events.filter((e) => e.mom60 != null && e.mom60 < hiMom), K);
const superShare = events.filter((e) => e[K] > 0.2).length / Math.max(1, events.length);
const result = { prereg: "backend/src/market/elite/PX-r1-prereg.md", ranAt: new Date().toISOString(), rule: RULE, period: { from: FROM, to: TO, split: SPLIT },
  primary: { all, firstHalf: h1, secondHalf: h2 }, criteria: { c1, c2, c3, pass: c1 && c2 && c3 }, secondary, superShare, events };
fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
const pc = (x) => (x == null ? "—" : `${(x * 100).toFixed(2)}%`), f = (s) => `n ${s.n} · TB ${pc(s.mean)} · trung vị ${pc(s.median)} · dương ${s.pos != null ? (s.pos * 100).toFixed(0) + "%" : "—"} · t(tháng) ${s.tMonth != null ? s.tMonth.toFixed(2) : "—"} (${s.months ?? 0} tháng)`;
console.log(`=== PX-r1 · GDKHQ ${FROM} → ${TO} · pha loãng ≥ 10% · vào đóng cửa ex+${RULE.entryOff}, giữ ${RULE.hold} phiên, so đối chứng cùng ngày ===`);
console.log(`Toàn giai đoạn: ${f(all)}`);
console.log(`Nửa 1 (< ${SPLIT}): ${f(h1)}`);
console.log(`Nửa 2 (≥ ${SPLIT}): ${f(h2)}`);
console.log(`Tiêu chí: 1 TB ≤ −1,0% ${c1 ? "✓" : "✗"} · 2 t ≤ −2 ${c2 ? "✓" : "✗"} · 3 âm ở cả hai nửa ${c3 ? "✓" : "✗"} -> ${c1 && c2 && c3 ? "ĐẠT" : "KHÔNG ĐẠT"}`);
console.log("Phụ (không quyết định):"); for (const [k, s] of Object.entries(secondary)) console.log(`  ${k.padEnd(32)} ${f(s)}`);
console.log(`  "siêu cổ phiếu" (X > +20%): ${pc(superShare)}`);
