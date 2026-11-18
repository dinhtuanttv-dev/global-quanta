// A4 — sổ bằng chứng: mục đủ trường, phán quyết hợp lệ, có nguồn; route trả đúng dữ liệu.
import test from "node:test";
import assert from "node:assert/strict";
import { EVIDENCE_REGISTRY, evidenceRegistry, VERDICTS } from "../src/market/elite/evidenceRegistry.js";

test("mỗi mục có đủ trường, phán quyết hợp lệ, nguồn và ngày chạy", () => {
  const ids = new Set();
  for (const e of EVIDENCE_REGISTRY) {
    for (const k of ["id", "layer", "test", "verdict", "detail", "src", "ranAt"]) assert.ok(typeof e[k] === "string" && e[k].length, `${e.id}.${k}`);
    assert.ok(VERDICTS.includes(e.verdict), e.verdict); assert.match(e.ranAt, /^\d{4}-\d{2}-\d{2}$/); assert.ok(!ids.has(e.id)); ids.add(e.id);
  }
  assert.ok(EVIDENCE_REGISTRY.some((e) => e.verdict === "KHÔNG ĐẠT"), "công bố cả khi không đạt");
  const r = evidenceRegistry(); assert.equal(r.entries.length, EVIDENCE_REGISTRY.length); assert.match(r.version, /^ER-v1/);
  r.entries[0].verdict = "x"; assert.notEqual(EVIDENCE_REGISTRY[0].verdict, "x", "trả bản sao");
});
