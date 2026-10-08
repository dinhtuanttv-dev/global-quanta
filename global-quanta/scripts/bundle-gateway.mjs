// Đóng gói quant-core (TS) cho Gateway (Node thuần): src/lib/quant-core/gateway.ts -> backend/src/market/vendor/quantCore.mjs.
// Tất định (không dấu thời gian) để test quantCoreBundle.test.ts so sánh được với bản build lại.
import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const BUNDLE_OUT = fileURLToPath(new URL("../backend/src/market/vendor/quantCore.mjs", import.meta.url));
export const BANNER = "// FILE SINH TỰ ĐỘNG — KHÔNG SỬA TAY. Nguồn: src/lib/quant-core (gateway.ts). Tạo lại: npm run bundle:gateway";

export async function bundleGateway({ write = true } = {}) {
  const r = await build({
    entryPoints: [fileURLToPath(new URL("../src/lib/quant-core/gateway.ts", import.meta.url))],
    bundle: true, format: "esm", platform: "node", target: "node20", write: false, legalComments: "none",
    banner: { js: BANNER }, logLevel: "silent",
  });
  const code = r.outputFiles[0].text;
  if (write) writeFileSync(BUNDLE_OUT, code);
  return code;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const code = await bundleGateway();
  console.log(`quantCore.mjs: ${(code.length / 1024).toFixed(0)} KB`);
}
