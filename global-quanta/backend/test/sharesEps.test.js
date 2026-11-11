// EPS-v1 (P0 kiểm toán BCTC): EPS 12 tháng + số cổ phiếu theo kỳ — chọn nguồn, không bao giờ trả 0 thay "không có", tải gộp, giữ bản cũ.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSharesEps, fetchRatioHistory, latestValue, selectEps, valueAsOf, valueAt } from "../src/market/fundamentals/sharesEps.js";
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
  assert.deepEqual(selectEps({ npatTtm: null, quarterEnd: "2026-09-30", sumEps: 0, tpl: "bank" }), { eps: null, source: null, check: null, shares: null });
  assert.equal(selectEps({ npatTtm: null, quarterEnd: "2026-09-30", sumEps: 0, tpl: "corp" }).eps, null);
  assert.deepEqual(selectEps({ npatTtm: null, quarterEnd: "2026-09-30", sumEps: 5315.4, tpl: "corp" }), { eps: 5315, source: "SUM_Q", check: null, shares: null });
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
