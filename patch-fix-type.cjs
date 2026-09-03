const fs = require("fs");
const path = "./global-quanta/src/components/MainTabs/SieuQuetAI/SieuQuetAiTab.tsx";
let content = fs.readFileSync(path, "utf8");

const oldType = `type LivePriceMap = Partial<Record<string, number>>;`;
const newType = `import type { LivePriceResponse } from "./livePriceApi";
type LivePriceMap = LivePriceResponse;`;

if (!content.includes(oldType)) {
  console.error("KHONG TIM THAY oldType - can kiem tra thu cong.");
  process.exit(1);
}
content = content.replace(oldType, newType);

const oldFill = `const priceMap: LivePriceMap = {};
      for (const [ticker, info] of Object.entries(prices)) {
        if (info.price !== null) {
          priceMap[ticker] = info.price;
        }
      }
      setLivePrices(priceMap);`;

const newFill = `const priceMap: LivePriceMap = {};
      for (const [ticker, info] of Object.entries(prices)) {
        priceMap[ticker] = {
          ticker,
          price: info.price,
          change: info.change,
          changePct: info.changePct,
          previousClose: null,
          timestamp: new Date(),
        };
      }
      setLivePrices(priceMap);`;

if (!content.includes(oldFill)) {
  console.error("KHONG TIM THAY oldFill - can kiem tra thu cong.");
  process.exit(1);
}
content = content.replace(oldFill, newFill);

fs.writeFileSync(path, content, "utf8");
console.log("DA SUA XONG type mismatch.");
