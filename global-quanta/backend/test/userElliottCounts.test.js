import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { isLocalOnlyTable } from "../src/market/store/localFirstStore.js";
import { deleteUserElliottCounts, ELLIOTT_COUNTS_TABLE, getUserElliottCounts, MAX_VERSIONS, normalizeCountKey, sanitizeCountsDoc, saveUserElliottCounts } from "../src/market/watchlists/userElliottCounts.js";

const v = (id, over = {}) => ({ id, createdAt: `2026-10-${String(10 + (over.n ?? 0)).padStart(2, "0")}T08:00:00.000Z`, status: "user_edited",
  points: [{ date: "2026-08-01", price: 100, label: "0" }, { date: "2026-08-10", price: 110, label: "1" }, { date: "2026-08-20", price: 104, label: "2" }], ...over });

test("khoá: mã + khung hợp lệ; sai -> 400", () => {
  assert.deepEqual(normalizeCountKey(" fpt ", "W"), { symbol: "FPT", timeframe: "W" });
  assert.deepEqual(normalizeCountKey("VNINDEX"), { symbol: "VNINDEX", timeframe: "D" });
  assert.throws(() => normalizeCountKey("x", "D"), (e) => e.statusCode === 400);
  assert.throws(() => normalizeCountKey("FPT", "5m"), (e) => e.statusCode === 400);
});

test("chuẩn hoá: bỏ phiên bản lỗi (nhãn lạ, giá âm, ngày lùi), giữ 20 bản mới nhất, activeId phải tồn tại", () => {
  const bad = [
    v("a", { points: [{ date: "2026-08-01", price: 100, label: "<script>" }, { date: "2026-08-02", price: 1, label: "1" }] }),
    v("b", { points: [{ date: "2026-08-05", price: 100, label: "0" }, { date: "2026-08-01", price: 101, label: "1" }] }),
    v("c", { points: [{ date: "2026-08-05", price: -1, label: "0" }, { date: "2026-08-06", price: 101, label: "1" }] }),
  ];
  const doc = sanitizeCountsDoc({ activeId: "a", versions: [...bad, v("ok", { pattern: "ZZ", status: "user_confirmed", note: "x".repeat(900) })] });
  assert.deepEqual(doc.versions.map((x) => x.id), ["ok"]);
  assert.equal(doc.activeId, null);
  assert.equal(doc.versions[0].pattern, "ZZ"); assert.equal(doc.versions[0].status, "user_confirmed"); assert.equal(doc.versions[0].note.length, 500);
  const many = Array.from({ length: 25 }, (_, n) => v(`v${n}`, { n }));
  const d2 = sanitizeCountsDoc({ activeId: "v24", versions: many });
  assert.equal(d2.versions.length, MAX_VERSIONS); assert.equal(d2.versions[0].id, "v5"); assert.equal(d2.activeId, "v24");
  assert.throws(() => sanitizeCountsDoc({ versions: [v("d"), v("d")] }), (e) => e.statusCode === 400);
  assert.throws(() => sanitizeCountsDoc({ versions: "x" }), (e) => e.statusCode === 400);
});

test("lưu / đọc / xoá theo tài khoản + mã + khung; tài khoản khác không thấy", async () => {
  const store = createMemoryStore();
  const key = { symbol: "FPT", timeframe: "D" };
  assert.deepEqual((await getUserElliottCounts(store, "u1", key)).versions, []);
  await saveUserElliottCounts(store, "u1", key, { activeId: "x1", versions: [v("x1")] });
  const got = await getUserElliottCounts(store, "u1", key);
  assert.equal(got.activeId, "x1"); assert.equal(got.versions.length, 1); assert.ok(got.updatedAt);
  assert.deepEqual((await getUserElliottCounts(store, "u2", key)).versions, []);
  assert.deepEqual((await getUserElliottCounts(store, "u1", { symbol: "FPT", timeframe: "W" })).versions, []);
  await deleteUserElliottCounts(store, "u1", key);
  assert.deepEqual((await getUserElliottCounts(store, "u1", key)).versions, []);
});

test("bảng chỉ ở kho cục bộ (không sao sang Supabase)", () => {
  assert.equal(isLocalOnlyTable(ELLIOTT_COUNTS_TABLE), true);
  assert.equal(isLocalOnlyTable("market_user_elliott_alerts"), true);
});
