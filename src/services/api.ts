import mockData from '../mocks/mock-data.json';
import type {
  WatchlistStock, AddableStock, RadarCoreNode, RadarRingNode,
  RadarDigest, ConcentrationRisk, NewsItem, VnIndexData, MacroTickerData, LiquidityData,
} from '../types';

const delay = (ms = 200) => new Promise((res) => setTimeout(res, ms));

const WATCHLIST_STORAGE_KEY = 'gq_watchlist_v1';

function loadWatchlistFromStorage(): WatchlistStock[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WatchlistStock[];
  } catch {
    return null;
  }
}

function saveWatchlistToStorage(list: WatchlistStock[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(list));
  } catch {
  }
}

export async function login(username: string, password: string): Promise<boolean> {
  await delay(400);
  return username === 'demo' && password === 'demo123';
}

export async function fetchRegime(): Promise<{ state: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' }> {
  await delay();
  return mockData['GET /market/regime'] as any;
}

export async function fetchVnIndex(): Promise<VnIndexData> {
  await delay();
  return mockData['GET /market/vnindex'] as any;
}

export async function fetchMacroTickers(): Promise<MacroTickerData[]> {
  await delay();
  return mockData['GET /market/macro-tickers'] as any;
}

export async function fetchBreadth(): Promise<{ advancers: number; decliners: number }> {
  await delay();
  return mockData['GET /market/breadth'] as any;
}

export async function fetchLiquidity1030(): Promise<LiquidityData> {
  await delay();
  return mockData['GET /market/liquidity-1030'] as any;
}

export async function fetchSessions(): Promise<Record<string, 'open' | 'closed'>> {
  await delay();
  return mockData['GET /market/sessions'] as any;
}

let _watchlistCache: WatchlistStock[] | null = null;

export async function fetchWatchlist(): Promise<WatchlistStock[]> {
  await delay(300);
  if (!_watchlistCache) {
    const stored = loadWatchlistFromStorage();
    if (stored) {
      _watchlistCache = stored;
    } else {
      _watchlistCache = JSON.parse(JSON.stringify(mockData['GET /watchlist']));
      saveWatchlistToStorage(_watchlistCache!);
    }
  }
  return _watchlistCache!;
}

export async function searchAddableStocks(query: string): Promise<AddableStock[]> {
  await delay(150);
  const pool = mockData['GET /stocks/search?q= (kho mã có thể thêm, chưa có trong watchlist)'] as AddableStock[];
  const q = query.toUpperCase();
  return pool.filter((s) => s.ticker.includes(q) && !_watchlistCache?.some((w) => w.ticker === s.ticker));
}

export async function addToWatchlist(stock: AddableStock): Promise<WatchlistStock> {
  await delay(250);
  const newStock: WatchlistStock = {
    ticker: stock.ticker, sector: stock.sector, price: 0, changePct: 0,
    tag: 'none', convScore: 0, groups: [], pinned: false, reason: 'Moi them thu cong',
    addedAt: new Date().toISOString().slice(0, 10), addedPerfPct: 0, unread: false, similarTo: null,
  };
  _watchlistCache = [...(_watchlistCache ?? []), newStock];
  saveWatchlistToStorage(_watchlistCache);
  return newStock;
}

export async function removeFromWatchlist(ticker: string): Promise<void> {
  await delay(200);
  _watchlistCache = (_watchlistCache ?? []).filter((s) => s.ticker !== ticker);
  saveWatchlistToStorage(_watchlistCache);
}

export async function restoreToWatchlist(stock: WatchlistStock, index: number): Promise<void> {
  await delay(100);
  const list = [..._watchlistCache ?? []];
  list.splice(index, 0, stock);
  _watchlistCache = list;
  saveWatchlistToStorage(_watchlistCache);
}

export async function patchWatchlistStock(ticker: string, patch: Partial<WatchlistStock>): Promise<void> {
  await delay(150);
  _watchlistCache = (_watchlistCache ?? []).map((s) => (s.ticker === ticker ? { ...s, ...patch } : s));
  saveWatchlistToStorage(_watchlistCache);
}

export async function fetchRadarCore(): Promise<RadarCoreNode[]> {
  await delay();
  return mockData['GET /radar/core'] as any;
}

export async function fetchRadarRing(): Promise<RadarRingNode[]> {
  await delay();
  return mockData['GET /radar/ring'] as any;
}

export async function fetchRadarDigest(): Promise<RadarDigest> {
  await delay();
  return mockData['GET /radar/digest'] as any;
}

export async function fetchConcentrationRisk(): Promise<ConcentrationRisk> {
  await delay();
  return mockData['GET /radar/concentration-risk'] as any;
}

export async function fetchNewsFeed(): Promise<NewsItem[]> {
  await delay();
  return mockData['GET /news/feed'] as any;
}

export async function placeOrderIntent(ticker: string, side: 'buy' | 'sell'): Promise<void> {
  await delay(200);
  console.log(`[demo] Dat y dinh lenh ${side.toUpperCase()} cho ${ticker}`);
}

export async function createAlert(ticker: string): Promise<void> {
  await delay(200);
}

