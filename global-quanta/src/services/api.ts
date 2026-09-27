import mockData from '../mocks/mock-data.json';
import type {
  WatchlistStock, AddableStock, RadarCoreNode, RadarRingNode,
  RadarDigest, ConcentrationRisk, NewsItem, VnIndexData, MacroTickerData, LiquidityData, RadarDataStatus,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';
const ACTION_API_BASE = (import.meta.env.VITE_ACTIONS_API_BASE_URL ?? API_BASE).replace(/\/+$/, '');
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '') ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
const RADAR_API_BASE = (import.meta.env.VITE_RADAR_API_BASE_URL ?? (API_BASE || 'https://tuan-quant-scanner-psi.vercel.app')).replace(/\/+$/, '');
const delay = (ms = 200) => new Promise((res) => setTimeout(res, ms));

interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

const AUTH_SESSION_KEY = 'gq_supabase_session_v1';

function readAuthSession(): SupabaseSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(AUTH_SESSION_KEY) ?? 'null') as SupabaseSession | null;
    return value?.access_token && value?.refresh_token ? value : null;
  } catch {
    return null;
  }
}

function saveAuthSession(session: Omit<SupabaseSession, 'expires_at'> & { expires_in: number }) {
  window.localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: Date.now() + session.expires_in * 1000,
  } satisfies SupabaseSession));
}

export function hasAuthSession(): boolean {
  return Boolean(readAuthSession());
}

let refreshInFlight: Promise<string | null> | null = null;

async function getAuthToken(): Promise<string> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase chưa được cấu hình cho frontend.');
  const session = readAuthSession();
  if (!session) throw new Error('Vui lòng đăng nhập bằng tài khoản Supabase.');
  if (session.expires_at > Date.now() + 60_000) return session.access_token;
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      if (!response.ok) {
        window.localStorage.removeItem(AUTH_SESSION_KEY);
        return null;
      }
      const refreshed = await response.json();
      saveAuthSession(refreshed);
      return refreshed.access_token as string;
    })().finally(() => { refreshInFlight = null; });
  }
  const token = await refreshInFlight;
  if (!token) throw new Error('Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại.');
  return token;
}

export type AlertCondition = 'price_above' | 'price_below' | 'change_pct_above' | 'convergence_at_least';
export interface ActionAlert {
  id: string;
  ticker: string;
  condition: AlertCondition;
  threshold: number;
  state: 'pending' | 'active' | 'triggered' | 'paused';
  created_at: string;
  triggered_at: string | null;
  last_checked_at: string | null;
  last_observed_value: number | null;
}
export interface ActionAlertEvent {
  id: string;
  alert_id: string;
  ticker: string;
  condition: AlertCondition;
  threshold: number;
  observed_value: number;
  market_price: number | null;
  provider: string;
  quote_at: string;
  triggered_at: string;
}
export interface ActionAlertWorkerStatus {
  enabled: boolean;
  configured: boolean;
  started: boolean;
  running: boolean;
  lastCycleAt: string | null;
  lastSuccessfulCycleAt: string | null;
  lastCycleFailed: boolean;
  pollIntervalMs: number;
  maxQuoteAgeMs: number;
  maxRadarAgeMs: number;
  radarAlertsEnabled: boolean;
}
export interface RadarAlertSnapshot {
  ticker: string;
  convergenceScore: number;
}

async function alertRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const response = await fetch(`${ACTION_API_BASE}/api/alerts${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(typeof body?.error === 'string' ? body.error : `Yêu cầu cảnh báo thất bại (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const fetchActionAlerts = () => alertRequest<ActionAlert[]>('');
export const fetchActionAlertEvents = () => alertRequest<ActionAlertEvent[]>('/events');
export const fetchActionAlertWorkerStatus = () => alertRequest<ActionAlertWorkerStatus>('/status');
export const syncRadarAlertSnapshots = async (snapshots: RadarAlertSnapshot[], observedAt: string): Promise<void> => {
  if (snapshots.length === 0) return;
  await alertRequest<void>('/radar-snapshots', {
    method: 'POST',
    body: JSON.stringify({ snapshots, observedAt }),
  });
};
export const createActionAlert = (input: Pick<ActionAlert, 'ticker' | 'condition' | 'threshold'>) =>
  alertRequest<ActionAlert>('', { method: 'POST', body: JSON.stringify(input) });
export const deleteActionAlert = (id: string) => alertRequest<void>(`/${encodeURIComponent(id)}`, { method: 'DELETE' });

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
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ email: username, password }),
    });
    if (!response.ok) return false;
    const session = await response.json();
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
    const res = await fetch(`${API_BASE}/api/universe`);
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

