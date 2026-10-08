// @vitest-environment node
// Bản đóng gói quant-core của Gateway phải trùng khớp bản build lại từ mã nguồn — sửa quant-core mà quên `npm run bundle:gateway` -> test đỏ.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
// @ts-expect-error — script JS
import { bundleGateway, BUNDLE_OUT } from "../../../scripts/bundle-gateway.mjs";

describe("Bản đóng gói quant-core cho Gateway", () => {
  it("backend/src/market/vendor/quantCore.mjs khớp mã nguồn hiện tại", async () => {
    const fresh = await bundleGateway({ write: false });
    const committed = readFileSync(BUNDLE_OUT, "utf8").replace(/\r\n/g, "\n");
    expect(committed === fresh.replace(/\r\n/g, "\n"), "Chạy `npm run bundle:gateway` rồi commit lại quantCore.mjs").toBe(true);
  }, 60_000);
});
