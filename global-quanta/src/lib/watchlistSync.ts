// Đồng bộ ★ Danh mục theo TÀI KHOẢN qua Market Gateway (GET/PUT /api/market/watchlists, Supabase lưu, xác thực JWT).
// localStorage vẫn là bản làm việc (dùng ngay, offline); đám mây là bản chung cho mọi máy đã đăng nhập.
//  - Lần đồng bộ ĐẦU TIÊN trên một máy: GỘP máy này với đám mây (không mất danh mục nào của điện thoại hay máy tính).
//  - Sau đó: thay đổi trên máy -> đẩy lên (gom 1,5 giây); đám mây mới hơn (máy khác vừa sửa) -> kéo về, mỗi 60 giây + khi quay lại tab.
import { fetchMarketJson, isMarketGatewayEnabled } from '../services/marketDataClient';
import { getAccessToken } from '../services/api';
import { MAX_WATCHLIST_TICKERS, watchlistStore, type Watchlist, type WatchlistState } from '../hooks/useWatchlists';

const META_KEY = 'gq.watchlists.sync.v1';
const PUSH_DEBOUNCE_MS = 1500;
const PULL_EVERY_MS = 60_000;

export type SyncMode = 'off' | 'signed-out' | 'syncing' | 'synced' | 'error';
export interface SyncStatus { mode: SyncMode; at: string | null; error: string | null }

/** Hàm thuần: gộp hai trạng thái (lần đồng bộ đầu trên một máy). Cùng id -> hợp mã (đám mây trước), ghi chú/ghim hợp lại. */
export function mergeWatchlistStates(local: WatchlistState, cloud: WatchlistState): WatchlistState {
  const byId = new Map<string, Watchlist>(cloud.lists.map((l) => [l.id, l]));
  const lists: Watchlist[] = cloud.lists.map((c) => {
    const l = local.lists.find((x) => x.id === c.id);
    if (!l) return c;
    const tickers = [...new Set([...c.tickers, ...l.tickers])].slice(0, MAX_WATCHLIST_TICKERS);
    const notes = { ...(l.notes ?? {}), ...(c.notes ?? {}) };
    const pinned = [...new Set([...(c.pinned ?? []), ...(l.pinned ?? [])])].filter((t) => tickers.includes(t));
    return { ...c, tickers, ...(Object.keys(notes).length ? { notes } : {}), ...(pinned.length ? { pinned } : {}) };
  });
  for (const l of local.lists) if (!byId.has(l.id)) lists.push(l);
  const has = (id?: string) => !!id && lists.some((l) => l.id === id);
  return {
    lists,
    activeId: has(local.activeId) ? local.activeId : lists[0].id,
    ...(has(local.radarId) ? { radarId: local.radarId } : has(cloud.radarId) ? { radarId: cloud.radarId } : {}),
  };
}

/** Dấu vân tay để so hai trạng thái (bỏ khác biệt thứ tự khoá). */
export const fingerprint = (s: WatchlistState) => JSON.stringify({
  a: s.activeId, r: s.radarId ?? null,
  l: s.lists.map((l) => [l.id, l.name, l.tickers, l.pinned ?? [], Object.entries(l.notes ?? {}).sort()]),
});

function readMeta(): { syncedAt: string | null } {
  try { return JSON.parse(window.localStorage.getItem(META_KEY) ?? '{}') as { syncedAt: string | null }; } catch { return { syncedAt: null }; }
}
function writeMeta(m: { syncedAt: string | null }) {
  try { window.localStorage.setItem(META_KEY, JSON.stringify(m)); } catch { /* bỏ qua */ }
}

async function authed<T>(init?: RequestInit): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw Object.assign(new Error('Chưa đăng nhập'), { signedOut: true });
  return fetchMarketJson<T>('/api/market/watchlists', {}, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}`, ...(init?.body ? { 'content-type': 'application/json' } : {}) } });
}

let status: SyncStatus = { mode: 'off', at: null, error: null };
const listeners = new Set<() => void>();
const setStatus = (next: Partial<SyncStatus>) => { status = { ...status, ...next }; listeners.forEach((f) => f()); };
export const watchlistSyncStatus = {
  get: () => status,
  subscribe: (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; },
};

let started = false;
let applying = false;
let dirty = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;

async function push() {
  const state = watchlistStore.get();
  setStatus({ mode: 'syncing' });
  const res = await authed<{ updatedAt: string }>({ method: 'PUT', body: JSON.stringify({ state }) });
  dirty = false;
  writeMeta({ syncedAt: res.updatedAt });
  setStatus({ mode: 'synced', at: res.updatedAt, error: null });
}

function apply(next: WatchlistState) {
  applying = true;
  try { watchlistStore.replace(next); } finally { applying = false; }
}

async function pull() {
  try {
    if (dirty) { await push(); return; }
    const cloud = await authed<{ state: WatchlistState | null; updatedAt: string | null }>();
    const meta = readMeta();
    const local = watchlistStore.get();
    if (!cloud.state) { await push(); return; }                                       // tài khoản chưa có bản đám mây
    if (!meta.syncedAt) {                                                               // máy này đồng bộ lần đầu -> gộp
      const merged = mergeWatchlistStates(local, cloud.state);
      if (fingerprint(merged) !== fingerprint(local)) apply(merged);
      if (fingerprint(merged) !== fingerprint(cloud.state)) { await push(); return; }
      writeMeta({ syncedAt: cloud.updatedAt });
    } else if (cloud.updatedAt && cloud.updatedAt > meta.syncedAt) {                    // máy khác vừa sửa -> kéo về
      if (fingerprint(cloud.state) !== fingerprint(local)) apply(cloud.state);
      writeMeta({ syncedAt: cloud.updatedAt });
    }
    setStatus({ mode: 'synced', at: cloud.updatedAt ?? status.at, error: null });
  } catch (e) {
    const err = e as Error & { signedOut?: boolean };
    setStatus(err.signedOut ? { mode: 'signed-out', error: null } : { mode: 'error', error: err.message });
  }
}

/** Khởi động MỘT lần cho cả ứng dụng (gọi trong component luôn hiện, VD MarketFeed). Trả hàm dừng (test). */
export function startWatchlistCloudSync(): () => void {
  if (started || typeof window === 'undefined' || !isMarketGatewayEnabled()) return () => {};
  started = true;
  const unsub = watchlistStore.subscribe(() => {
    if (applying) return;
    dirty = true;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { void push().catch((e: Error & { signedOut?: boolean }) => setStatus(e.signedOut ? { mode: 'signed-out' } : { mode: 'error', error: e.message })); }, PUSH_DEBOUNCE_MS);
  });
  const onFocus = () => { if (document.visibilityState === 'visible') void pull(); };
  document.addEventListener('visibilitychange', onFocus);
  const timer = setInterval(() => { if (document.visibilityState === 'visible') void pull(); }, PULL_EVERY_MS);
  void pull();
  return () => {
    unsub(); clearInterval(timer); clearTimeout(pushTimer);
    document.removeEventListener('visibilitychange', onFocus);
    started = false;
  };
}
