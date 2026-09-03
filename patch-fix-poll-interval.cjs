const fs = require("fs");
const path = "./src/services/livePriceService.ts";
let content = fs.readFileSync(path, "utf8");

const broken = `{
  const POLL_INTERVALN_MS = 10_000;
  const CORS_PROX = "https://api.allorgins.win/raw?url=";
}`;

if (!content.includes(broken)) {
  console.error("KHONG TIM THAY doan code loi - can kiem tra thu cong.");
  process.exit(1);
}

const fixed = `const POLL_INTERVAL_MS = 10_000;`;
content = content.replace(broken, fixed);
fs.writeFileSync(path, content, "utf8");
console.log("DA SUA XONG POLL_INTERVAL_MS.");
