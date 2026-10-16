// @vitest-environment node
// Bản đóng gói động cơ vĩ mô của Gateway phải trùng khớp bản build lại từ mã nguồn — sửa src/macro-center/src mà quên `npm run bundle:macro` -> test đỏ.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error — script JS
import { bundleMacro, BUNDLE_OUT } from "../../../scripts/bundle-macro.mjs";

describe("Bản đóng gói động cơ vĩ mô cho Gateway", () => {
  it("backend/src/market/macro/vendor/macroEngine.mjs khớp mã nguồn hiện tại", async () => {
    const fresh = await bundleMacro({ write: false });
    const committed = readFileSync(BUNDLE_OUT, "utf8").replace(/\r\n/g, "\n");
    expect(committed === fresh.replace(/\r\n/g, "\n"), "Chạy `npm run bundle:macro` rồi commit lại macroEngine.mjs").toBe(true);
  }, 60_000);
});
