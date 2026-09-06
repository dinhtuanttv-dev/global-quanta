const fs = require("fs");
const path = "./global-quanta/src/store/useAppStore.ts";
let content = fs.readFileSync(path, "utf8");

const oldInterface = `  markRead: (ticker: string) => void;`;
const newInterface = `  markRead: (ticker: string) => void;
  updateLivePrices: (prices: Record<string, { price: number; changePct: number | null }>) => void;`;

if (!content.includes(oldInterface)) {
  console.error("KHONG TIM THAY oldInterface.");
  process.exit(1);
}
content = content.replace(oldInterface, newInterface);

const oldImpl = `  markRead: (ticker) => {
    set((s) => ({
      watchlist: s.watchlist.map((x) => (x.ticker === ticker ? { ...x, unread: false } : x)),
    }));
  },`;
const newImpl = `  markRead: (ticker) => {
    set((s) => ({
      watchlist: s.watchlist.map((x) => (x.ticker === ticker ? { ...x, unread: false } : x)),
    }));
  },
  updateLivePrices: (prices) => {
    set((s) => ({
      watchlist: s.watchlist.map((x) => {
        const p = prices[x.ticker];
        if (!p || p.price === null) return x;
        return { ...x, price: p.price, changePct: p.changePct ?? x.changePct };
      }),
    }));
  },`;

if (!content.includes(oldImpl)) {
  console.error("KHONG TIM THAY oldImpl.");
  process.exit(1);
}
content = content.replace(oldImpl, newImpl);

fs.writeFileSync(path, content, "utf8");
console.log("DA THEM updateLivePrices vao store.");
