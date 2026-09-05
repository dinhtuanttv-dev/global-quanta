const fs = require("fs");
const path = "./src/components/TopBar/TopBar.tsx";
let content = fs.readFileSync(path, "utf8");

content = content.replace(
  /\{s&&<LiquidityCheckBadge data=\{s\} \/>\}/,
  "<LiquidityCheckBadge />"
);
content = content.replace(
  /const \[liquidity, setLiquidity\] = useState<LiquidityData \| null>\(null\);\n/,
  ""
);
content = content.replace(
  /\n\s*useEffect\(\(\) => \{[\s\S]*?api\.fetchLiquidity1030\(\)\.then\(setLiquidity\);[\s\S]*?\}, \[\]\);\n/,
  "\n"
);
content = content.replace(/import \* as api from '\.\.\/\.\.\/services\/api';\n/, "");
content = content.replace(/import \{ useEffect, useState \} from 'react';\n/, "");
content = content.replace(/, LiquidityData/, "");

fs.writeFileSync(path, content, "utf8");
console.log("DA SUA TopBar.tsx - LiquidityCheckBadge tu fetch.");
