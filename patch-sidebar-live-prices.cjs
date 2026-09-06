const fs = require("fs");
const path = "./global-quanta/src/components/Sidebar/Sidebar.tsx";
let content = fs.readFileSync(path, "utf8");

const oldImport = `import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';`;
const newImport = `import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { fetchLivePrices } from '../MainTabs/SieuQuetAI/livePriceApi';`;

if (!content.includes(oldImport)) {
  console.error("KHONG TIM THAY oldImport.");
  process.exit(1);
}
content = content.replace(oldImport, newImport);

const oldDestructure = `    searchText, setSearchText, selectedTicker, selectTicker, showToast,
  } = useAppStore();`;
const newDestructure = `    searchText, setSearchText, selectedTicker, selectTicker, showToast,
    updateLivePrices,
  } = useAppStore();`;

if (!content.includes(oldDestructure)) {
  console.error("KHONG TIM THAY oldDestructure.");
  process.exit(1);
}
content = content.replace(oldDestructure, newDestructure);

const oldMount = `  useEffect(() => { loadWatchlist(); }, [loadWatchlist]);`;
const newMount = `  useEffect(() => { loadWatchlist(); }, [loadWatchlist]);

  const watchlistRef = useRef(watchlist);
  useEffect(() => { watchlistRef.current = watchlist; }, [watchlist]);

  const pollLivePrices = useCallback(async () => {
    const tickers = watchlistRef.current.map((s) => s.ticker);
    if (tickers.length === 0) return;
    try {
      const prices = await fetchLivePrices(tickers);
      const priceMap: Record<string, { price: number; changePct: number | null }> = {};
      for (const [ticker, info] of Object.entries(prices)) {
        if (info.price !== null) {
          priceMap[ticker] = { price: info.price, changePct: info.changePct };
        }
      }
      updateLivePrices(priceMap);
    } catch (err) {
      console.warn('[Sidebar] Failed to fetch live prices:', err);
    }
  }, [updateLivePrices]);

  useEffect(() => {
    if (watchlist.length === 0) return;
    pollLivePrices();
    const interval = setInterval(pollLivePrices, 60_000);
    return () => clearInterval(interval);
  }, [watchlist.length, pollLivePrices]);`;

if (!content.includes(oldMount)) {
  console.error("KHONG TIM THAY oldMount.");
  process.exit(1);
}
content = content.replace(oldMount, newMount);

fs.writeFileSync(path, content, "utf8");
console.log("DA THEM polling gia that vao Sidebar.");
