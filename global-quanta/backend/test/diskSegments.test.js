import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createSegments, HEAP_PER_JSON_BYTE } from "../src/market/store/diskSegments.js";

test("đệm RAM tính theo heap ước lượng (JSON × hệ số) và đẩy đoạn cũ ra khi vượt trần", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "seg-"));
  const seg = createSegments({ dir, ramMb: 1, flushMs: 1, log: { warn() {} } });
  const doc = { rows: Array.from({ length: 2000 }, (_, i) => ["AAA" + i, 23.45, 1234500]) }; // ≈ 50 KB JSON
  const json = JSON.stringify(doc).length;
  seg.put("md/2026-10-01", doc, { sync: true });
  assert.equal(seg.stats().ramMb, Math.round((json * HEAP_PER_JSON_BYTE / 1048576) * 10) / 10);
  for (let d = 2; d <= 20; d++) seg.put(`md/2026-10-${String(d).padStart(2, "0")}`, doc, { sync: true });
  const s = seg.stats();
  assert.ok(s.ramMb <= 1, `ram ${s.ramMb} MB vượt trần`);
  assert.ok(s.evictions > 0);
  assert.equal(seg.get("md/2026-10-01").rows.length, 2000); // đoạn đã đẩy ra vẫn đọc lại được từ đĩa
  fs.rmSync(dir, { recursive: true, force: true });
});
