const fs = require("fs");
const path = "./global-quanta/src/components/MainTabs/SieuQuetAI/livePriceApi.ts";

const newContent = `/**
 * livePriceApi.ts
 * Service Live Price cho SieuQuetAI. Uu tien goi qua backend proxy
 * (tranh CORS tu Yahoo Finance khi goi thang tu browser). Neu proxy
 * khong kha dung hoac loi, fallback goi truc tiep Yahoo Finance.
 */

export interface LivePrice {
  ticker: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  previousClose: number | null;
  timestamp: Date;
  error?: string;
}

export interface LivePriceResponse {
  [ticker: string]: LivePrice;
}

const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart";
const PROXY_BASE = import.meta.env.VITE_API_BASE_URL
  ? \`\${import.meta.env.VITE_API_BASE_URL}/api/proxy/yahoo\`
  : "";

interface ProxyQuote {
  price: number | null;
  change: number | null;
  changePct: number | null;
  previousClose: number | null;
  error?: string;
}

async function fetchViaProxy(tickers: string[]): Promise<LivePriceResponse | null> {
  if (!PROXY_BASE || tickers.length === 0) return null;
  try {
    const url = \`\${PROXY_BASE}?symbols=\${tickers.join(",")}\`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;

    const data: Record<string, ProxyQuote> = await res.json();
    const result: LivePriceResponse = {};
    let successCount = 0;

    for (const ticker of tickers) {
      const q = data[ticker];
      if (q && q.price !== null) {
        successCount++;
        result[ticker] = {
          ticker,
          price: q.price,
          change: q.change,
          changePct: q.changePct,
          previousClose: q.previousClose,
          timestamp: new Date(),
        };
      } else {
        result[ticker] = {
          ticker,
          price: null,
          change: null,
          changePct: null,
          previousClose: null,
          timestamp: new Date(),
          error: q?.error ?? "Khong co du lieu tu proxy",
        };
      }
    }

    return successCount > 0 ? result : null;
  } catch (err) {
    console.warn("[livePriceApi] Proxy fetch failed:", err);
    return null;
  }
}

/**
 * Fetch live price cho 1 ticker truc tiep tu Yahoo Finance (fallback).
 */
export async function fetchLivePrice(ticker: string): Promise<LivePrice> {
  try {
    const yahooSymbol = \`\${ticker}.VN\`;
    const url = \`\${YAHOO_BASE}/\${yahooSymbol}?interval=1d&range=1d\`;

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(\`HTTP \${res.status}\`);
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      throw new Error("No data");
    }

    const meta = result.meta;
    const price = meta.regularMarketPrice ?? null;
    const previousClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
    const change = price !== null && previousClose !== null ? price - previousClose : null;
    const changePct =
      change !== null && previousClose !== null && previousClose !== 0
        ? (change / previousClose) * 100
        : null;

    return {
      ticker,
      price,
      change,
      changePct,
      previousClose,
      timestamp: new Date(meta.regularMarketTime * 1000),
    };
  } catch (err) {
    console.warn(\`[livePriceApi] Failed to fetch \${ticker}:\`, err);
    return {
      ticker,
      price: null,
      change: null,
      changePct: null,
      previousClose: null,
      timestamp: new Date(),
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Fetch live prices cho nhieu tickers. Uu tien qua proxy backend,
 * fallback goi truc tiep Yahoo Finance (batch) neu proxy that bai.
 */
export async function fetchLivePrices(tickers: string[]): Promise<LivePriceResponse> {
  if (tickers.length === 0) {
    return {};
  }

  const proxyResult = await fetchViaProxy(tickers);
  if (proxyResult) return proxyResult;

  console.log("[livePriceApi] Proxy khong kha dung, fallback goi truc tiep Yahoo Finance");

  const BATCH_SIZE = 10;
  const results: LivePriceResponse = {};

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map((ticker) => fetchLivePrice(ticker))
    );

    batchResults.forEach((result, index) => {
      const ticker = batch[index];
      if (result.status === "fulfilled") {
        results[ticker] = result.value;
      } else {
        results[ticker] = {
          ticker,
          price: null,
          change: null,
          changePct: null,
          previousClose: null,
          timestamp: new Date(),
          error: result.reason?.message || "Failed",
        };
      }
    });

    if (i + BATCH_SIZE < tickers.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return results;
}
`;

fs.writeFileSync(path, newContent, "utf8");
console.log("DA VA XONG livePriceApi.ts - them proxy-first fetching.");
