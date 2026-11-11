// EPS-v1 (P0 kiểm toán BCTC): EPS 12 tháng + số cổ phiếu theo kỳ — chọn nguồn, không bao giờ trả 0 thay "không có", tải gộp, giữ bản cũ.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { actionFactor, createSharesEps, fetchRatioHistory, latestValue, postPeriodActions, rightsPrice, selectEps, sharesAt, valueAsOf, valueAt } from "../src/market/fundamentals/sharesEps.js";
import { pitFeatures } from "../src/market/events/factorModel.js";

// ACB thật (VNDirect 07/11/2026): LNST mẹ 12 tháng 16.096 tỷ, 5,804 tỷ CP, EPS_TR quý 3/2026 = 2.773,1 đ (Gateway cũ: 542 đ).
const sharesACB = [["2025-03-31", 4466657912], ["2025-06-30", 5136656599], ["2026-06-30", 5804421957], ["2026-12-31", 5804421957]];
const epsACB = [["2026-06-30", 2650.2], ["2026-09-30", 2773.125]];

test("selectEps: EPS_TR đúng quý -> nguồn VNDirect + đối chiếu với LNST / số CP", () => {
  const s = selectEps({ npatTtm: 16096388000000, quarterEnd: "2026-09-30", epsHist: epsACB, sharesHist: sharesACB, sumEps: 542, tpl: "bank" });
  assert.equal(s.eps, 2773); assert.equal(s.source, "VND_EPS_TR"); assert.equal(s.shares, 5804421957);
  assert.ok(Math.abs(s.check) < 0.001); // hai nguồn khớp
});

test("selectEps: thiếu EPS_TR đúng quý -> LNST mẹ / số CP hiện hành (không dùng EPS_TR quý khác)", () => {
  const s = selectEps({ npatTtm: 16096388000000, quarterEnd: "2026-12-31", epsHist: epsACB, sharesHist: sharesACB, tpl: "bank" });
  assert.equal(s.source, "NPAT_SHARES"); assert.equal(s.eps, Math.round(16096388000000 / 5804421957));
});

test("selectEps: ngân hàng thiếu cả hai -> null (không trả 0, không dùng tổng EPS quý); doanh nghiệp -> tổng EPS quý", () => {
  const none = selectEps({ npatTtm: null, quarterEnd: "2026-09-30", sumEps: 0, tpl: "bank" });
  assert.equal(none.eps, null); assert.equal(none.source, null); assert.equal(none.shares, null);
  assert.equal(selectEps({ npatTtm: null, quarterEnd: "2026-09-30", sumEps: 0, tpl: "corp" }).eps, null);
  const sq = selectEps({ npatTtm: null, quarterEnd: "2026-09-30", sumEps: 5315.4, tpl: "corp" });
  assert.equal(sq.eps, 5315); assert.equal(sq.source, "SUM_Q");
  assert.equal(selectEps({ npatTtm: -1e12, quarterEnd: "x", sharesHist: [["2026-01-01", 1e9]] }).eps, -1000); // lỗ: EPS âm là số thật
});

test("valueAsOf / valueAt / latestValue", () => {
  assert.equal(valueAsOf(sharesACB, "2025-12-31"), 5136656599);
  assert.equal(valueAsOf(sharesACB, "2024-12-31"), null);
  assert.equal(valueAt(epsACB, "2026-09-30"), 2773.125); assert.equal(valueAt(epsACB, "2026-08-31"), null);
  assert.equal(latestValue(sharesACB), 5804421957); assert.equal(latestValue([]), null);
});

test("fetchRatioHistory: gộp mã / lượt, thử lại khi 429, phân loại EPS / số CP, bỏ số CP ≤ 0", async () => {
  const calls = []; let n = 0;
  const fake = async (url) => {
    calls.push(url); n++;
    if (n === 1) return { ok: false, status: 429, json: async () => ({}) };
    const codes = decodeURIComponent(url).match(/code:([A-Z0-9,]+)~/)[1].split(",");
    return { ok: true, status: 200, json: async () => ({ data: codes.flatMap((c) => [
      { code: c, ratioCode: "EPS_TR", reportDate: "2026-09-30", value: 100 }, { code: c, ratioCode: "OUTSTANDING_SHARES", reportDate: "2026-09-30", value: 1e9 },
      { code: c, ratioCode: "OUTSTANDING_SHARES", reportDate: "2026-06-30", value: 0 }]) }) };
  };
  const r = await fetchRatioHistory(["AAA", "BBB", "CCC"], { fetchImpl: fake, chunk: 2, log: {} });
  assert.equal(calls.length, 3); // lượt 1 bị 429 -> thử lại, rồi lượt 2
  assert.deepEqual(Object.keys(r.byTicker).sort(), ["AAA", "BBB", "CCC"]);
  assert.deepEqual(r.byTicker.AAA, { eps: [["2026-09-30", 100]], shares: [["2026-09-30", 1e9]] });
  assert.deepEqual(r.failed, []);
});

