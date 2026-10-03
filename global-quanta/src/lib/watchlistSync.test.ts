import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fingerprint, mergeWatchlistStates, startWatchlistCloudSync, watchlistSyncStatus } from './watchlistSync';
import { resetWatchlistsForTest, watchlistStore, type WatchlistState } from '../hooks/useWatchlists';

vi.mock('../services/api', () => ({ getAccessToken: vi.fn(async () => 'tok') }));

const pc: WatchlistState = { activeId: 'default', radarId: 'default', lists: [{ id: 'default', name: 'Danh mục của tôi', tickers: ['FPT', 'VCB', 'BMP'], pinned: ['FPT'] }] };
const phone: WatchlistState = { activeId: 'default', lists: [
  { id: 'default', name: 'Danh mục của tôi', tickers: ['PAN', 'SBT', 'FRT', 'FPT'] },
  { id: 'wl-phone', name: 'Điện thoại', tickers: ['GVR'] },
] };

describe('mergeWatchlistStates (lần đồng bộ đầu trên một máy)', () => {
  it('không mất danh mục/mã nào: hợp mã cùng id (đám mây trước), thêm danh mục chỉ có ở máy này', () => {
    const m = mergeWatchlistStates(phone, pc);
    expect(m.lists.map((l) => l.id)).toEqual(['default', 'wl-phone']);
    expect(m.lists[0].tickers).toEqual(['FPT', 'VCB', 'BMP', 'PAN', 'SBT', 'FRT']);
    expect(m.lists[0].pinned).toEqual(['FPT']);
    expect(m.radarId).toBe('default');
  });
  it('giới hạn 60 mã mỗi danh mục', () => {
    const many = (p: string) => Array.from({ length: 40 }, (_, i) => `${p}${String(i).padStart(2, '0')}`);
    const m = mergeWatchlistStates({ activeId: 'default', lists: [{ id: 'default', name: 'A', tickers: many('B') }] }, { activeId: 'default', lists: [{ id: 'default', name: 'A', tickers: many('C') }] });
    expect(m.lists[0].tickers).toHaveLength(60);
  });
});

describe('startWatchlistCloudSync', () => {
  let cloud: { state: WatchlistState | null; updatedAt: string | null };
  let puts: WatchlistState[];
  beforeEach(() => {
    vi.stubEnv('VITE_MARKET_GATEWAY_ENABLED', 'true');
    window.localStorage.clear();
    resetWatchlistsForTest();
    puts = [];
    cloud = { state: pc, updatedAt: '2026-10-03T08:00:00.000Z' };
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { state: WatchlistState };
        puts.push(body.state);
        cloud = { state: body.state, updatedAt: '2026-10-03T09:00:00.000Z' };
        return new Response(JSON.stringify({ state: body.state, updatedAt: cloud.updatedAt }));
      }
      return new Response(JSON.stringify(cloud));
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it('máy mới (điện thoại) đồng bộ lần đầu: gộp với máy tính, đẩy bản gộp lên, trạng thái "đã đồng bộ"', async () => {
    watchlistStore.replace(phone);
    const stop = startWatchlistCloudSync();
    await vi.waitFor(() => expect(watchlistSyncStatus.get().mode).toBe('synced'));
    expect(watchlistStore.get().lists[0].tickers).toEqual(['FPT', 'VCB', 'BMP', 'PAN', 'SBT', 'FRT']);
    expect(puts).toHaveLength(1);
    expect(fingerprint(puts[0])).toBe(fingerprint(watchlistStore.get()));
    stop();
  });

  it('thay đổi trên máy được đẩy lên đám mây (gom 1,5 giây)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    watchlistStore.replace(pc);
    window.localStorage.setItem('gq.watchlists.sync.v1', JSON.stringify({ syncedAt: '2026-10-03T08:00:00.000Z' }));
    const stop = startWatchlistCloudSync();
    await vi.waitFor(() => expect(watchlistSyncStatus.get().mode).toBe('synced'));
    expect(puts).toHaveLength(0); // cùng bản -> không đẩy
    watchlistStore.replace({ ...pc, lists: [{ ...pc.lists[0], tickers: [...pc.lists[0].tickers, 'HPG'] }] });
    await vi.advanceTimersByTimeAsync(1600);
    await vi.waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].lists[0].tickers).toContain('HPG');
    stop();
    vi.useRealTimers();
  });
});
