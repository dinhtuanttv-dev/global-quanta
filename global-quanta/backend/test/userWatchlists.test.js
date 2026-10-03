process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { getUserWatchlists, sanitizeWatchlistState, saveUserWatchlists, MAX_TICKERS } from "../src/market/watchlists/userWatchlists.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";

test("sanitizeWatchlistState: chuẩn hoá mã, bỏ trùng/sai, giới hạn 60, ghi chú & ghim chỉ cho mã có trong danh mục", () => {
  const s = sanitizeWatchlistState({
    activeId: "x", radarId: "default",
    lists: [
      { id: "default", name: "Danh mục của tôi", tickers: ["fpt", "FPT", "hpg", "bad!", "12AB"], notes: { FPT: "cổ tức", VIC: "không có" }, pinned: ["FPT", "VIC"] },
      { id: "default", name: "trùng id", tickers: ["VNM"] },
      { id: "big", name: "", tickers: Array.from({ length: 80 }, (_, i) => `A${String(i).padStart(2, "0")}`) },
    ],
  });
  assert.deepEqual(s.lists[0], { id: "default", name: "Danh mục của tôi", tickers: ["FPT", "HPG"], notes: { FPT: "cổ tức" }, pinned: ["FPT"] });
  assert.equal(s.lists.length, 2);
  assert.equal(s.lists[1].name, "Danh mục 2");
  assert.equal(s.lists[1].tickers.length, MAX_TICKERS);
  assert.equal(s.activeId, "default"); // activeId không tồn tại -> danh mục đầu
  assert.equal(s.radarId, "default");
  assert.throws(() => sanitizeWatchlistState({ lists: [] }), /ít nhất 1/);
  assert.throws(() => sanitizeWatchlistState(null), /lists/);
});

test("lưu rồi đọc lại theo tài khoản; người dùng khác không thấy", async () => {
  const store = createMemoryStore();
  const saved = await saveUserWatchlists(store, "u1", { state: { activeId: "default", lists: [{ id: "default", name: "A", tickers: ["FPT"] }] } }, new Date("2026-10-03T09:00:00Z"));
  assert.equal(saved.updatedAt, "2026-10-03T09:00:00.000Z");
  const got = await getUserWatchlists(store, "u1");
  assert.deepEqual(got.state.lists[0].tickers, ["FPT"]);
  assert.deepEqual(await getUserWatchlists(store, "u2"), { state: null, updatedAt: null });
  await saveUserWatchlists(store, "u1", { state: { lists: [{ id: "default", name: "A", tickers: ["FPT", "VNM"] }] } });
  assert.deepEqual((await getUserWatchlists(store, "u1")).state.lists[0].tickers, ["FPT", "VNM"]); // ghi đè, không nhân dòng
});
