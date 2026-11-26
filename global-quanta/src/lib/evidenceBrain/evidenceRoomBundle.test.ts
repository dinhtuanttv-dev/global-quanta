// @vitest-environment node
// 27/11/2026 — bản đóng gói Phòng họp AI của Gateway phải dùng CÙNG engine Price Action với frontend. #384 nâng engine lên pa-book-2
// nhưng quên `node scripts/bundle-evidence-room.mjs` -> snapshot khoá trên Gateway vẫn chạy pa-standalone-1.0.0 (lỗi nhìn trước cũ).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PRICE_ACTION_ENGINE_VERSION } from "../price-action/index.ts";

describe("Bản đóng gói Phòng họp AI cho Gateway", () => {
  it("chứa đúng phiên bản engine Price Action hiện tại (chạy `node scripts/bundle-evidence-room.mjs` sau khi sửa engine)", () => {
    const bundle = readFileSync(resolve(process.cwd(), "backend/src/market/vendor/evidenceRoom.mjs"), "utf8");
    expect(bundle.includes(PRICE_ACTION_ENGINE_VERSION), `evidenceRoom.mjs không chứa ${PRICE_ACTION_ENGINE_VERSION}`).toBe(true);
    expect(bundle.includes("pa-standalone-1.0.0")).toBe(false);
  });
});
