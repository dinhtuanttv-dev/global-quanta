const fs = require("fs");
const path = "./global-quanta/src/components/Sidebar/WatchlistRow.tsx";
let content = fs.readFileSync(path, "utf8");

const oldLine = `<span className="sb-price num">{livePrice.toLocaleString('vi-VN')}</span>`;
const newLine = `<span className="sb-price num">{Math.round(livePrice).toLocaleString('vi-VN')}</span>`;

if (!content.includes(oldLine)) {
  console.error("KHONG TIM THAY oldLine.");
  process.exit(1);
}
content = content.replace(oldLine, newLine);
fs.writeFileSync(path, content, "utf8");
console.log("DA SUA XONG dinh dang gia (lam tron ve so nguyen).");
