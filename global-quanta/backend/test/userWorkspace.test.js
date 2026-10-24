// Super Chart SC1/SC3: bố cục theo tài khoản (chỉ khoá / miền đã biết) + thuộc tính đối tượng của hình vẽ.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../src/market/store/memoryStore.js";
import { isLocalOnlyTable } from "../src/market/store/localFirstStore.js";
import { WORKSPACE_TABLE, getUserWorkspace, sanitizeWorkspace, saveUserWorkspace } from "../src/market/watchlists/userWorkspace.js";
import { sanitizeChartPrimitives } from "../src/market/watchlists/userChartState.js";

test("sanitizeWorkspace: giữ khoá hợp lệ, bỏ khoá lạ / giá trị ngoài miền, kẹp chiều cao dock", () => {
  const w = sanitizeWorkspace({ preset: "momentum", dockTab: "elliott", inspectorOpen: false, dockHeight: 99_999, layers: { volume: true, rsi: "x", "bad key!": true }, paneStretch: { volume: 0.2, rsi: 7 }, hack: 1, layout: "nope" });
  assert.deepEqual(w, { schemaVersion: 1, preset: "momentum", dockTab: "elliott", inspectorOpen: false, dockHeight: 1200, layers: { volume: true }, paneStretch: { volume: 0.2, rsi: 1 } });
  assert.throws(() => sanitizeWorkspace(null), /Thiếu/);
});

test("lưu / đọc theo tài khoản; bảng chỉ ở kho cục bộ", async () => {
  const store = createMemoryStore();
  assert.deepEqual(await getUserWorkspace(store, "u1"), { workspace: null, updatedAt: null });
  const saved = await saveUserWorkspace(store, "u1", { workspace: { preset: "clean", layers: { smc: true } } }, new Date("2026-10-24T05:00:00Z"));
  assert.equal(saved.updatedAt, "2026-10-24T05:00:00.000Z");
  assert.deepEqual((await getUserWorkspace(store, "u1")).workspace.layers, { smc: true });
  assert.equal((await getUserWorkspace(store, "u2")).workspace, null);
  assert.equal(isLocalOnlyTable(WORKSPACE_TABLE), true);
});

test("hình vẽ: giữ tên / ẩn / khoá đúng kiểu, bỏ kiểu sai", () => {
  const [a, b] = sanitizeChartPrimitives([
    { id: "a", toolType: "trendline", p1: { date: "2026-01-02", price: 10 }, p2: { date: "2026-02-02", price: 12 }, createdAt: 1, name: "  Kênh tăng  ", hidden: true, locked: true },
    { id: "b", toolType: "rectangle", p1: { date: "2026-01-02", price: 10 }, p2: { date: "2026-02-02", price: 12 }, createdAt: 1, name: 5, hidden: "yes" },
  ]);
  assert.equal(a.name, "Kênh tăng"); assert.equal(a.hidden, true); assert.equal(a.locked, true);
  assert.equal("name" in b, false); assert.equal("hidden" in b, false);
});

test("R5 sanitizeIndicators: kẹp miền, MACD nhanh < chậm, enum lạ -> mặc định, neo AVWAP theo mã hợp lệ", async () => {
  const { sanitizeIndicators } = await import("../src/market/watchlists/userWorkspace.js");
  const s = sanitizeIndicators({
    rsi: { period: 500, upper: 80, lower: 1, method: "evil" }, macd: { fast: 30, slow: 20, signal: 9 }, adx: { period: "x", threshold: 99 },
    vprofile: { bars: 10, method: "uniform" }, avwap: { anchors: { FPT: "2026-03-02", "bad ticker": "2026-01-01", HPG: "<script>" } }, extra: 1,
  });
  assert.deepEqual(s, {
    rsi: { period: 100, upper: 80, lower: 5, method: "wilder" }, macd: { fast: 12, slow: 26, signal: 9 }, adx: { period: 14, threshold: 60 },
    vprofile: { bars: 20, method: "uniform" }, avwap: { anchors: { FPT: "2026-03-02" } },
  });
  assert.equal(sanitizeIndicators(null), undefined);
  assert.deepEqual(sanitizeWorkspace({ indicators: { rsi: { period: 21 } } }).indicators.rsi, { period: 21, upper: 70, lower: 30, method: "wilder" });
});
