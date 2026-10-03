import { useSyncExternalStore } from "react";

// Danh mục tự chọn (Custom Watchlist) của người xem: nhiều danh mục có tên, lưu trong localStorage
// của trình duyệt (đồng bộ giữa các tab). localStorage lỗi/bị chặn -> vẫn dùng được trong phiên.

export interface Watchlist {
  id: string; name: string; tickers: string[];
  /** Ghi chú / lý do theo dõi từng mã (chuyển từ danh sách cũ, sửa được). */
  notes?: Record<string, string>;
  /** Mã được ghim lên đầu danh mục. */
  pinned?: string[];
}
/** radarId: danh mục cấp mã cho ELITE COMMAND RADAR (mặc định "Danh mục của tôi"). */
export interface WatchlistState { lists: Watchlist[]; activeId: string; radarId?: string }
type State = WatchlistState;

const KEY = "gq.watchlists.v1";
export const LEGACY_LIST_NAME = "Danh sách mã (cũ)";
const EVENT = "gq:watchlists";
export const MAX_WATCHLIST_TICKERS = 60;
const TICKER_RE = /^[A-Z][A-Z0-9]{2,5}$/;

const DEFAULT: State = { lists: [{ id: "default", name: "Danh mục của tôi", tickers: [] }], activeId: "default" };
let memory: State | null = null;
let cachedRaw: string | null = null;
let cachedState: State = DEFAULT;

function read(): State {
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(KEY); } catch { /* bỏ qua */ }
  if (raw === null) return memory ?? DEFAULT;
  if (raw === cachedRaw) return cachedState;
  try {
    const parsed = JSON.parse(raw) as State;
    if (!Array.isArray(parsed.lists) || !parsed.lists.length) throw new Error("rỗng");
    cachedRaw = raw;
    cachedState = {
      lists: parsed.lists,
      activeId: parsed.lists.some((l) => l.id === parsed.activeId) ? parsed.activeId : parsed.lists[0].id,
      radarId: parsed.radarId && parsed.lists.some((l) => l.id === parsed.radarId) ? parsed.radarId : undefined,
    };
    return cachedState;
  } catch {
    return memory ?? DEFAULT;
  }
}

function write(next: State) {
  memory = next;
  try { window.localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* chỉ giữ trong phiên */ }
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", onStorage); };
}

/** Tách chuỗi người dùng nhập ("fpt, hpg vnm") -> mã hợp lệ (chữ hoa, bỏ trùng) + mã sai định dạng. */
export function parseTickerInput(text: string): { valid: string[]; invalid: string[] } {
  const parts = text.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  const valid: string[] = [], invalid: string[] = [];
  for (const p of parts) (TICKER_RE.test(p) ? valid : invalid).push(p);
  return { valid: [...new Set(valid)], invalid };
}

const update = (fn: (s: State) => State) => write(fn(read()));

/** Đọc/ghi NGUYÊN trạng thái — chỉ cho bộ đồng bộ đám mây (useWatchlistCloudSync). */
export const watchlistStore = {
  get: (): WatchlistState => read(),
  replace: (next: WatchlistState) => write(next),
  subscribe,
};
const mapActive = (s: State, fn: (l: Watchlist) => Watchlist): State => ({ ...s, lists: s.lists.map((l) => (l.id === s.activeId ? fn(l) : l)) });

