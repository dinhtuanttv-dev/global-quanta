const fs = require("fs");
const path = "./src/components/TopBar/topbar-pro.css";
let content = fs.readFileSync(path, "utf8");

const old = `.ticker-strip {
  display: flex;
  align-items: center;
  overflow-x: auto;
  scrollbar-width: none;`;

const fixed = `.ticker-strip {
  display: flex;
  align-items: center;
  flex: 1 1 0%;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;`;

if (!content.includes(old)) {
  console.error("KHONG TIM THAY .ticker-strip goc.");
  process.exit(1);
}
content = content.replace(old, fixed);
fs.writeFileSync(path, content, "utf8");
console.log("DA SUA XONG .ticker-strip flex.");
