/**
 * marketDataClient.ts — client DUY NHẤT cho dữ liệu thị trường Việt Nam.
 *
 * Backend (Market Gateway) quyết định nguồn: SSI là nguồn chính, nguồn cũ
 * (Project A/Yahoo) là dự phòng. Frontend KHÔNG tự chọn nguồn hay tự fallback;
 * chỉ hiển thị nhãn nguồn/độ mới mà backend gắn kèm (provenance).
 *
 * Bật bằng VITE_MARKET_GATEWAY_ENABLED=true. Khi chưa bật, các hook giữ nguyên
 * đường gọi cũ để production không bị ảnh hưởng cho tới khi Gateway được host.
 */

const MARKET_API_BASE = String(import.meta.env.VITE_MARKET_API_BASE_URL ?? '').replace(/\/+$/, '');

export function isMarketGatewayEnabled(): boolean {
  return String(import.meta.env.VITE_MARKET_GATEWAY_ENABLED ?? '').toLowerCase() === 'true';
}

export type MarketSource = 'SSI_STREAM' | 'SSI_V3' | 'SSI_FC_V2' | 'LEGACY' | 'STORE' | (string & {});

export interface Provenance {
  source: MarketSource;
  asOf: string | null;
  fetchedAt?: string;
  receivedAt?: string;
  isStale: boolean;
  fallbackReason: string | null;
}

export interface MarketQuote {
  symbol: string;
  exchange: string | null;
  price: number | null;
  refPrice: number | null;
  ceiling: number | null;
  floor: number | null;
  change: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  totalVolume: number | null;
  totalValue: number | null;
  bid: { price: number; volume: number }[];
  ask: { price: number; volume: number }[];
  time: string | null;
  provenance: Provenance;
}

export interface IndexSnapshot {
  code: string;
  value: number;
  change: number | null;
  changePct: number | null;
  totalVolume: number | null;
  totalValue: number | null;
  advances: number | null;
  declines: number | null;
  noChanges: number | null;
  provenance: Provenance;
}

export interface OhlcvBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  value?: number | null;
  /** Nến hôm nay chưa đóng, dựng từ giá realtime. */
  partial?: boolean;
}

export interface OhlcvResponse {
  symbol: string;
  ticker: string;
  resolution: string;
  adjusted: boolean;
  bars: OhlcvBar[];
  provenance: Provenance & { sources?: Record<string, number> };
}

export interface StreamStatus {
  transport: 'connected' | 'degraded' | 'connecting' | 'down' | 'disabled' | 'idle';
  connected: boolean;
  session: string;
  live: string[];
  stale: string[];
  fallback: string[];
  closed: string[];
  pending: string[];
  updatedAt: string;
}

type Params = Record<string, string | number | boolean | undefined | null>;

