// BUỒNG LÁI C0 (20/11/2026, docs/elite-hl-cockpit/08 B3) — kiểm diff "CHỈ THÊM" so với một nhánh nền.
// Mỗi dòng bị xoá trong tệp phải là một DÃY CON ký tự của một dòng thêm ghép cặp với nó (dòng mới = dòng cũ + chèn thêm, không bớt
// ký tự nào). Dòng xoá không ghép được -> báo lỗi, thoát mã 1.
// Dùng: node scripts/guard/additive-diff.mjs [--base origin/main] <tệp> [<tệp> ...]
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const bi = args.indexOf("--base");
const base = bi >= 0 ? args.splice(bi, 2)[1] : "origin/main";
if (!args.length) { console.error("Dùng: node scripts/guard/additive-diff.mjs [--base origin/main] <tệp> [...]"); process.exit(2); }

const isSub = (a, b) => { let i = 0; for (const ch of b) if (ch === a[i]) i++; return i === a.length; };
let bad = 0;
for (const file of args) {
  const diff = execSync(`git diff -U0 ${base} -- "${file}"`, { encoding: "utf8" });
  let changed = 0, added = 0, removedBad = 0;
  for (const h of diff.split(/^@@.*@@.*$/m).slice(1)) {
    const lines = h.split("\n").filter((l) => /^[-+]/.test(l) && !/^(---|\+\+\+)/.test(l));
    const del = lines.filter((l) => l[0] === "-").map((l) => l.slice(1).trim());
    const add = lines.filter((l) => l[0] === "+").map((l) => l.slice(1).trim());
    added += add.length - del.length;
    for (const dLine of del) {
      const j = add.findIndex((a) => isSub(dLine, a));
      if (j < 0) { removedBad++; console.log(`✖ ${file}: dòng bị xoá / bớt ký tự: ${dLine.slice(0, 160)}`); }
      else { changed++; add.splice(j, 1); }
    }
  }
  bad += removedBad;
  console.log(`${removedBad ? "✖" : "✔"} ${file}: ${changed} dòng chèn thêm nội dung, ${added} dòng mới, ${removedBad} dòng bị bớt`);
}
process.exit(bad ? 1 : 0);
