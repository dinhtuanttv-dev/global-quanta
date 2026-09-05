const fs = require("fs");
const path = "./src/components/TopBar/TopBar.tsx";
let content = fs.readFileSync(path, "utf8");

const old = "{liquidity && <LiquidityCheckBadge data={liquidity} />}";
const fixed = "<LiquidityCheckBadge />";

if (!content.includes(old)) {
  console.error("KHONG TIM THAY dong can sua.");
  process.exit(1);
}
content = content.replace(old, fixed);
fs.writeFileSync(path, content, "utf8");
console.log("DA SUA XONG dong LiquidityCheckBadge.");
