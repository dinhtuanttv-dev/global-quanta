// C1 — "Ứng viên tiếp theo": phát lại thuật toán dựng danh mục trên tài liệu THẬT (phiên 23/10/2026) — lý do chưa vào, vùng đệm,
// cắt lỗ / mục tiêu cùng công thức danh mục; tài liệu lệch thuật toán -> không khẳng định lý do.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCandidates, stopTarget, PORTFOLIO } from "../src/market/elite/decisionCore.js";

const doc = JSON.parse(fs.readFileSync(new URL("./fixtures/elite-decision-20261023.json", import.meta.url), "utf8"));

test("phiên 23/10: ứng viên đúng thứ tự Z, không trùng danh mục; VHM bị trần ngành 3/3; còn lại tới lượt khi đã đủ 10 mã", () => {
  const c = buildCandidates(doc, 20);
  const held = new Set(doc.portfolio.map((p) => p.ticker));
  assert.equal(c.length, 20);
  assert.ok(c.every((x) => !held.has(x.ticker)));
  for (let i = 1; i < c.length; i++) assert.ok(c[i - 1].Z >= c[i].Z);
  const vhm = c.find((x) => x.ticker === "VHM");
  assert.deepEqual([vhm.reason, vhm.sectorCount, vhm.inBuffer, vhm.sectorHeld], ["sector_cap", 3, true, 3]);
  assert.ok(c.filter((x) => x.ticker !== "VHM").every((x) => x.reason === "full"));
  assert.equal(c.find((x) => x.ticker === "VGC").sectorHeld, 3, "VGC cùng ngành Bất động sản đã đủ 3/3");
  // Vùng đệm = top 20 trong các mã đủ điều kiện (theo Z).
  const ranked = doc.scores.filter((x) => x.eligible && x.sigma20 > 0).sort((a, b) => b.Z - a.Z).map((x) => x.ticker);
  for (const x of c) assert.equal(x.inBuffer, ranked.indexOf(x.ticker) < PORTFOLIO.bufferRank, x.ticker);
});

test("cắt lỗ / mục tiêu của ứng viên dùng ĐÚNG công thức của danh mục (khớp số đã lưu của 10 mã)", () => {
  const sigma = new Map(doc.scores.map((s) => [s.ticker, s.sigma20]));
  for (const p of doc.portfolio) {
    const st = stopTarget(p.close, sigma.get(p.ticker));
    assert.ok(Math.abs(st.stop - p.stop) < 1e-6 && Math.abs(st.target - p.target) < 1e-6, p.ticker);
  }
  const c = buildCandidates(doc, 3)[0];
  assert.deepEqual({ stop: c.stop, target: c.target }, stopTarget(c.close, c.sigma20));
});

test("tài liệu lệch thuật toán (danh mục khác kết quả phát lại) -> lý do 'below', không khẳng định trần ngành / đã đủ", () => {
  const tampered = { ...doc, portfolio: doc.portfolio.slice(0, 9) };
  assert.ok(buildCandidates(tampered, 5).every((x) => x.reason === "below"));
  assert.deepEqual(buildCandidates({ scores: [] }), []);
});