test("createSharesEps: mã lỗi lượt sau giữ bản cũ", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eps-"));
  let fail = false;
  const fake = async (url) => (fail && url.includes("BBB") ? { ok: false, status: 500, json: async () => ({}) }
    : { ok: true, status: 200, json: async () => ({ data: decodeURIComponent(url).match(/code:([A-Z0-9,]+)~/)[1].split(",").map((c) => ({ code: c, ratioCode: "EPS_TR", reportDate: "2026-09-30", value: fail ? 2 : 1 })) }) });
  const s = createSharesEps({ dir, universe: async () => ["AAA"], fetchImpl: fake, log: {} });
  await s.refresh(); assert.equal(s.of("AAA").eps[0][1], 1);
  const s2 = createSharesEps({ dir, universe: async () => ["AAA", "BBB"], fetchImpl: async (u) => (u.includes("BBB") ? { ok: false, status: 500, json: async () => ({}) } : fake(u)), log: {} });
  fail = true; const r = await s2.refresh();
  assert.equal(r.failed, 2); assert.equal(s2.of("AAA").eps[0][1], 1); // cả lượt lỗi -> giữ bản cũ của AAA
});

test("pitFeatures: vốn hoá dùng số CP theo kỳ tại cuối quý BCTC mới nhất đã công bố (không nhìn trước)", () => {
  const q = (fiscal, npat) => ({ fiscal, created: null, v: { npatParent: npat, equity: 1e13, assets: 1e14 } }); // ngân hàng: KHÔNG có EPS quý
  const rec = { tpl: "bank", quarters: [q("2025-06-30", 1e12), q("2025-09-30", 1e12), q("2025-12-31", 1e12), q("2026-03-31", 1e12), q("2026-06-30", 1e12)], annual: [], sharesHist: sharesACB };
  const px = []; for (let d = Date.parse("2025-08-01T00:00:00Z"); px.length < 270; d += 864e5) { const w = new Date(d).getUTCDay(); if (w && w < 6) px.push([new Date(d).toISOString().slice(0, 10), 20, 20]); }
  const t = "2026-08-20"; // quý 2/2026 (hết 30/06) đã công bố (+45 ngày) -> số CP tại 30/06/2026
  const f = pitFeatures(rec, px.filter((r) => r[0] <= t), t);
  assert.ok(f, "có đặc trưng");
  assert.ok(Math.abs(f.earningsYield - 4e12 / (5804421957 * 20000)) < 1e-6);
  const noShares = pitFeatures({ ...rec, sharesHist: undefined }, px.filter((r) => r[0] <= t), t);
  assert.equal(noShares?.earningsYield ?? null, null); // cách cũ: ngân hàng không có EPS quý -> không tính được
});

// ── EPS-v2 (P1, IAS 33) — số liệu thật VNDirect / Gateway 11/11/2026 ──
const shTCB = [["2026-06-30", 7086e6], ["2026-09-30", 7086e6], ["2026-12-31", 10629e6]];
const evTCB = [{ cat: "BONUS", ex: "2024-06-20", ratio: 100 }, { cat: "STOCK", ex: "2026-10-29", ratio: 50, title: "Trả cổ tức năm 2025, tỷ lệ 100:50" }];

test("EPS-v2: cổ tức CP 50% GDKHQ sau quý -> EPS_TR ÷ 1,5 (TCB 4.042 -> 2.695); trước GDKHQ giữ nguyên", () => {
  const npat = 4042 * 7086e6;
  const a = selectEps({ npatTtm: npat, quarterEnd: "2026-09-30", epsHist: [["2026-09-30", 4041.6]], sharesHist: shTCB, tpl: "bank", events: evTCB, asOf: "2026-11-11" });
  assert.equal(a.eps, Math.round(4041.6 / 1.5)); assert.equal(a.epsQ, 4042); assert.equal(a.factor, 1.5); assert.equal(a.shares, 10629e6); assert.equal(a.basis, "Q_END_ADJ");
  assert.deepEqual(a.actions.map((x) => x.ex), ["2026-10-29"]); // đợt 2024 nằm trước quý -> đã có trong số CP cuối quý
  assert.ok(Math.abs(a.check) < 0.001); assert.equal(a.sharesGap, 0); assert.deepEqual(a.flags, []);
  const b = selectEps({ npatTtm: npat, quarterEnd: "2026-09-30", epsHist: [["2026-09-30", 4041.6]], sharesHist: shTCB, tpl: "bank", events: evTCB, asOf: "2026-10-28" });
  assert.equal(b.eps, 4042); assert.equal(b.factor, 1); assert.deepEqual(b.actions, []);
  assert.ok(b.sharesGap > 0.49 && b.flags.includes("SHARES_GAP")); // VNDirect đã ghi số CP sau đợt chưa tới GDKHQ
});

