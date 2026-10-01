import test from "node:test";
import assert from "node:assert/strict";
import { isOriginAllowed, parseAllowedOrigins } from "../src/utils/corsOrigins.js";

test("cors: origin cố định và ký tự đại diện cho URL preview Vercel", () => {
  const allowed = parseAllowedOrigins("https://global-quanta.vercel.app/, https://global-quanta-*-dinhtuanttv-devs-projects.vercel.app");
  assert.equal(isOriginAllowed("https://global-quanta.vercel.app", allowed), true);
  assert.equal(isOriginAllowed("https://global-quanta-2tdy2iqir-dinhtuanttv-devs-projects.vercel.app", allowed), true);
  assert.equal(isOriginAllowed("https://global-quanta-git-feat-ssi-mar-a7a6a3-dinhtuanttv-devs-projects.vercel.app", allowed), true);
  // "*" chỉ khớp một nhãn subdomain, không vượt qua dấu chấm.
  assert.equal(isOriginAllowed("https://global-quanta-x.evil.com-dinhtuanttv-devs-projects.vercel.app", allowed), false);
  assert.equal(isOriginAllowed("https://evil.vercel.app", allowed), false);
  assert.equal(isOriginAllowed(undefined, allowed), false);
});
