// BL4: bộ lọc cổ tức đã lưu + cột theo tài khoản (chỉ khoá / miền đã biết, phiên bản máy chủ).
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { isLocalOnlyTable } from "../src/market/store/localFirstStore.js";
import { SCREENER_PREFS_TABLE, getUserScreenerPrefs, sanitizeScreenerPrefs, saveUserScreenerPrefs } from "../src/market/watchlists/userScreenerPrefs.js";

test("sanitizeScreenerPrefs: kẹp miền, bỏ khoá lạ, tên trùng / rỗng, cột lạ", () => {
  const p = sanitizeScreenerPrefs({
    screens: [
      { name: "  Lợi suất bền  ", filter: { minYield: 99, minRoe: "12", trend: "UP", phase: "X", hideTraps: true, showUnknown: true, searchQ: "FPT", evil: 1, minQuintile: 4 }, sort: { field: "score", asc: false } },
      { name: "lợi suất bền", filter: {} }, { name: "", filter: {} }, { name: "B", filter: null, sort: { field: "hack" } },
    ],
    columns: { pe: false, window: false, bogus: true, fm: "no" }, defaultScreen: "B", extra: 1,
  });
  assert.deepEqual(p, {
    schemaVersion: 1,
    screens: [{ name: "Lợi suất bền", filter: { minYield: 15, minRoe: 12, minQuintile: 4, trend: "UP", hideTraps: true, showUnknown: true }, sort: { field: "score", asc: false } }, { name: "B", filter: {} }],
    columns: { pe: false, window: false }, defaultScreen: "B",
  });
  assert.throws(() => sanitizeScreenerPrefs(null), /Thiếu/);
});

test("lưu / đọc theo tài khoản, 409 khi phiên bản gốc lệch, bảng chỉ ở kho cục bộ", async () => {
  const store = createMemoryStore();
  assert.deepEqual(await getUserScreenerPrefs(store, "u1"), { prefs: null, updatedAt: null });
  const a = await saveUserScreenerPrefs(store, "u1", { prefs: { screens: [{ name: "A", filter: { minYield: 5 } }] }, baseUpdatedAt: null }, new Date("2026-11-07T05:00:00Z"));
  assert.equal(a.updatedAt, "2026-11-07T05:00:00.000Z");
  assert.equal((await getUserScreenerPrefs(store, "u1")).prefs.screens[0].filter.minYield, 5);
  assert.equal((await getUserScreenerPrefs(store, "u2")).prefs, null);
  await assert.rejects(saveUserScreenerPrefs(store, "u1", { prefs: { screens: [] }, baseUpdatedAt: null }), (e) => e.statusCode === 409);
  assert.equal(isLocalOnlyTable(SCREENER_PREFS_TABLE), true);
});
