import { create } from 'zustand';
import type { WatchlistStock, RadarCoreNode, RadarRingNode } from '../types';
import * as api from '../services/api';
import * as watchlistSvc from '../services/watchlist';

interface ToastState {
  message: string;
  onUndo: (() => void) | null;
}

interface AppState {
  // ===== AUTH =====
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;

  // ===== WATCHLIST (Sidebar) =====
  watchlist: WatchlistStock[];
  loadWatchlist: () => Promise<void>;
  addStock: (ticker: string, sector: string) => Promise<void>;
  removeStock: (ticker: string) => Promise<void>;
  togglePin: (ticker: string) => void;
  setReason: (ticker: string, reason: string | null) => void;
  markRead: (ticker: string) => void;

  // ===== UI FILTERS (Sidebar) =====
  sortByConvergence: boolean;
  toggleSortByConvergence: () => void;
  activeGroup: string;
  setActiveGroup: (g: string) => void;
  searchText: string;
  setSearchText: (t: string) => void;

  // ===== SELECTION (liên kết chéo Sidebar ↔ Radar ↔ Action Center) =====
  selectedTicker: string | null;
  selectTicker: (ticker: string) => void;

  // ===== SECTOR FILTER (tab Loc nganh) =====
  selectedSectorKey: string | null;
  setSelectedSectorKey: (key: string | null) => void;
  selectedQuadrant: "Leading" | "Improving" | "Weakening" | "Lagging" | null;
  setSelectedQuadrant: (q: "Leading" | "Improving" | "Weakening" | "Lagging" | null) => void;
  minRsScore: number;
  setMinRsScore: (v: number) => void;
  minVolumeScore: number;
  setMinVolumeScore: (v: number) => void;
  resetSectorFilters: () => void;

  // ===== RADAR =====
  radarCore: RadarCoreNode[];
  radarRing: RadarRingNode[];
  loadRadar: () => Promise<void>;

  // ===== TOAST (hoàn tác) =====
  toast: ToastState | null;
  showToast: (message: string, onUndo?: (() => void) | null) => void;
  clearToast: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  isAuthenticated: false,
  login: async (username, password) => {
    const ok = await api.login(username, password);
    if (ok) set({ isAuthenticated: true });
    return ok;
  },

  watchlist: [],
  loadWatchlist: async () => {
    // ── MIGRATED to watchlist.ts (Lộ trình B - Bước 1) ──
    // Trước: await api.fetchWatchlist() → set() trực tiếp
    // Sau: watchlistSvc.fetchWatchlist() → update cache → pub/sub trigger
    //      → useAppStore.subscribe (bên dưới) tự cập nhật state
    await watchlistSvc.fetchWatchlist();
  },
  addStock: async (ticker, sector) => {
    const newStock = await api.addToWatchlist({ ticker, sector });
    set((s) => ({ watchlist: [...s.watchlist, newStock] }));
    get().showToast(`Đã thêm ${ticker} vào danh sách theo dõi`);
  },
  removeStock: async (ticker) => {
    const idx = get().watchlist.findIndex((s) => s.ticker === ticker);
    const removed = get().watchlist[idx];
    if (!removed) return;
    set((s) => ({ watchlist: s.watchlist.filter((x) => x.ticker !== ticker) }));
    await api.removeFromWatchlist(ticker);
    get().showToast(`Đã xoá ${ticker} khỏi danh sách`, () => {
      set((s) => {
        const list = [...s.watchlist];
        list.splice(idx, 0, removed);
        return { watchlist: list };
      });
      api.restoreToWatchlist(removed, idx);
    });
  },
  togglePin: (ticker) => {
    // ── MIGRATED to watchlist.ts (Lộ trình B - Bước 2) ──
    // Trước: set() trực tiếp + gọi api.patchWatchlistStock() riêng
    //       → Nếu API fail: state đã update nhưng server không biết (BUG)
    // Sau: watchlistSvc.patchWatchlistStock() xử lý TẤT CẢ:
    //      - Optimistic update qua setCache (UI phản hồi ngay)
    //      - Gọi api.patchWatchlistStock() (gửi lên server)
    //      - Rollback tự động nếu API throw (đã có sẵn trong watchlist.ts)
    const stock = get().watchlist.find((x) => x.ticker === ticker);
    if (!stock) return;
    void watchlistSvc.patchWatchlistStock(ticker, { pinned: !stock.pinned });
  },
  setReason: (ticker, reason) => {
    set((s) => ({
      watchlist: s.watchlist.map((x) => (x.ticker === ticker ? { ...x, reason } : x)),
    }));
    api.patchWatchlistStock(ticker, { reason });
  },
  markRead: (ticker) => {
    // ── MIGRATED to watchlist.ts (Lộ trình B - Bước 1) ──
    // Trước: set() trực tiếp → KHÔNG đồng bộ với Radar/Action Center
    // Sau: gọi watchlistSvc.patchWatchlistStock() → update cache → pub/sub trigger
    //      → useAppStore tự động cập nhật state (subscribe ở dưới)
    void watchlistSvc.patchWatchlistStock(ticker, { unread: false });
  },

  sortByConvergence: false,
  toggleSortByConvergence: () => set((s) => ({ sortByConvergence: !s.sortByConvergence })),
  activeGroup: 'all',
  setActiveGroup: (g) => set({ activeGroup: g }),
  searchText: '',
  setSearchText: (t) => set({ searchText: t }),

  selectedTicker: null,
  selectTicker: (ticker) => {
    set({ selectedTicker: ticker });
    get().markRead(ticker);
  },

  selectedSectorKey: null,
  setSelectedSectorKey: (key) => set({ selectedSectorKey: key }),
  selectedQuadrant: null,
  setSelectedQuadrant: (q) => set({ selectedQuadrant: q }),
  minRsScore: 0,
  setMinRsScore: (v) => set({ minRsScore: v }),
  minVolumeScore: 0,
  setMinVolumeScore: (v) => set({ minVolumeScore: v }),
  resetSectorFilters: () => set({ selectedSectorKey: null, selectedQuadrant: null, minRsScore: 0, minVolumeScore: 0 }),

  radarCore: [],
  radarRing: [],
  loadRadar: async () => {
    const [core, ring] = await Promise.all([api.fetchRadarCore(), api.fetchRadarRing()]);
    set({ radarCore: core, radarRing: ring });
    if (core.length > 0) set({ selectedTicker: core[0].ticker });
  },

  toast: null,
  showToast: (message, onUndo = null) => {
    set({ toast: { message, onUndo } });
    setTimeout(() => {
      if (get().toast?.message === message) set({ toast: null });
    }, 4000);
  },
  clearToast: () => set({ toast: null }),
}));

// ── SUBSCRIBE watchlist.ts pub/sub (Lộ trình B - Bước 1) ──
// Mỗi khi watchlist.ts update cache (qua add/remove/patch/restore) →
// pub/sub trigger → useAppStore tự động cập nhật `watchlist` state.
// Điều này đồng bộ Sidebar ↔ Radar ↔ Action Center mà không cần
// component nào phải tự fetch lại.
watchlistSvc.subscribeWatchlist((next) => {
  useAppStore.setState({ watchlist: next });
});
