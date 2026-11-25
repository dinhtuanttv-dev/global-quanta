// Run from any directory. The browser suite exercises the real production bundle with deterministic, offline market fixtures.
const { execFileSync } = require("node:child_process");
const { resolve } = require("node:path");
const cwd = resolve(__dirname, "..");
function run(args, extra = {}) {
  execFileSync(process.execPath, args, { cwd, stdio: "inherit", env: { ...process.env, ...extra } });
}
run(["--test", "backend/test/aiRoomAutonomy.test.js"]);
run(["node_modules/typescript/bin/tsc"]);
run(["node_modules/vite/bin/vite.js", "build"]);
run(["scripts/check-ai-room-browser.cjs"], { AI_ROOM_AUTONOMY_TEST: "1" });
