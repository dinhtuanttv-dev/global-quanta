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
interface State { lists: Watchlist[]; activeId: string }

const KEY = "gq.watchlists.v1";
const LEGACY_MIGRATED_KEY = "gq.watchlists.legacyMigrated";
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
    cachedState = { lists: parsed.lists, activeId: parsed.lists.some((l) => l.id === parsed.activeId) ? parsed.activeId : parsed.lists[0].id };
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
    return lists.length ? { lists, activeId: lists[0].id } : DEFAULT;
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

export function isLegacyMigrated(): boolean {
  try { return Boolean(window.localStorage.getItem(LEGACY_MIGRATED_KEY)); } catch { return Boolean(memory?.lists.some((l) => l.name === LEGACY_LIST_NAME)); }
}

/** Mọi mã trong mọi danh mục (Radar dùng để giữ "xoá khỏi danh mục thì xoá khỏi Radar"). */
export function allWatchlistTickers(lists: Watchlist[]): string[] {
  return [...new Set(lists.flatMap((l) => l.tickers))];
}

/**
 * Chuyển danh sách mã của cột trái cũ sang ★ Danh mục — một lần cho mỗi trình duyệt.
 * Giữ thứ tự, ghi chú (lý do theo dõi) và mã đã ghim; không đổi danh mục đang chọn của người dùng.
 * @returns true nếu vừa chuyển
 */
export function migrateLegacyWatchlist(legacy: { ticker: string; reason?: string | null; pinned?: boolean }[]): boolean {
  try { if (window.localStorage.getItem(LEGACY_MIGRATED_KEY)) return false; } catch { if (memory?.lists.some((l) => l.name === LEGACY_LIST_NAME)) return false; }
  const tickers = [...new Set(legacy.map((w) => w.ticker.toUpperCase()).filter((t) => TICKER_RE.test(t)))].slice(0, MAX_WATCHLIST_TICKERS);
  if (!tickers.length) return false;
  const notes = Object.fromEntries(legacy.filter((w) => w.reason).map((w) => [w.ticker.toUpperCase(), String(w.reason)]));
  const pinned = legacy.filter((w) => w.pinned).map((w) => w.ticker.toUpperCase());
  update((s) => {
    if (s.lists.some((l) => l.name === LEGACY_LIST_NAME)) return s;
    const lists = s.lists.length === 1 && s.lists[0].id === "default" && s.lists[0].tickers.length === 0
      ? [] // danh mục mặc định còn trống -> thay bằng danh sách cũ
      : s.lists;
    const list: Watchlist = { id: "legacy", name: LEGACY_LIST_NAME, tickers, notes, pinned };
    return { lists: [...lists, list], activeId: lists.length ? s.activeId : list.id };
  });
  try { window.localStorage.setItem(LEGACY_MIGRATED_KEY, new Date().toISOString()); } catch { /* bỏ qua */ }
  return true;
}

export function useWatchlists() {
  const state = useSyncExternalStore(subscribe, read, () => DEFAULT);
  const active = state.lists.find((l) => l.id === state.activeId) ?? state.lists[0];
  return { lists: state.lists, active, ...watchlistActions };
}

/** Chỉ dùng trong test. */
export function resetWatchlistsForTest() {
  memory = null; cachedRaw = null; cachedState = DEFAULT;
}
