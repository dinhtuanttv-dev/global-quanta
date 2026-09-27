import { create } from 'zustand';
import type { WatchlistStock, RadarCoreNode, RadarRingNode, RadarDataStatus } from '../types';
import * as api from '../services/api';

interface ToastState {
  message: string;
  onUndo: (() => void) | null;
}

interface AppState {
  // ===== AUTH =====
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  completeAuthCallback: () => void;

  // ===== WATCHLIST (Sidebar) =====
  watchlist: WatchlistStock[];
  loadWatchlist: () => Promise<void>;
  addStock: (ticker: string, sector: string) => Promise<void>;
  removeStock: (ticker: string) => Promise<void>;
  togglePin: (ticker: string) => void;
  setReason: (ticker: string, reason: string | null) => void;
  markRead: (ticker: string) => void;
  updateLivePrices: (prices: Record<string, { price: number; changePct: number | null }>) => void;

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
  radarUpdatedAt: string | null;
  radarDataStatus: RadarDataStatus;
  loadRadar: () => Promise<void>;

  // ===== TOAST (hoàn tác) =====
  toast: ToastState | null;
  showToast: (message: string, onUndo?: (() => void) | null) => void;
  clearToast: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  isAuthenticated: api.hasAuthSession(),
  login: async (username, password) => {
    const ok = await api.login(username, password);
    if (ok) set({ isAuthenticated: true });
    return ok;
  },
  completeAuthCallback: () => set({ isAuthenticated: true }),

  watchlist: [],
  loadWatchlist: async () => {
    const data = await api.fetchWatchlist();
    set({ watchlist: data });
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
    set((s) => ({
      watchlist: s.watchlist.map((x) => (x.ticker === ticker ? { ...x, pinned: !x.pinned } : x)),
    }));
    const stock = get().watchlist.find((x) => x.ticker === ticker);
    if (stock) api.patchWatchlistStock(ticker, { pinned: stock.pinned });
  },
  setReason: (ticker, reason) => {
    set((s) => ({
      watchlist: s.watchlist.map((x) => (x.ticker === ticker ? { ...x, reason } : x)),
    }));
    api.patchWatchlistStock(ticker, { reason });
  },
  markRead: (ticker) => {
    set((s) => ({
      watchlist: s.watchlist.map((x) => (x.ticker === ticker ? { ...x, unread: false } : x)),
    }));
  },
  updateLivePrices: (prices) => {
    set((s) => ({
      watchlist: s.watchlist.map((x) => {
        const p = prices[x.ticker];
        if (!p || p.price === null) return x;
        return { ...x, price: p.price, changePct: p.changePct ?? x.changePct };
      }),
    }));
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
  radarUpdatedAt: null,
  radarDataStatus: { kind: 'demo', generatedAt: null, count: 0, provider: 'mock-data.json' },
  loadRadar: async () => {
    const { core, ring, status } = await api.fetchRadarData();
    set({ radarCore: core, radarRing: ring, radarUpdatedAt: status.generatedAt ?? new Date().toISOString(), radarDataStatus: status });
    const selected = get().selectedTicker;
    if (selected && !core.some((n) => n.ticker === selected) && !ring.some((n) => n.ticker === selected) && core.length > 0) {
      set({ selectedTicker: core[0].ticker });
    } else if (!selected && core.length > 0) {
      set({ selectedTicker: core[0].ticker });
    }
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
