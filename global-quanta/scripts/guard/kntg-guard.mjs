// G0 (19/11/2026) — chặn PR nâng cấp giao diện tab KẾT NỐI THẾ GIỚI chạm vào tệp nghiệp vụ (Giao-dien-KNTG/05 mục 1).
// Chạy: node scripts/guard/kntg-guard.mjs [BASE_REF=origin/main] [--allow-engine-strings]
//   --allow-engine-strings: chỉ dùng cho G6 (dịch câu cảnh báo engine); khi đó vẫn cấm mọi tệp khác trong danh sách.
// Thoát mã 1 nếu có tệp bị cấm trong diff.
import { execSync } from "node:child_process";

const baseRef = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "origin/main";
const allowEngineStrings = process.argv.includes("--allow-engine-strings");
const changed = execSync(`git diff --name-only ${baseRef}...HEAD`, { encoding: "utf8" }).split("\n").map((s) => s.trim()).filter(Boolean)
  .map((f) => f.replace(/^global-quanta\//, ""));

export const FORBIDDEN = [
  /^src\/macro-center\/src\/(?!ui\/|world-client\.ts$|__fixtures__\/|.*\.test\.ts$)[^/]+\.ts$/, // engine (trừ giao diện, client, test, mẫu)
  /^src\/lib\/worldSectors\/.*\.ts$/,
  /^src\/lib\/commodities\/.*\.ts$/,
  /^src\/components\/MainTabs\/KetNoiTheGioi\/center\/world2d\.ts$/,
  /^backend\/src\//,
  /^backend\/src\/market\/macro\/vendor\/macroEngine\.mjs$/,
];
const ENGINE_STRINGS = [/^src\/macro-center\/src\/(quant-macro|world-api)\.ts$/, /^backend\/src\/market\/macro\/vendor\/macroEngine\.mjs$/];

const bad = changed.filter((f) => FORBIDDEN.some((re) => re.test(f)) && !(allowEngineStrings && ENGINE_STRINGS.some((re) => re.test(f))));
console.log(`So với ${baseRef}: ${changed.length} tệp đổi.`);
if (bad.length) {
  console.log(`✖ ${bad.length} tệp nghiệp vụ bị chạm (cấm trong chương trình nâng cấp giao diện):`);
  for (const f of bad) console.log(`   ${f}`);
  process.exit(1);
}
console.log("✔ Không chạm tệp nghiệp vụ nào.");
