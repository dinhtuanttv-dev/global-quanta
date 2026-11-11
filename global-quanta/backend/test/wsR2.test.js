// WS-r2 (WS-r2-prereg.md): hàm thuần của H5 / H6 / H7.
import test from "node:test";
import assert from "node:assert/strict";
import { holm, sectorReturns, slope, stockMatrix, testH5, testH6, testH7, verdict, wave, WS_R2 } from "../src/market/worldSectors/wsR2.js";

const days = (n) => { const out = []; for (let d = Date.UTC(2019, 0, 1); out.length < n; d += 864e5) { const w = new Date(d).getUTCDay(); if (w && w < 6) out.push(new Date(d).toISOString().slice(0, 10)); } return out; };
function rng(seed = 9) { let s = seed; const u = () => { s = (s * 1103515245 + 12345) % 2147483648; return (s + 0.5) / 2147483648; }; return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()); }

/** 12 ngành × 6 mã, 400 phiên. kind: "lag" — lợi suất ngành phiên d+1..d+10 theo S[d]; "intraday" — trong phiên d theo S[d]; "none". */
function world(kind) {
  const g = rng(kind === "none" ? 3 : 9), D = days(400), S = {}, raw = {}, sectorOf = {};
  D.forEach((d) => { S[d] = Object.fromEntries(Array.from({ length: 12 }, (_, s) => [`S${s}`, g()])); });
  const vn = Float64Array.from(D, () => 1000);
  for (let s = 0; s < 12; s++) for (let j = 0; j < 6; j++) {
    const t = `S${s}T${j}`; sectorOf[t] = `S${s}`;
    let c = 100; const rows = [];
    D.forEach((d, i) => {
      // "lag": mã j nhạy (1 + j) lần — cùng phiên (để ước b) và trễ 1..10 phiên (cái H5/H6 cần bắt).
      let lag = 0; if (kind === "lag") { lag += 0.001 * (1 + j) * S[d][`S${s}`]; for (let k = 1; k <= 10 && i - k >= 0; k++) lag += 0.0004 * (1 + j) * S[D[i - k]][`S${s}`]; }
      const intra = kind === "intraday" ? 0.004 * S[d][`S${s}`] : 0;
      const o = c * Math.exp(0.004 * g());
      c = o * Math.exp(intra + lag + 0.01 * g());
      rows.push({ date: d, adOpen: o, adClose: c, nmValue: 5e9 });
    });
    raw[t] = rows;
  }
  return { D, S, raw, sectorOf, vn };
}
const cfg = { ...WS_R2, betaWin: 120, betaMin: 80, minStocks: 30, minSectors: 10 };

test("nonOverlapT: trung vị t trên 10 chuỗi lệch pha", async () => {
  const { nonOverlapT } = await import("../src/market/worldSectors/wsR2.js");
  const r = nonOverlapT(Array.from({ length: 200 }, (_, k) => 0.05 + (k % 7) * 0.01 - 0.03));
  assert.equal(r.offsets, 10); assert.ok(r.tMed > 2 && r.pNo < 0.05);
  assert.deepEqual(nonOverlapT([0.1, 0.2]), { tMed: null, pNo: 1, offsets: 0 });
});

test("wave / slope / holm / verdict", () => {
  const D = days(6), S = Object.fromEntries(D.map((d, i) => [d, { A: i + 1 }]));
  assert.equal(wave(S, D, 4, "A"), 15); assert.equal(wave(S, D, 3, "A"), null); assert.equal(wave({ ...S, [D[2]]: {} }, D, 4, "A"), null);
  assert.ok(Math.abs(slope([1, 2, 3, 4], [2, 4, 6, 8]) - 2) < 1e-12); assert.equal(slope([1, 1], [2, 3]), null);
  assert.deepEqual(holm([0.01, 0.04, 0.03]), [0.03, 0.06, 0.06]);
  const v = verdict({ H5: { mean: 0.02, p: 0.001, halves: [0.01, 0.02] }, H6: { mean: 0.02, p: 0.001, halves: [-0.01, 0.03] }, H7: { mean: -0.01, p: 0.9, halves: [0, 0] } });
  assert.deepEqual([v.H5.pass, v.H6.pass, v.H7.pass], [true, false, false]); // H6 trượt vì nửa đầu âm
});

test("H7 bắt được truyền dẫn trong phiên; H5/H6 không bịa tín hiệu khi không có trễ", () => {
  const w = world("intraday"), M = stockMatrix(w.raw, w.D);
  const h7 = testH7({ S: w.S, days: w.D, M, sectorOf: w.sectorOf, from: w.D[25], to: w.D.at(-1), cfg });
  assert.ok(h7.mean > 0.2 && h7.t > 5, `H7 IC ${h7.mean} t ${h7.t}`); assert.ok(h7.tercileSpread > 0);
  const R = sectorReturns(M, w.sectorOf, w.D, cfg);
  const h5 = testH5({ S: w.S, days: w.D, R, vn: w.vn, from: w.D[30], to: w.D.at(-1), cfg });
  assert.ok(Math.abs(h5.mean) < 0.1 && Math.abs(h5.t) < 2, `H5 không có trễ: ${h5.mean} t không chồng lấp ${h5.t} (NW ${h5.tNw})`);
});

test("H5 / H6 bắt được trễ 10 phiên khi có thật; vũ trụ lọc thanh khoản", () => {
  const w = world("lag"), M = stockMatrix(w.raw, w.D);
  const R = sectorReturns(M, w.sectorOf, w.D, cfg);
  assert.equal(Object.keys(R[w.D[30]]).length, 12);
  const h5 = testH5({ S: w.S, days: w.D, R, vn: w.vn, from: w.D[30], to: w.D.at(-1), cfg });
  assert.ok(h5.mean > 0.2 && h5.t > 3 && h5.offsets === 10, `H5 IC ${h5.mean} t ${h5.t}`);
  const h6 = testH6({ S: w.S, days: w.D, M, sectorOf: w.sectorOf, vn: w.vn, from: w.D[130], to: w.D.at(-1), cfg });
  assert.ok(h6.n > 100 && h6.mean > 0.1, `H6 IC ${h6.mean} n ${h6.n}`);
  const thin = stockMatrix(Object.fromEntries(Object.entries(w.raw).map(([t, rows]) => [t, rows.map((r) => ({ ...r, nmValue: 1e8 }))])), w.D);
  assert.equal(Object.keys(sectorReturns(thin, w.sectorOf, w.D, cfg)[w.D[30]]).length, 0);
});
