const fs = require("fs");
const path = "./src/components/TopBar/topbar-pro.css";
let content = fs.readFileSync(path, "utf8");

const old = `.liq-panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  width: 320px;`;

const fixed = `.liq-panel-portal {
  position: fixed;
  width: 320px;
  z-index: 9999;
}
.liq-panel {
  width: 320px;`;

if (!content.includes(old)) {
  console.error("KHONG TIM THAY .liq-panel goc - can kiem tra thu cong.");
  process.exit(1);
}
content = content.replace(old, fixed);
fs.writeFileSync(path, content, "utf8");
console.log("DA SUA XONG .liq-panel sang position:fixed + portal.");
