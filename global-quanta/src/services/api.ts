import mockData from '../mocks/mock-data.json';
import { isMarketGatewayEnabled, marketUrl } from './marketDataClient';
import type {
  WatchlistStock, AddableStock, RadarCoreNode, RadarRingNode,
  RadarDigest, ConcentrationRisk, NewsItem, VnIndexData, MacroTickerData, LiquidityData,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '') ?? '';
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
const delay = (ms = 200) => new Promise((res) => setTimeout(res, ms));

/** Calls the same-origin Express proxy; SSI credentials and access tokens stay on the server. */
export async function fetchSsiMarketData<T = unknown>(
  endpoint: 'Securities' | 'SecuritiesDetails' | 'IndexComponents' | 'IndexList' | 'DailyOhlc' | 'IntradayOhlc' | 'DailyIndex' | 'DailyStockPrice',
  params: Record<string, string | number | boolean> = {},
): Promise<T> {
  const query = new URLSearchParams(Object.entries(params).map(([key, value]): [string, string] => [key, String(value)]));
  const serializedQuery = query.toString();
  const response = await fetch(`${API_BASE}/api/ssi/market/${endpoint}${serializedQuery ? `?${serializedQuery}` : ''}`);
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? `SSI API error: ${response.status}`);
  return body as T;
}

export function subscribeSsiMarketQuotes(
  symbols: string[],
  onQuote: (quote: unknown) => void,
  onStatus?: (connected: boolean) => void,
): () => void {
  const normalized = [...new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean))];
  const batches: string[][] = [];
  for (let index = 0; index < normalized.length; index += 50) batches.push(normalized.slice(index, index + 50));
  const connected = batches.map(() => false);
  const sources = batches.map((batch, batchIndex) => {
    const query = new URLSearchParams({ symbols: batch.join(',') });
    const source = new EventSource(`${API_BASE}/api/ssi/stream/market?${query}`);
    source.addEventListener('quote', (event) => {
      try { onQuote(JSON.parse((event as MessageEvent<string>).data)); } catch { /* discard malformed stream data */ }
    });
    source.addEventListener('status', (event) => {
      try {
        connected[batchIndex] = JSON.parse((event as MessageEvent<string>).data).connected === true;
        onStatus?.(connected.length > 0 && connected.every(Boolean));
      } catch { /* ignore malformed status */ }
    });
    source.addEventListener('error', () => {
      connected[batchIndex] = false;
      onStatus?.(false);
    });
    source.onerror = () => {
      connected[batchIndex] = false;
      onStatus?.(false);
    };
    return source;
  });
  return () => sources.forEach((source) => source.close());
}

export function isSupabaseAuthConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

interface SupabaseTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

const AUTH_SESSION_KEY = 'gq_supabase_session_v1';

function readAuthSession(): SupabaseSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const session = JSON.parse(window.localStorage.getItem(AUTH_SESSION_KEY) ?? 'null') as SupabaseSession | null;
    return session?.access_token && session?.refresh_token && Number.isFinite(session.expires_at) ? session : null;
  } catch {
    return null;
  }
}

function saveAuthSession(session: SupabaseTokenResponse): void {
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Date.now() + session.expires_in * 1000,
  } satisfies SupabaseSession));
}

function clearAuthSession(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(AUTH_SESSION_KEY);
}

export function hasAuthSession(): boolean {
  const session = readAuthSession();
  return Boolean(session && session.expires_at > Date.now());
}

let refreshInFlight: Promise<boolean> | null = null;

export async function restoreSupabaseSession(): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return false;
  const session = readAuthSession();
  if (!session) return false;
  if (session.expires_at > Date.now() + 60_000) return true;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        if (!response.ok) {
          clearAuthSession();
          return false;
        }
        const refreshed = await response.json() as SupabaseTokenResponse;
        if (!refreshed.access_token || !refreshed.refresh_token || !Number.isFinite(refreshed.expires_in) || refreshed.expires_in <= 0) {
          clearAuthSession();
          return false;
        }
        saveAuthSession(refreshed);
        return true;
      } catch {
        return false;
      }
    })().finally(() => { refreshInFlight = null; });
  }
  return refreshInFlight;
}

/** Access token Supabase còn hạn (tự làm mới nếu sắp hết) — để gọi API Gateway cần đăng nhập. */
export async function getAccessToken(): Promise<string | null> {
  if (!(await restoreSupabaseSession())) return null;
  return readAuthSession()?.access_token ?? null;
}

export async function signOutSupabase(): Promise<void> {
  const session = readAuthSession();
  clearAuthSession();
  if (!session || !SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, authorization: `Bearer ${session.access_token}` },
    });
  } catch {
    // Clearing the local session still signs the user out on this device.
  }
}

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

export async function login(email: string, password: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    if (!response.ok) return false;
    const session = await response.json() as SupabaseTokenResponse;
    if (!session.access_token || !session.refresh_token || !Number.isFinite(session.expires_in) || session.expires_in <= 0) return false;
    saveAuthSession(session);
    return true;
  } catch {
    return false;
  }
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

// Cache danh sach toan bo VN30+VN100 lay tu /api/universe - chi fetch 1 lan
// cho ca phien lam viec, tranh goi mang lien tuc moi lan go phim.
let _universeCache: AddableStock[] | null = null;

async function loadUniverse(): Promise<AddableStock[]> {
  if (_universeCache) return _universeCache;
  try {
    const res = await fetch(isMarketGatewayEnabled() ? marketUrl('/api/market/universe') : `${API_BASE}/api/universe`);
    if (!res.ok) throw new Error(`Universe API loi: ${res.status}`);
    const json = await res.json();
    _universeCache = (json.tickers ?? []) as AddableStock[];
  } catch (err) {
    console.error('[searchAddableStocks] Khong lay duoc universe that, dung mock du phong:', err);
    _universeCache = mockData['GET /stocks/search?q= (kho mã có thể thêm, chưa có trong watchlist)'] as AddableStock[];
  }
  return _universeCache;
}

export async function searchAddableStocks(query: string): Promise<AddableStock[]> {
  const pool = await loadUniverse();
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
