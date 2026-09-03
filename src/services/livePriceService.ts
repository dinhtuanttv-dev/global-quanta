/**
 * livePriceService.ts
 * ────────────────────────────────────────────────────────────────
 * Service lấy giá thật từ Yahoo Finance cho SIDEBAR.
 * Copy pattern từ SieuQuetAI/livePriceApi.ts, adapt để tích hợp
 * với priceTickEngine.
 *
 * LUỒNG HOẠT ĐỘNG:
 *   1. WatchlistRow mount → usePriceTick subscribe ticker
 *   2. livePriceService.startPolling() được gọi (singleton)
 *   3. Mỗi POLL_INTERVAL_MS: fetch batch từ Yahoo Finance
 *   4. Gọi priceTickEngine.applyExternalPrice(ticker, price)
 *      → engine update → listeners (usePriceTick) nhận → re-render
 *
 * LỢI ÍCH:
 *   - Giá thật thay vì random jitter
 *   - Vẫn giữ 1 interval duy nhất (qua priceTickEngine singleton)
 *   - Batch 10 tickers/lần để tránh rate limit
 *   - Fallback về basePrice nếu API fail
 */

import { priceTickEngine } from './priceTickEngine';
import { normalizeTicker } from '../utils/normalizeTicker';

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';
const POLL_INTERVAL_MS = 10_000; // 10 giây - đủ nhanh để cảm nhận, đủ chậm để không bị rate limit
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 100;

interface YahooChartMeta {
  regularMarketPrice?: number;
  previousClose?: number;
  chartPreviousClose?: number;
  regularMarketTime?: number;
}

interface YahooChartResult {
  meta: YahooChartMeta;
}

interface YahooChartResponse {
  chart: { result?: YahooChartResult[] };
}

interface LivePriceData {
  ticker: string;
  price: number | null;
  error?: string;
}

/**
 * Fetch giá 1 ticker từ Yahoo Finance.
 * Return null nếu fail (không throw để batch không bị break).
 */
async function fetchYahooPrice(ticker: string): Promise<LivePriceData> {
  try {
    const yahooSymbol = `${ticker}.VN`;
    const url = `${YAHOO_BASE}/${yahooSymbol}?interval=1d&range=1d`;

    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const data: YahooChartResponse = await res.json();
    const result = data?.chart?.result?.[0];

    if (!result) {
      throw new Error('No data');
    }

    const price = result.meta.regularMarketPrice ?? null;

    return { ticker, price };
  } catch (err) {
    return {
      ticker,
      price: null,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

/**
 * Fetch giá cho nhiều tickers theo batch.
 * Trả về map { ticker → price } (chỉ những ticker fetch thành công).
 */
async function fetchYahooPrices(tickers: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map((t) => fetchYahooPrice(t)),
    );

    batchResults.forEach((r) => {
      if (r.status === 'fulfilled' && r.value.price !== null) {
        result.set(r.value.ticker, r.value.price);
      } else if (r.status === 'rejected') {
        console.warn(`[livePriceService] Failed:`, r.reason);
      }
    });

    // Delay giữa các batch để tránh rate limit
    if (i + BATCH_SIZE < tickers.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return result;
}

// ── SINGLETON POLLER ─────────────────────────────────────────────

let pollHandle: ReturnType<typeof setInterval> | null = null;
let isPolling = false;

/**
 * Bắt đầu polling giá thật. Singleton - chỉ chạy 1 interval.
 * Tự động lấy ticker đang active từ priceTickEngine (những ticker
 * có component subscribe qua usePriceTick).
 */
export function startLivePricePolling(): void {
  if (pollHandle !== null) return; // đã chạy rồi

  // Tắt random jitter trong engine - giờ dùng giá thật
  priceTickEngine.setJitterEnabled(false);

  const tickers = priceTickEngine.getActiveTickers();
  if (tickers.length === 0) return;

  // Fetch ngay lập tức (không đợi interval đầu)
  void pollOnce();

  pollHandle = setInterval(() => {
    if (isPolling) return; // skip nếu đang fetch
    void pollOnce();
  }, POLL_INTERVAL_MS);
}

/**
 * Dừng polling. Gọi khi Sidebar unmount hoặc watchlist rỗng.
 * Bật lại random jitter để giá vẫn dao động khi không có polling.
 */
export function stopLivePricePolling(): void {
  if (pollHandle !== null) {
    clearInterval(pollHandle);
    pollHandle = null;
  }
  // Bật lại jitter để engine không bị đóng băng
  priceTickEngine.setJitterEnabled(true);
}

async function pollOnce(): Promise<void> {
  isPolling = true;
  try {
    const tickers = priceTickEngine.getActiveTickers();
    if (tickers.length === 0) {
      isPolling = false;
      return;
    }

    const prices = await fetchYahooPrices(tickers);
    prices.forEach((price, ticker) => {
      // applyExternalPrice tự notify listeners → usePriceTick re-render
      priceTickEngine.applyExternalPrice(ticker, price);
    });

    if (prices.size > 0) {
      console.log(`[livePriceService] Updated ${prices.size}/${tickers.length} prices from Yahoo`);
    }
  } catch (err) {
    console.warn('[livePriceService] Polling failed:', err);
  } finally {
    isPolling = false;
  }
}