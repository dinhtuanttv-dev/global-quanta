// Đóng gói động cơ vĩ mô (TS) cho Gateway (Node thuần): src/macro-center/src/gateway.ts -> backend/src/market/macro/vendor/macroEngine.mjs.
// Tất định (không dấu thời gian) để test macroEngineBundle.test.ts so sánh được với bản build lại.
import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const BUNDLE_OUT = fileURLToPath(new URL("../backend/src/market/macro/vendor/macroEngine.mjs", import.meta.url));
export const BANNER = "// FILE SINH TỰ ĐỘNG — KHÔNG SỬA TAY. Nguồn: src/macro-center/src (gateway.ts). Tạo lại: npm run bundle:macro";

export async function bundleMacro({ write = true } = {}) {
  const r = await build({
    entryPoints: [fileURLToPath(new URL("../src/macro-center/src/gateway.ts", import.meta.url))],
    bundle: true, format: "esm", platform: "node", target: "node20", write: false, legalComments: "none",
    banner: { js: BANNER }, logLevel: "silent",
  });
  const code = r.outputFiles[0].text;
  if (write) {
    mkdirSync(dirname(BUNDLE_OUT), { recursive: true });
    writeFileSync(BUNDLE_OUT, code);
  }
  return code;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const code = await bundleMacro();
  console.log(`macroEngine.mjs: ${(code.length / 1024).toFixed(0)} KB`);
}
