/**
 * livePriceApi.ts
 * Service riêng cho Live Price - KHÔNG liên quan đến tang1Api.ts
 * Sử dụng Yahoo Finance API miễn phí
 */

export interface LivePrice {
  ticker: string;
  price: number | null;
  change: number | null;      // Change amount
  changePct: number | null;   // Change percentage
  previousClose: number | null;
  timestamp: Date;
  error?: string;
}

export interface LivePriceResponse {
  [ticker: string]: LivePrice;
}

// Yahoo Finance API endpoint
const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

/**
 * Fetch live price cho 1 ticker từ Yahoo Finance
 */
export async function fetchLivePrice(ticker: string): Promise<LivePrice> {
  try {
    // Yahoo Finance yêu cầu suffix .VN cho cổ phiếu VN
    const yahooSymbol = `${ticker}.VN`;
    const url = `${YAHOO_BASE}/${yahooSymbol}?interval=1d&range=1d`;
    
    const res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      throw new Error('No data');
    }

    const meta = result.meta;
    const quote = result.indicators?.quote?.[0];

    const price = meta.regularMarketPrice ?? null;
    const previousClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
    const change = price !== null && previousClose !== null 
      ? price - previousClose 
      : null;
    const changePct = change !== null && previousClose !== null && previousClose !== 0
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
    console.warn(`[livePriceApi] Failed to fetch ${ticker}:`, err);
    return {
      ticker,
      price: null,
      change: null,
      changePct: null,
      previousClose: null,
      timestamp: new Date(),
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Fetch live prices cho nhiều tickers (batch)
 * Sử dụng Promise.allSettled để không fail toàn bộ nếu 1 ticker lỗi
 */
export async function fetchLivePrices(tickers: string[]): Promise<LivePriceResponse> {
  if (tickers.length === 0) {
    return {};
  }

  // Limit batch size to avoid rate limiting
  const BATCH_SIZE = 10;
  const results: LivePriceResponse = {};

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    
    const batchResults = await Promise.allSettled(
      batch.map(ticker => fetchLivePrice(ticker))
    );

    batchResults.forEach((result, index) => {
      const ticker = batch[index];
      if (result.status === 'fulfilled') {
        results[ticker] = result.value;
      } else {
        results[ticker] = {
          ticker,
          price: null,
          change: null,
          changePct: null,
          previousClose: null,
          timestamp: new Date(),
          error: result.reason?.message || 'Failed',
        };
      }
    });

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}