interface RadarScannerItem {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  price: number | null;
  changePct: number | null;
  faScore: number | null;
  taScore: number | null;
  eventImpactScore: number | null;
  smartScore: number | null;
  rsRating: number | null;
  trendTag: string | null;
  confluenceStatusCode: string | null;
  confluenceStatusLabel: string | null;
  breakoutBoostBadge: boolean;
  computedAt: string;
}

interface RadarScannerResponse {
  generatedAt: string;
  items: RadarScannerItem[];
  isMock?: boolean;
}

export interface RadarData {
  core: RadarCoreNode[];
  ring: RadarRingNode[];
  status: RadarDataStatus;
}

export const LIVE_RADAR_SIGNAL_LABELS = [
  'FA ≥ 80', 'TA ≥ 65', 'Sự kiện ≥ 60', 'SmartScore ≥ 70', 'RS Rating ≥ 60', 'Xu hướng tích cực',
];

function countLiveSignals(item: RadarScannerItem): number[] {
  const positiveTrend = item.confluenceStatusCode === 'THUAN_XU_HUONG' || item.confluenceStatusCode === 'DONG_THUAN_TICH_LUY';
  return [
    Number((item.faScore ?? 0) >= 80), Number((item.taScore ?? 0) >= 65),
    Number((item.eventImpactScore ?? 0) >= 60), Number((item.smartScore ?? 0) >= 70),
    Number((item.rsRating ?? 0) >= 60), Number(positiveTrend),
  ];
}

async function fetchLiveRadarData(): Promise<RadarData> {
  const response = await fetch(`${RADAR_API_BASE}/api/sieu-quet-ai/scanner`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Radar scanner API returned ${response.status}`);
  const payload = await response.json() as RadarScannerResponse;
  const generatedAt = Date.parse(payload.generatedAt);
  if (payload.isMock === true || !Array.isArray(payload.items) || !Number.isFinite(generatedAt) || generatedAt > Date.now() + 60_000 || Date.now() - generatedAt > 26 * 60 * 60 * 1000) {
    throw new Error('Radar scanner data is mock, invalid, or stale.');
  }

  const rows = payload.items
    .filter((item) => {
      const computedAt = Date.parse(item.computedAt);
      return /^[A-Z0-9.-]{1,10}$/.test(item.ticker) && Number.isFinite(item.price) && (item.price ?? 0) > 0 &&
        Number.isFinite(item.smartScore) && Number.isFinite(computedAt) && computedAt <= Date.now() + 60_000 &&
        Date.now() - computedAt <= 26 * 60 * 60 * 1000;
    })
    .sort((a, b) => (b.smartScore ?? 0) - (a.smartScore ?? 0));
  if (rows.length < 5) throw new Error('Radar scanner returned too few valid stocks.');

  const toCore = (item: RadarScannerItem): RadarCoreNode => {
    const signals = countLiveSignals(item);
    const caution = item.trendTag === 'Down-Trend' || item.trendTag === 'Distribution';
    const breakout = !caution && item.breakoutBoostBadge;
    return {
      ticker: item.ticker,
      name: item.companyName || item.ticker,
      sector: item.sector || 'Chưa phân loại',
      state: caution ? 'caution' : breakout ? 'breakout' : 'stable',
      stateLabel: `SmartScore ${(item.smartScore ?? 0).toFixed(1)} · ${item.trendTag || 'Chưa rõ xu hướng'}`,
      price: item.price ?? 0,
      changePct: item.changePct ?? 0,
      holdSuggestion: 'Tín hiệu sàng lọc; tự đánh giá trước khi giao dịch.',
      convergence: signals,
      trendWarning: caution ? item.trendTag : null,
      signalLabels: LIVE_RADAR_SIGNAL_LABELS,
    };
  };
  const coreRows = rows.slice(0, 5);
  const ringRows = rows.slice(5, 16);
  const core = coreRows.map(toCore);
  const ring = ringRows.map((item) => ({
    ticker: item.ticker,
    score: countLiveSignals(item).filter(Boolean).length,
    sector: item.sector || 'Chưa phân loại',
    price: item.price ?? 0,
    changePct: item.changePct ?? 0,
    signalLabels: LIVE_RADAR_SIGNAL_LABELS,
    convergence: countLiveSignals(item),
  }));
  const latestComputedAt = Math.max(...rows.map((item) => Date.parse(item.computedAt)));
  return { core, ring, status: { kind: 'live', generatedAt: new Date(latestComputedAt).toISOString(), count: rows.length, provider: 'Sieu Quet AI Scanner' } };
}

export async function fetchRadarData(): Promise<RadarData> {
  try {
    return await fetchLiveRadarData();
  } catch (error) {
    console.warn('[Radar] Live scanner unavailable; showing demo data.', error);
    await delay();
    return {
      core: mockData['GET /radar/core'] as RadarCoreNode[],
      ring: mockData['GET /radar/ring'] as RadarRingNode[],
      status: { kind: 'demo', generatedAt: null, count: 0, provider: 'mock-data.json' },
    };
  }
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
