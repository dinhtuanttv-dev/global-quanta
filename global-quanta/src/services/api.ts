import mockData from '../mocks/mock-data.json';
import { isMarketGatewayEnabled, marketUrl } from './marketDataClient';
import type {
  WatchlistStock, AddableStock, RadarCoreNode, RadarRingNode,
  RadarDigest, ConcentrationRisk, NewsItem, VnIndexData, MacroTickerData, LiquidityData,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
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

// ===== ĐĂNG NHẬP (Railway Gateway, 23/10/2026 — thay Supabase Auth đang bị khoá) =====
// Access token JWT Ed25519 15 phút + refresh token 30 ngày (đổi mới mỗi lần dùng) do Gateway /api/auth cấp. Phiên Supabase cũ
// (gq_supabase_session_v1) bị xoá và người dùng được báo đăng nhập lại.
export function isAuthConfigured(): boolean {
  return isMarketGatewayEnabled();
}

export interface AuthUser { id: string; email: string; admin: boolean; mustChangePassword: boolean }
interface AuthSession { access_token: string; refresh_token: string; expires_at: number; user: AuthUser }
interface AuthTokenResponse { access_token: string; refresh_token: string; expires_in: number; expires_at?: number; user: AuthUser; error?: string }

const AUTH_SESSION_KEY = 'gq_session_v2';
const LEGACY_SESSION_KEY = 'gq_supabase_session_v1';

/** Có phiên Supabase cũ không (đã chuyển hệ thống đăng nhập) — xoá và trả true một lần để giao diện báo. */
export function consumeLegacySession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.localStorage.getItem(LEGACY_SESSION_KEY) === null) return false;
    window.localStorage.removeItem(LEGACY_SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

function readAuthSession(): AuthSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const session = JSON.parse(window.localStorage.getItem(AUTH_SESSION_KEY) ?? 'null') as AuthSession | null;
    return session?.access_token && session?.refresh_token && Number.isFinite(session.expires_at) && session.user?.id ? session : null;
  } catch {
    return null;
  }
}

function saveAuthSession(r: AuthTokenResponse): void {
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    access_token: r.access_token, refresh_token: r.refresh_token,
    expires_at: Date.now() + r.expires_in * 1000, user: r.user,
  } satisfies AuthSession));
}

function clearAuthSession(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(AUTH_SESSION_KEY);
}

const validTokenResponse = (r: AuthTokenResponse | null): r is AuthTokenResponse =>
  Boolean(r?.access_token && r?.refresh_token && Number.isFinite(r?.expires_in) && r.expires_in > 0 && r.user?.id);

/** Người dùng của phiên hiện tại (menu tài khoản); null nếu chưa đăng nhập. */
export function currentUser(): AuthUser | null {
  return readAuthSession()?.user ?? null;
}

/** Email của phiên đăng nhập hiện tại (menu tài khoản trên thanh trên); null nếu không có. */
export function currentUserEmail(): string | null {
  return readAuthSession()?.user?.email ?? null;
}

export function hasAuthSession(): boolean {
  const session = readAuthSession();
  return Boolean(session && session.expires_at > Date.now());
}

let refreshInFlight: Promise<boolean> | null = null;

/** Phiên còn dùng được (tự đổi access token khi sắp hết hạn bằng refresh token). */
export async function restoreSession(): Promise<boolean> {
  if (!isAuthConfigured()) return false;
  const session = readAuthSession();
  if (!session) return false;
  if (session.expires_at > Date.now() + 60_000) return true;

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(marketUrl('/api/auth/refresh'), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refresh_token: session.refresh_token }),
        });
        if (response.status === 401) {
          clearAuthSession();
          return false;
        }
        if (!response.ok) return false; // lỗi tạm (mạng / 5xx): giữ phiên, thử lại lần sau
        const refreshed = await response.json() as AuthTokenResponse;
        if (!validTokenResponse(refreshed)) {
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

/** Access token còn hạn (tự làm mới nếu sắp hết) — để gọi API cần đăng nhập. */
export async function getAccessToken(): Promise<string | null> {
  if (!(await restoreSession())) return null;
  return readAuthSession()?.access_token ?? null;
}

export async function signOut(): Promise<void> {
  const session = readAuthSession();
  clearAuthSession();
  if (!session) return;
  try {
    await fetch(marketUrl('/api/auth/logout'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
  } catch {
    // Xoá phiên cục bộ vẫn đăng xuất trên máy này.
  }
}

/** Đổi mật khẩu: null nếu thành công, ngược lại thông báo lỗi. Các phiên ở máy khác bị thu hồi. */
export async function changePassword(currentPassword: string, newPassword: string): Promise<string | null> {
  const token = await getAccessToken();
  if (!token) return 'Phiên đăng nhập đã hết hạn — hãy đăng nhập lại.';
  try {
    const response = await fetch(marketUrl('/api/auth/change-password'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    if (response.ok) {
      const session = readAuthSession();
      if (session) window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({ ...session, user: { ...session.user, mustChangePassword: false } }));
      return null;
    }
    const body = await response.json().catch(() => ({})) as { error?: string };
    return body.error ?? `Lỗi ${response.status}`;
  } catch {
    return 'Không kết nối được máy chủ đăng nhập.';
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

/** Đăng nhập: true nếu thành công, ngược lại thông báo lỗi (sai thông tin / bị khoá tạm / lỗi kết nối). */
export async function login(email: string, password: string): Promise<true | string> {
  if (!isAuthConfigured()) return 'Máy chủ đăng nhập (Market Gateway) đang tắt cho website này.';
  try {
    const response = await fetch(marketUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const body = await response.json().catch(() => null) as AuthTokenResponse | null;
    if (!response.ok) return body?.error ?? 'Không đăng nhập được. Hãy kiểm tra email và mật khẩu rồi thử lại.';
    if (!validTokenResponse(body)) return 'Máy chủ trả phiên không hợp lệ.';
    saveAuthSession(body);
    return true;
  } catch {
    return 'Không kết nối được máy chủ đăng nhập. Hãy thử lại.';
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