export const watchlistActions = {
  setActive: (id: string) => update((s) => ({ ...s, activeId: id })),
  create: (name: string) => update((s) => {
    const id = `wl-${Date.now().toString(36)}`;
    return { lists: [...s.lists, { id, name: name.trim() || `Danh mục ${s.lists.length + 1}`, tickers: [] }], activeId: id };
  }),
  rename: (name: string) => update((s) => mapActive(s, (l) => ({ ...l, name: name.trim() || l.name }))),
  remove: () => update((s) => {
    const lists = s.lists.filter((l) => l.id !== s.activeId);
    return lists.length ? { lists, activeId: lists[0].id, radarId: s.radarId === s.activeId ? undefined : s.radarId } : DEFAULT;
  }),
  /** Thêm mã vào một danh mục cụ thể (VD danh mục của Radar) — nút "Quan tâm". Trả true nếu đã thêm. */
  addTo: (listId: string, ticker: string): boolean => {
    let added = false;
    update((s) => ({ ...s, lists: s.lists.map((l) => {
      if (l.id !== listId || l.tickers.includes(ticker) || l.tickers.length >= MAX_WATCHLIST_TICKERS) return l;
      added = true;
      return { ...l, tickers: [...l.tickers, ticker] };
    }) }));
    return added;
  },
  /** Bỏ mã khỏi một danh mục cụ thể — nút "Loại bỏ". Trả lại bản cũ của danh mục để hoàn tác. */
  removeFrom: (listId: string, ticker: string): Watchlist | null => {
    let before: Watchlist | null = null;
    update((s) => ({ ...s, lists: s.lists.map((l) => {
      if (l.id !== listId || !l.tickers.includes(ticker)) return l;
      before = l;
      return { ...l, tickers: l.tickers.filter((t) => t !== ticker), pinned: (l.pinned ?? []).filter((t) => t !== ticker) };
    }) }));
    return before;
  },
  /** Khôi phục nguyên trạng một danh mục (hoàn tác "Loại bỏ"). */
  restoreList: (list: Watchlist) => update((s) => ({ ...s, lists: s.lists.map((l) => (l.id === list.id ? list : l)) })),
  /** Chọn danh mục cấp mã cho ELITE COMMAND RADAR. */
  setRadarList: (id: string) => update((s) => ({ ...s, radarId: id })),
  /**
   * Gộp "Danh sách mã (cũ)" vào "Danh mục của tôi" (giữ thứ tự, ghi chú, mã ghim; tối đa 60 mã) rồi xoá
   * danh sách cũ. Chưa có "Danh mục của tôi" thì đổi tên danh sách cũ thành danh mục đó.
   */
  mergeLegacy: () => update((s) => {
    const legacy = s.lists.find((l) => l.name === LEGACY_LIST_NAME);
    if (!legacy) return s;
    const mine = s.lists.find((l) => l.id === "default");
    if (!mine) {
      const renamed: Watchlist = { ...legacy, id: "default", name: DEFAULT.lists[0].name };
      const lists = s.lists.map((l) => (l === legacy ? renamed : l));
      const fix = (id?: string) => (id === legacy.id ? "default" : id);
      return { lists, activeId: fix(s.activeId)!, radarId: fix(s.radarId) };
    }
    const tickers = [...new Set([...mine.tickers, ...legacy.tickers])].slice(0, MAX_WATCHLIST_TICKERS);
    const merged: Watchlist = {
      ...mine, tickers,
      notes: { ...(legacy.notes ?? {}), ...(mine.notes ?? {}) },
      pinned: [...new Set([...(mine.pinned ?? []), ...(legacy.pinned ?? [])])].filter((t) => tickers.includes(t)),
    };
    const lists = s.lists.filter((l) => l !== legacy).map((l) => (l === mine ? merged : l));
    const fix = (id?: string) => (id === legacy.id ? "default" : id);
    return { lists, activeId: fix(s.activeId)!, radarId: fix(s.radarId) };
  }),
  /** Xoá hẳn "Danh sách mã (cũ)" (không gộp). */
  removeLegacy: () => update((s) => {
    const lists = s.lists.filter((l) => l.name !== LEGACY_LIST_NAME);
    if (lists.length === s.lists.length) return s;
    if (!lists.length) return DEFAULT;
    const ok = (id?: string) => (id && lists.some((l) => l.id === id) ? id : undefined);
    return { lists, activeId: ok(s.activeId) ?? lists[0].id, radarId: ok(s.radarId) };
  }),
  /** Thêm mã vào danh mục đang chọn; trả số mã thực sự thêm (giới hạn 60). */
  add: (tickers: string[]) => {
    let added = 0;
    update((s) => mapActive(s, (l) => {
      const set = new Set(l.tickers);
      for (const t of tickers) if (!set.has(t) && set.size < MAX_WATCHLIST_TICKERS) { set.add(t); added++; }
      return { ...l, tickers: [...set] };
    }));
    return added;
  },
  removeTicker: (ticker: string) => update((s) => mapActive(s, (l) => ({ ...l, tickers: l.tickers.filter((t) => t !== ticker) }))),
  toggle: (ticker: string) => update((s) => mapActive(s, (l) => ({
    ...l, tickers: l.tickers.includes(ticker) ? l.tickers.filter((t) => t !== ticker) : l.tickers.length < MAX_WATCHLIST_TICKERS ? [...l.tickers, ticker] : l.tickers,
  }))),
  clear: () => update((s) => mapActive(s, (l) => ({ ...l, tickers: [] }))),
  setNote: (ticker: string, note: string | null) => update((s) => mapActive(s, (l) => {
    const notes = { ...(l.notes ?? {}) };
    if (note && note.trim()) notes[ticker] = note.trim(); else delete notes[ticker];
    return { ...l, notes };
  })),
  togglePin: (ticker: string) => update((s) => mapActive(s, (l) => {
    const pinned = new Set(l.pinned ?? []);
    if (pinned.has(ticker)) pinned.delete(ticker); else pinned.add(ticker);
    return { ...l, pinned: [...pinned] };
  })),
};

/** Mọi mã trong mọi danh mục (Radar dùng để giữ "xoá khỏi danh mục thì xoá khỏi Radar"). */
export function allWatchlistTickers(lists: Watchlist[]): string[] {
  return [...new Set(lists.flatMap((l) => l.tickers))];
}

/** Danh sách mã (cũ) còn tồn tại trong trình duyệt này không (để hiện nút gộp / xoá). */
export function hasLegacyList(lists: Watchlist[]): boolean {
  return lists.some((l) => l.name === LEGACY_LIST_NAME);
}

export function useWatchlists() {
  const state = useSyncExternalStore(subscribe, read, () => DEFAULT);
  const active = state.lists.find((l) => l.id === state.activeId) ?? state.lists[0];
  const radar = state.lists.find((l) => l.id === state.radarId) ?? state.lists.find((l) => l.id === "default") ?? state.lists[0];
  return { lists: state.lists, active, radar, ...watchlistActions };
}

/** Chỉ dùng trong test. */
export function resetWatchlistsForTest() {
  memory = null; cachedRaw = null; cachedState = DEFAULT;
}
