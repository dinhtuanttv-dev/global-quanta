import { build } from "esbuild";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const file = (relative) => fileURLToPath(new URL(relative, import.meta.url));
const compiled = await build({
  entryPoints: [file("../src/lib/evidenceBrain/gateway.ts")],
  bundle: true, format: "esm", platform: "node", target: "node20", write: false, legalComments: "none", minify: true,
  supported: { "template-literal": false },
  banner: { js: "// Generated from src/lib/evidenceBrain/gateway.ts by node scripts/bundle-evidence-room.mjs." },
});
writeFileSync(file("../backend/src/market/vendor/evidenceRoom.mjs"), compiled.outputFiles[0].text);
