/**
 * livePriceService.ts
 * Service TRUNG TAM cho Live Prices - dung cho CA Sidebar VA SieuQuetAI.
 */

import { priceTickEngine } from "./priceTickEngine";

const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const YAHOO_PROXY_BASE = import.meta.env.VITE_API_BASE_URL
  ? `${import.meta.env.VITE_API_BASE_URL}/api/proxy/yahoo`
  : "";

const POLL_INTERVAL_MS = 10_000;const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 100;

interface YahooProxyResponse {
  [symbol: string]: {
    price: number | null;
    change: number | null;
    changePct: number | null;
    previousClose: number | null;
    error?: string;
  };
}

interface YahooChartMeta {
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
  regularMarketTime?: number;
}

interface YahooChartResult { meta: YahooChartMeta; }
interface YahooChartResponse { chart: { result?: YahooChartResult[] }; }

export interface LivePriceResult {
  [ticker: string]: {
    price: number | null;
    change: number | null;
    changePct: number | null;
  };
}

interface LivePriceData {
  ticker: string;
  price: number | null;
  change?: number | null;
  changePct?: number | null;
  error?: string;
}

// Fetch tu proxy backend (khong CORS)
async function fetchViaProxy(tickers: string[]): Promise<Map<string, LivePriceData>> {
  const result = new Map<string, LivePriceData>();
  if (!YAHOO_PROXY_BASE) return result;

  try {
    const url = `${YAHOO_PROXY_BASE}?symbols=${tickers.join(",")}`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.warn(`[livePriceService] Proxy HTTP ${res.status}`);
      return result;
    }

    const data: YahooProxyResponse = await res.json();
    for (const [ticker, info] of Object.entries(data)) {
      result.set(ticker, {
        ticker,
        price: info.price ?? null,
        change: info.change ?? null,
        changePct: info.changePct ?? null,
        error: info.error,
      });
    }
  } catch (err) {
    console.warn("[livePriceService] Proxy fetch failed:", err);
  }
  return result;
}

// Fetch truc tiep tu Yahoo Finance (fallback, co the bi CORS)
async function fetchViaDirect(tickers: string[]): Promise<Map<string, LivePriceData>> {
  const result = new Map<string, LivePriceData>();

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map(async (ticker) => {
        const yahooSymbol = `${ticker}.VN`;
        const url = `${YAHOO_BASE}/${yahooSymbol}?interval=1d&range=1d`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data: YahooChartResponse = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta) throw new Error("No data");

        return { ticker, price: meta.regularMarketPrice ?? null, change: null, changePct: null };
      })
    );

    batchResults.forEach((r, idx) => {
      const ticker = batch[idx];
      if (r.status === "fulfilled") {
        result.set(ticker, r.value);
      } else {
        result.set(ticker, {
          ticker,
          price: null,
          error: r.reason instanceof Error ? r.reason.message : "Unknown error",
        });
      }
    });

    if (i + BATCH_SIZE < tickers.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }
  return result;
}

// Fetch gia cho nhieu tickers
// FIX: Kiem tra so luong price thuc su co gia tri, khong chi size cua map
async function fetchYahooPrices(tickers: string[]): Promise<Map<string, LivePriceData>> {
  if (tickers.length === 0) return new Map();
  if (YAHOO_PROXY_BASE) {
    const proxyResult = await fetchViaProxy(tickers);
    const successCount = Array.from(proxyResult.values()).filter(v => v.price !== null).length;
    if (successCount > 0) return proxyResult;
    console.log(`[livePriceService] Proxy returned ${proxyResult.size} results but 0 valid prices, falling back to direct`);
  }
  console.log("[livePriceService] Using direct Yahoo Finance (no proxy or proxy failed)");
  return fetchViaDirect(tickers);
}

// SINGLETON POLLER (cho Sidebar)
let pollHandle: ReturnType<typeof setInterval> | null = null;
let isPolling = false;

export function startLivePricePolling(): void {
  if (pollHandle !== null) return;
  priceTickEngine.setJitterEnabled(false);
  void pollOnce();
  pollHandle = setInterval(() => {
    if (isPolling) return;
    void pollOnce();
  }, POLL_INTERVAL_MS);
  console.log("[livePriceService] Polling started (interval: 10s)");
}

export function stopLivePricePolling(): void {
  if (pollHandle !== null) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
  priceTickEngine.setJitterEnabled(true);
  console.log("[livePriceService] Polling stopped");
}

async function pollOnce(): Promise<void> {
  if (isPolling) return;
  isPolling = true;
  try {
    const tickers = priceTickEngine.getActiveTickers();
    if (tickers.length === 0) return;
    const prices = await fetchYahooPrices(tickers);
    let successCount = 0;
    prices.forEach((data, ticker) => {
      if (data.price !== null) {
        priceTickEngine.applyExternalPrice(ticker, data.price);
        successCount++;
      } else if (data.error) {
        console.warn(`[livePriceService] ${ticker}: ${data.error}`);
      }
    });
    if (successCount > 0) {
      console.log(`[livePriceService] OK ${successCount}/${tickers.length} prices updated`);
    }
  } catch (err) {
    console.warn("[livePriceService] Polling error:", err);
  } finally {
    isPolling = false;
  }
}

// PUBLIC API (cho SieuQuetAI)
export async function fetchLivePrices(tickers: string[]): Promise<LivePriceResult> {
  if (tickers.length === 0) return {};
  const prices = await fetchYahooPrices(tickers);
  const result: LivePriceResult = {};
  prices.forEach((data, ticker) => {
    result[ticker] = {
      price: data.price,
      change: data.change ?? null,
      changePct: data.changePct ?? null,
    };
  });
  return result;
}
