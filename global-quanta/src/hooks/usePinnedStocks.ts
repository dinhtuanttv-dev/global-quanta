// usePinnedStocks - ghim ma co phieu, luu vao localStorage (persist qua F5).
// Xu ly an toan khi localStorage khong kha dung (SSR, private browsing).

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "cotuc:pinned-tickers";

function readFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((t) => typeof t === "string") : [];
  } catch {
    return []; // localStorage bi chan (private browsing) hoac JSON hong - fallback rong, khong crash
  }
}

function writeToStorage(tickers: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tickers));
  } catch {
    // Bo qua loi ghi (vd: het dung luong, private browsing) - khong lam crash UI
  }
}

export function usePinnedStocks() {
  const [pinned, setPinned] = useState<string[]>([]);

  useEffect(() => { setPinned(readFromStorage()); }, []);

  const togglePin = useCallback((ticker: string) => {
    setPinned((prev) => {
      const next = prev.includes(ticker) ? prev.filter((t) => t !== ticker) : [...prev, ticker];
      writeToStorage(next);
      return next;
    });
  }, []);

  const isPinned = useCallback((ticker: string) => pinned.includes(ticker), [pinned]);

  return { pinned, togglePin, isPinned };
}
