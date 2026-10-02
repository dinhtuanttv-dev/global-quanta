process.env.MARKET_ALERTS_ENABLED = "false";

import test from "node:test";
import assert from "node:assert/strict";
import { createAuthVerifier, getHistory, MAX_ITEMS, normalizeListKey, sanitizeItems, saveSnapshot } from "../src/market/radar/radarHistory.js";
import { createMemoryStore } from "../src/market/store/memoryStore.js";

const item = (t, s, extra = {}) => ({ t, s, g: "Tài chính", sm: 71.234, st: "breakout", core: s >= 4, pass: "110110", p: 25_900, c: 1.2, ...extra });

test("sanitizeItems: giữ mã hợp lệ, bỏ mã sai/trùng/điểm ngoài 0–6, giới hạn số mã", () => {
  const out = sanitizeItems([
    item("fpt", 4), item("FPT", 5), item("<script>", 3), item("HPG", 7), item("VCB", 2, { st: "hack", pass: "abc", sm: Number.NaN }),
  ]);
  assert.deepEqual(out.map((x) => x.t), ["FPT", "VCB"]);
  assert.equal(out[0].sm, 71.23);
  assert.equal(out[1].st, "stable");
  assert.equal(out[1].pass, null);
  assert.equal(out[1].sm, null);
  assert.equal(out[0].sg, undefined);
  assert.equal(sanitizeItems([item("PNJ", 3, { sg: 1 })])[0].sg, 1);
  assert.equal(sanitizeItems([item("PNJ", 3, { sg: 5 })])[0].sg, undefined);
  assert.throws(() => sanitizeItems(Array.from({ length: MAX_ITEMS + 1 }, (_, i) => item(`A${String(i).padStart(3, "0")}`, 1))), /Tối đa/);
  assert.throws(() => sanitizeItems("x"), /mảng/);
  assert.equal(normalizeListKey("  Danh   mục của tôi "), "Danh mục của tôi");
  assert.throws(() => normalizeListKey(""), /không hợp lệ/);
});

test("saveSnapshot/getHistory: một ảnh mỗi ngày giao dịch (ghi đè trong ngày), tách theo người dùng và danh mục", async () => {
  const store = createMemoryStore();
  const mon = new Date("2026-09-28T03:00:00Z"); // 10:00 VN thứ Hai
  const tue = new Date("2026-09-29T08:30:00Z");
  const sat = new Date("2026-10-03T05:00:00Z"); // thứ Bảy -> ngày giao dịch gần nhất (thứ Sáu)
  await saveSnapshot(store, "u1", { list: "Danh mục của tôi", items: [item("FPT", 3)] }, mon);
  await saveSnapshot(store, "u1", { list: "Danh mục của tôi", items: [item("FPT", 4)] }, mon); // ghi đè
  await saveSnapshot(store, "u1", { list: "Danh mục của tôi", items: [item("FPT", 5), item("HPG", 2)] }, tue);
  const r = await saveSnapshot(store, "u1", { list: "Danh mục của tôi", items: [item("FPT", 6)] }, sat);
  assert.equal(r.date, "2026-10-02");
  await saveSnapshot(store, "u2", { list: "Danh mục của tôi", items: [item("VCB", 1)] }, tue);
  await saveSnapshot(store, "u1", { list: "Khác", items: [item("VCB", 1)] }, tue);

  const h = await getHistory(store, "u1", { list: "Danh mục của tôi", days: 30 }, sat);
  assert.deepEqual(h.snapshots.map((s) => s.date), ["2026-09-28", "2026-09-29", "2026-10-02"]);
  assert.equal(h.snapshots[0].items[0].s, 4);
  assert.equal(h.today, "2026-10-02");
  assert.deepEqual((await getHistory(store, "u1", { list: "Danh mục của tôi", days: 2 }, sat)).snapshots.map((s) => s.date), ["2026-09-29", "2026-10-02"]);
  assert.equal((await getHistory(store, "u2", { list: "Danh mục của tôi" }, sat)).snapshots.length, 1);
});

test("createAuthVerifier: không có token -> 401; token hợp lệ được nhớ; token sai -> 401", async () => {
  const prev = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY };
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-key";
  try {
    let calls = 0;
    const verify = createAuthVerifier({
      fetchImpl: async (url, init) => {
        calls++;
        assert.equal(url, "https://example.supabase.co/auth/v1/user");
        return init.headers.authorization === "Bearer good"
          ? { ok: true, status: 200, json: async () => ({ id: "user-1" }) }
          : { ok: false, status: 401, json: async () => ({}) };
      },
    });
    await assert.rejects(verify(undefined), (e) => e.statusCode === 401);
    assert.equal(await verify("Bearer good"), "user-1");
    assert.equal(await verify("Bearer good"), "user-1");
    assert.equal(calls, 1);
    await assert.rejects(verify("Bearer bad"), (e) => e.statusCode === 401);
  } finally {
    process.env.SUPABASE_URL = prev.url ?? "";
    process.env.SUPABASE_SECRET_KEY = prev.key ?? "";
  }
});
