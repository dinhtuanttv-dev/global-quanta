// Mọi module phía máy chủ phải biên dịch được (VD trùng tên import làm Gateway không khởi động — bắt được ở E2E DW10, 23/10/2026).
import test from "node:test";
import assert from "node:assert/strict";

test("runtime.js + routes biên dịch và nạp được (không khởi động server)", async () => {
  const rt = await import("../src/market/runtime.js");
  assert.equal(typeof rt.getMarketRuntime, "function");
  const routes = await import("../src/routes/market.js");
  assert.ok(routes.default ?? routes.router ?? Object.keys(routes).length > 0);
});
