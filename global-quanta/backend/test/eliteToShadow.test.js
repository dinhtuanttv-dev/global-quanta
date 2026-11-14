// Elite × TO Giai đoạn II — sổ ảo COMP-r1 / DIV-IC (ELITE-TO-prereg.md): tính toán thuần + dịch vụ với dữ liệu giả.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { blockBootCi, createEliteToShadow, maxDrawdown, neweyWestT, shadowDay, spearman, summarizeShadow, SHADOW_RULE } from "../src/market/elite/eliteToShadow.js";

test("shadowDay: CORE / GUARD (tiền mặt + phí bán/mua lại) / SLEEVE (2 × 10%, vốn lấy theo tỷ trọng lõi) / COMP", () => {
  const w = { A: 0.5, B: 0.5 }, ret = { A: 0.02, B: -0.04 };
  assert.deepEqual(shadowDay({ weights: w, ret }), { core: -0.01, guard: -0.01, sleeve: -0.01, comp: -0.01, k: 0 });
  const g = shadowDay({ weights: w, ret, guarded: ["B"], guardSell: ["B"] });
  assert.equal(g.guard, 0.5 * 0.02 - 0.5 * 0.0025);
  const s = shadowDay({ weights: w, ret, sleeve: [{ t: "X", r: 0.05, cost: 0.002 }, { t: "Y", r: 0.01, cost: 0 }, { t: "Z", r: 0.5, cost: 0 }] });
  assert.equal(s.k, 2); // tối đa 2 lệnh
  assert.ok(Math.abs(s.sleeve - (0.8 * -0.01 + 0.1 * (0.05 - 0.002) + 0.1 * 0.01)) < 1e-9);
  const c = shadowDay({ weights: w, ret, guarded: ["B"], sleeve: [{ t: "X", r: 0.05, cost: 0 }] });
  assert.ok(Math.abs(c.comp - (0.9 * 0.01 + 0.1 * 0.05)) < 1e-9);
});

test("thống kê: Spearman có giá trị trùng, t Newey–West, bootstrap khối, sụt giảm", () => {
  assert.equal(spearman([0, 0, 0, 1, 2], [1, 2, 3, 4, 5]) > 0.8, true);
  assert.equal(spearman([1, 2], [1, 2]), null);
  assert.equal(spearman([0, 0, 0], [1, 2, 3]), null);
  assert.ok(neweyWestT(Array.from({ length: 80 }, (_, i) => 0.02 + (i % 2 ? 0.01 : -0.01))) > 5);
  const [lo, hi] = blockBootCi(Array.from({ length: 60 }, (_, i) => 0.001 + (i % 3 - 1) * 0.0005));
  assert.ok(lo > 0 && hi > lo);
  assert.deepEqual(blockBootCi([0.1, 0.2]), [null, null]);
  assert.equal(maxDrawdown([0.1, -0.5, 0.2]), -0.5);
});

test("summarizeShadow: trước 60 phiên -> CHƯA ĐỦ MẪU; đủ phiên + ΔCOMP dương ổn định -> ĐẠT", () => {
  const day = (i, dComp) => ({ d: `2026-12-${String((i % 28) + 1).padStart(2, "0")}`, core: 0.001, guard: 0.001, sleeve: 0.001 + dComp, comp: 0.001 + dComp, vn: 0, k: 1, guarded: [] });
  const few = summarizeShadow(Array.from({ length: 20 }, (_, i) => day(i, 0.001)), []);
  assert.equal(few.compVerdict, "CHƯA ĐỦ MẪU"); assert.equal(few.ic.verdict, "CHƯA ĐỦ MẪU"); assert.equal(few.label, "THĂM DÒ");
  const many = summarizeShadow(Array.from({ length: 70 }, (_, i) => day(i, 0.0005 + (i % 2) * 0.0002)), []);
  assert.equal(many.compVerdict, "ĐẠT"); assert.ok(many.delta.comp.ci95[0] > 0);
  const bad = summarizeShadow(Array.from({ length: 70 }, (_, i) => day(i, i % 2 ? 0.002 : -0.003)), []);
  assert.equal(bad.compVerdict, "KHÔNG ĐẠT");
});