export function marketUrl(path: string, params: Params = {}): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  const qs = query.toString();
  return `${MARKET_API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

export async function fetchMarketJson<T>(path: string, params: Params = {}, init?: RequestInit): Promise<T> {
  const res = await fetch(marketUrl(path, params), { cache: 'no-store', ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error ?? `Market API lỗi ${res.status}`);
  return body as T;
}

export const getOhlcv = (
  ticker: string,
  opts: { range?: string; limit?: number; from?: string; to?: string; adjusted?: boolean; resolution?: '1D' | '1m' } = {},
) => fetchMarketJson<OhlcvResponse>('/api/market/ohlcv', { ticker, ...opts });

export const getQuotes = (symbols: string[]) =>
  fetchMarketJson<{ quotes: Record<string, MarketQuote>; missing: string[]; session: string; fallbackReason: string | null }>(
    '/api/market/quotes',
    { symbols: symbols.join(',') },
  );

export const getUniverse = () =>
  fetchMarketJson<{ tickers: { ticker: string; sector: string; name?: string; exchange?: string }[]; provenance: Provenance }>('/api/market/universe');

export const getBreadth = (index = 'VNINDEX') =>
  fetchMarketJson<{ index: string; advancers: number | null; decliners: number | null; noChanges: number | null; provenance: Provenance }>(
    '/api/market/breadth',
    { index },
  );

export const getIndexSnapshot = (code: string) => fetchMarketJson<IndexSnapshot>(`/api/market/indices/${encodeURIComponent(code)}`);

/**
 * Một EventSource cho mọi mã (backend tự chia shard ≤50 mã/kết nối SSI).
 * EventSource tự kết nối lại khi rớt mạng.
 */
export function subscribeMarket(opts: {
  symbols: string[];
  indices?: string[];
  onQuote?: (quote: MarketQuote) => void;
  onIndex?: (snapshot: IndexSnapshot) => void;
  onStatus?: (status: StreamStatus) => void;
  onError?: () => void;
}): () => void {
  const symbols = [...new Set(opts.symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const indices = [...new Set((opts.indices ?? []).map((s) => s.trim().toUpperCase()).filter(Boolean))];
  if (!symbols.length && !indices.length) return () => {};
  const source = new EventSource(marketUrl('/api/market/stream', { symbols: symbols.join(','), indices: indices.join(',') }));
  const parse = <T,>(fn?: (data: T) => void) => (event: Event) => {
    if (!fn) return;
    try {
      fn(JSON.parse((event as MessageEvent<string>).data) as T);
    } catch {
      /* bỏ qua bản tin lỗi định dạng */
    }
  };
  source.addEventListener('quote', parse(opts.onQuote));
  source.addEventListener('index', parse(opts.onIndex));
  source.addEventListener('status', parse(opts.onStatus));
  source.onerror = () => opts.onError?.();
  return () => source.close();
}

export const isSsiSource = (source: string | null | undefined) => String(source ?? '').startsWith('SSI');

export type FeedTone = 'live' | 'warn' | 'fallback' | 'offline' | 'closed' | 'loading';

/** Nhãn trạng thái nguồn giá cho UI. LIVE chỉ khi có dữ liệu SSI mới, không chỉ vì socket đã mở. */
export function describeFeedStatus(status: StreamStatus | null, connectionLost = false): { label: string; tone: FeedTone; title: string } {
  if (connectionLost || !status) {
    return connectionLost
      ? { label: '○ MẤT KẾT NỐI', tone: 'offline', title: 'Không kết nối được máy chủ dữ liệu; trình duyệt đang tự kết nối lại.' }
      : { label: '◌ ĐANG KẾT NỐI', tone: 'loading', title: 'Đang kết nối máy chủ dữ liệu thị trường.' };
  }
  const total = status.live.length + status.stale.length + status.fallback.length + status.closed.length + status.pending.length;
  if (status.session === 'CLOSED' || status.session === 'BREAK') {
    const label = status.session === 'BREAK' ? '■ NGHỈ TRƯA' : '■ ĐÓNG CỬA';
    return { label, tone: 'closed', title: 'Ngoài giờ khớp lệnh: hiển thị giá của phiên gần nhất.' };
  }
  if (total > 0 && status.live.length === total) {
    return { label: '● SSI LIVE', tone: 'live', title: 'Toàn bộ giá đang nhận realtime từ SSI.' };
  }
  if (status.fallback.length > 0) {
    return {
      label: `◐ DỰ PHÒNG ${status.fallback.length}/${total}`,
      tone: 'fallback',
      title: `SSI stream chưa có dữ liệu mới cho ${status.fallback.join(', ')}; đang dùng nguồn dự phòng.`,
    };
  }
  if (status.stale.length > 0) {
    return { label: `◐ GIÁ CHẬM ${status.stale.length}/${total}`, tone: 'warn', title: `Chưa có giá mới cho ${status.stale.join(', ')}.` };
  }
  if (status.transport === 'down') return { label: '○ SSI OFFLINE', tone: 'offline', title: 'Mất kết nối SSI stream.' };
  return { label: '◌ ĐANG TẢI', tone: 'loading', title: 'Đang lấy giá ban đầu.' };
}

export const FEED_TONE_COLOR: Record<FeedTone, string> = {
  live: '#34d399',
  warn: '#fbbf24',
  fallback: '#f59e0b',
  offline: '#f87171',
  closed: 'var(--text-tertiary)',
  loading: 'var(--text-tertiary)',
};
