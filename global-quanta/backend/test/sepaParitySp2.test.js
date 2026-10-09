// SEPA SP2 — đối chiếu cơ bản / dẫn dắt / sức khỏe thị trường / run_screen (điểm SEPA + 4 danh sách) với chuẩn Python.
// Tạo lại chuẩn: python -I test/fixtures/sepa/oracle_sp2.py <thư mục sepa_screener> test/fixtures/sepa/oracle_sp2.json.gz
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { SEPA, analyzeFundamentals, runSepaScreen } from "../src/market/strategies/sepa/index.js";

const O = JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/sepa/oracle_sp2.json.gz", import.meta.url))).toString("utf8"));
const CFG = { ...SEPA, risk: { ...SEPA.risk, riskPerTrade: 0.0125 } };

function diff(exp, act, path, out) {
  if (out.length > 30) return;
  if (exp === null) { if (!(act === null || act === undefined || Number.isNaN(act))) out.push(`${path}: kỳ vọng null, có ${JSON.stringify(act)}`); return; }
  if (exp === "Infinity" || exp === "-Infinity") { if (act !== (exp === "Infinity" ? Infinity : -Infinity)) out.push(`${path}: kỳ vọng ${exp}, có ${act}`); return; }
  if (typeof exp === "number") { if (typeof act !== "number" || !(Math.abs(exp - act) <= 1e-9 * Math.max(1, Math.abs(exp)))) out.push(`${path}: kỳ vọng ${exp}, có ${act}`); return; }
  if (Array.isArray(exp)) {
    if (!Array.isArray(act) || act.length !== exp.length) { out.push(`${path}: độ dài ${exp.length} ≠ ${act?.length}: ${JSON.stringify(act)?.slice(0, 160)}`); return; }
    exp.forEach((e, i) => diff(e, act[i], `${path}[${i}]`, out)); return;
  }
  if (typeof exp === "object") {
    if (!act || typeof act !== "object") { out.push(`${path}: kỳ vọng object, có ${JSON.stringify(act)}`); return; }
    for (const k of new Set([...Object.keys(exp), ...Object.keys(act)])) diff(exp[k] ?? null, act[k], `${path}.${k}`, out);
    return;
  }
  if (exp !== act) out.push(`${path}: kỳ vọng ${JSON.stringify(exp)}, có ${JSON.stringify(act)}`);
}
const fundPy = (f) => ({ score: f.score, passed_min: f.passedMin, flags: f.flags, metrics: f.metrics, warnings: f.warnings, positives: f.positives });
const toBars = (s) => s.date.map((date, i) => ({ date, open: s.open[i], high: s.high[i], low: s.low[i], close: s.close[i], volume: s.volume[i] }));

test(`cơ bản (Chương 7–8): ${O.fund.length} bộ quý — mẫu sách, số âm, quý thiếu, doanh thu 0, ước tính, khoản bất thường`, () => {
  const errs = [];
  for (const c of O.fund) diff(c.res, fundPy(analyzeFundamentals(c.q)), c.name, errs);
  assert.deepEqual(errs, []);
});

test("ví dụ sách [s.171]: EPS 3,01 có 0,84 bất thường -> EPS điều chỉnh 2,17, giảm ~10% so với 2,40", () => {
  const c = O.fund.find((x) => x.name === "nonrec");
  const r = analyzeFundamentals(c.q);
  assert.ok(Math.abs(r.metrics.EPS_gan_nhat - (2.17 / 2.4 - 1)) < 1e-6);
});

for (const scr of O.screens) {
  test(`run_screen ${scr.universe} @ ${scr.as_of}: danh sách, điểm SEPA, bộ lọc, cảnh báo, dẫn dắt, cơ bản, thị trường`, () => {
    const U = O.universes[scr.universe];
    const prices = new Map(Object.entries(U.prices).map(([k, s]) => [k, toBars(s)]));
    const fundamentals = new Map(Object.entries(U.fund));
    const meta = new Map(Object.entries(U.meta).map(([k, v]) => [k, { listingDate: v }]));
    const r = runSepaScreen({ prices, index: toBars(U.index), fundamentals, meta, cfg: CFG, minAvgValue: 0, equity: 1e9, asOf: scr.as_of });
    const errs = [];
    let nanScore = false;
    for (const [sym, e] of Object.entries(scr.rows)) {
      const a = r.results[sym];
      if (!a) { errs.push(`${sym}: thiếu kết quả`); continue; }
      const where = `${scr.universe}@${scr.as_of}.${sym}`;
      if (e.diem_SEPA === null) { nanScore = true; assert.equal(a.rs, null, `${where}: RS NaN của Python -> null`); }
      else diff(e.diem_SEPA, a.diemSepa, `${where}.diem_SEPA`, errs);
      diff({ danh_sach: e.danh_sach, so_bo_loc_dat: e.so_bo_loc_dat, bo_loc: e.bo_loc, canh_bao: e.canh_bao, rs: e.rs, best: e.best },
        { danh_sach: a.danhSach, so_bo_loc_dat: a.soBoLocDat, bo_loc: a.boLoc, canh_bao: a.warnings, rs: a.rs, best: a.best?.name ?? null }, where, errs);
      diff(e.dan_dat, a.lead, `${where}.dan_dat`, errs);
      diff(e.co_ban, fundPy(a.fund), `${where}.co_ban`, errs);
    }
    assert.equal(Object.keys(r.results).length, Object.keys(scr.rows).length);
    if (!nanScore) assert.deepEqual(r.order, scr.order);
    diff(scr.market, r.market, `${scr.universe}@${scr.as_of}.market`, errs);
    assert.deepEqual(errs, []);
  });
}

test("đủ trạng thái: 4 danh sách và cả THẬN TRỌNG / BẤT LỢI xuất hiện trong chuẩn", () => {
  const b = new Set(O.screens.flatMap((s) => Object.values(s.rows).map((r) => r.danh_sach)));
  for (const k of ["SẴN SÀNG MUA", "CẢNH BÁO MUA", "THEO DÕI", "LOẠI"]) assert.ok(b.has(k), k);
  const m = new Set(O.screens.map((s) => s.market.danh_gia));
  assert.ok(m.has("THẬN TRỌNG") && m.has("BẤT LỢI"));
});