test("dịch vụ: đọc danh mục Elite dựng TRƯỚC phiên, GUARD quanh GDKHQ nhóm ≥ 5%, SLEEVE từ TO-L1, DIV-IC sau 5 phiên; không ghi lại ngày đã có", async () => {
  const dates = []; for (let d = Date.parse("2026-11-02T00:00:00Z"); dates.length < 30; d += 864e5) { const w = new Date(d).getUTCDay(); if (w && w < 6) dates.push(new Date(d).toISOString().slice(0, 10)); }
  const px = (g) => dates.map((d, i) => [d, 10 * (1 + g) ** i, 1e9, 10]);
  const prices = { VNINDEX: dates.map((d) => [d, 1000, 0]), A: px(0.01), B: px(-0.01), C: px(0), X: px(0.02), D: px(0.005), E: px(0) };
  const kv = { "elite:decision:index": { dates: ["2026-11-06"] }, "elite:decision:2026-11-06": { portfolio: [{ ticker: "A", weight: 0.5 }, { ticker: "B", weight: 0.5 }] } };
  const exB = dates[8]; // GDKHQ của B
  const facts = [{ t: "B", ex: exB, bucket: "≥5%", y: 0.06, entryDate: dates[3] }, { t: "D", ex: dates[25], bucket: "≥5%", y: 0.07, entryDate: dates[8] }, { t: "E", ex: dates[25], bucket: "3–5%", y: 0.04, entryDate: dates[8] }, { t: "C", ex: dates[25], bucket: "<3%", y: 0.01, entryDate: dates[8] }];
  const entries = [{ t: "X", entryDate: dates[6], status: "DONE", result: { exitDate: dates[10] } }];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ets-"));
  const svc = createEliteToShadow({ dir, getKv: async (k) => kv[k] ?? null, decisionKey: (d) => `elite:decision:${d}`, decisionIndexKey: "elite:decision:index", pricesOf: (t) => prices[t] ?? null,
    allFacts: async () => facts, ledgerEntries: async () => entries, getUniverse: async () => ({ tickers: ["A", "B", "C", "D", "E", "X"].map((t) => ({ ticker: t })) }), rule: { ...SHADOW_RULE, start: dates[5] }, log: {} });
  const r = await svc.tick();
  assert.equal(r.days, 30 - 5); assert.ok(r.icAdded > 0);
  const S = JSON.parse(fs.readFileSync(path.join(dir, "elite-to-shadow.json"), "utf8"));
  const byD = new Map(S.days.map((x) => [x.d, x]));
  assert.deepEqual(byD.get(exB).guarded, ["B"]); assert.deepEqual(byD.get(dates[12]).guarded, ["B"]); assert.deepEqual(byD.get(dates[13]).guarded, []); // 5 phiên GDKHQ…+4
  assert.ok(byD.get(exB).guard > byD.get(exB).core); // B giảm -> để tiền mặt tốt hơn (sau phí)
  assert.deepEqual(byD.get(dates[7]).sleeveT, ["X"]); assert.deepEqual(byD.get(dates[11]).sleeveT, []);
  const ic = S.ic.find((x) => x.d === dates[10]); assert.equal(ic.nSig, 3); assert.ok(ic.ic != null);
  assert.equal(S.ic.find((x) => x.d === dates[5]).ic, null); // < 3 mã có tín hiệu
  assert.equal((await svc.tick()).added, 0); // không ghi lại
  const sum = await svc.summary(); assert.equal(sum.compVerdict, "CHƯA ĐỦ MẪU"); assert.equal(sum.curve.length, 25); assert.equal(sum.label, "THĂM DÒ");
});

// F10 (14/11/2026): lõi CORE là danh mục Elite 10 (E3) như bản đăng ký trước — với tài liệu E4-HL phải lấy flowPortfolio, không phải danh mục HL.
import { shadowCorePortfolio } from "../src/market/elite/eliteToShadow.js";
test("lõi CORE của sổ ảo: tài liệu E4-HL -> flowPortfolio; tài liệu cũ -> portfolio; thiếu -> rỗng", () => {
  const flow = [{ ticker: "ORS", weight: 0.5 }, { ticker: "NAB", weight: 0.5 }], hl = [{ ticker: "FPT", weight: 0.1 }];
  assert.deepEqual(shadowCorePortfolio({ portfolio: hl, flowPortfolio: flow, hl: {} }), flow);
  assert.deepEqual(shadowCorePortfolio({ portfolio: flow }), flow);
  assert.deepEqual(shadowCorePortfolio(null), []);
});