test("EPS-v2: quyền mua cho CĐHH -> chỉ phần thưởng ẩn P / TERP; giá phát hành ≥ giá trước quyền -> không hồi tố", () => {
  const e = { cat: "RIGHTS", ex: "2026-11-09", ratio: 15.45, title: "Phát hành 6,000,000 cp cho CĐHH, giá 12500 đ/cp" };
  assert.equal(rightsPrice(e), 12500);
  assert.equal(rightsPrice({ ...e, title: "Phát hành cổ phiếu ESOP, giá 10000 đ/cp" }), null);
  const f = actionFactor(e, 20000); const r = 0.1545, terp = (20000 + r * 12500) / (1 + r);
  assert.ok(Math.abs(f.epsFactor - 20000 / terp) < 1e-12); assert.equal(f.shareFactor, 1 + r); assert.equal(f.kind, "RIGHTS");
  assert.equal(actionFactor(e, 12000).epsFactor, 1); assert.equal(actionFactor(e, null).epsFactor, 1);
  const s = selectEps({ npatTtm: 1e11, quarterEnd: "2026-09-30", epsHist: [["2026-09-30", 2600]], sharesHist: [["2026-09-30", 38.8e6], ["2026-12-31", 44.8e6]], events: [e], asOf: "2026-11-11", pcumOf: () => 20000 });
  assert.equal(s.eps, Math.round(2600 / f.epsFactor)); assert.ok(Math.abs(s.sharesGap) < 0.001); // VNDirect cộng cả CP quyền mua: khớp hệ số số lượng
  assert.ok(s.eps > 2600 / (1 + r)); // KHÔNG chia đủ 1 + r như số CP hiện hành (CP mua bằng tiền mới chưa có trong 4 quý)
});

test("EPS-v2: số CP VNDirect lỗi (TLD 78M -> 8M) -> cờ SHARES_ANOMALY, mẫu số vẫn theo cuối quý × sự kiện", () => {
  const s = selectEps({ npatTtm: 56e9, quarterEnd: "2026-09-30", epsHist: [["2026-09-30", 717]], sharesHist: [["2026-09-30", 78e6], ["2026-12-31", 8.2e6]],
    events: [{ cat: "STOCK", ex: "2026-10-19", ratio: 5 }], asOf: "2026-11-11" });
  assert.equal(s.eps, Math.round(717 / 1.05)); assert.equal(s.shares, Math.round(78e6 * 1.05)); assert.ok(s.flags.includes("SHARES_ANOMALY"));
});

test("EPS-v2: sự kiện trùng nguồn chỉ tính 1 lần; GDKHQ = cuối quý không tính (đã trong số CP cuối quý); thiếu số CP cuối quý -> cách cũ", () => {
  const ev = [{ cat: "BONUS", ex: "2026-10-09", ratio: 5 }, { cat: "BONUS", ex: "2026-10-09", ratio: 5 }, { cat: "STOCK", ex: "2026-10-09", ratio: 25 }, { cat: "STOCK", ex: "2026-09-30", ratio: 10 }];
  const p = postPeriodActions(ev, "2026-09-30", "2026-11-11");
  assert.ok(Math.abs(p.factor - 1.05 * 1.25) < 1e-12); assert.equal(p.actions.length, 2);
  const s = selectEps({ npatTtm: 1e12, quarterEnd: "2026-09-30", sharesHist: [], events: ev, asOf: "2026-11-11" });
  assert.equal(s.basis, null); assert.equal(s.eps, null);
});

test("sharesAt (FM-v1 vốn hoá tại t): số CP cuối quý đã công bố × thưởng / cổ tức CP có GDKHQ ≤ t (không nhìn trước)", () => {
  assert.equal(sharesAt(shTCB, "2026-06-30", "2026-10-28", evTCB), 7086e6);
  assert.equal(sharesAt(shTCB, "2026-06-30", "2026-10-29", evTCB), 7086e6 * 1.5);
  assert.equal(sharesAt([], "2026-06-30", "2026-11-01", evTCB), null);
});
