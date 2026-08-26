import { useState, useEffect, useCallback } from "react";

// PHUONG AN D: danh sach ma nguoi dung "yeu cau bo sung" - KHONG duoc dua
// vao calcDividendScore/calcDCF vi thieu du lieu PE/ROE/gia... (se ra ket
// qua sai lech, VD score=0 hoac DCF=0 bi hieu nham la that). Day chi la
// "wishlist" hien thi rieng, dung localStorage giong pattern usePinnedStocks.ts
// da co san (nhat quan style).

const STORAGE_KEY = "gq_cotuc_requested_tickers_v1";

function loadFromStorage(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(list: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // localStorage day/bi chan - bo qua, khong crash
  }
}

export function useRequestedTickers() {
  const [requested, setRequested] = useState<string[]>([]);

  useEffect(() => {
    setRequested(loadFromStorage());
  }, []);

  const addRequested = useCallback((ticker: string) => {
    setRequested((prev) => {
      if (prev.includes(ticker)) return prev;
      const next = [...prev, ticker];
      saveToStorage(next);
      return next;
    });
  }, []);

  const removeRequested = useCallback((ticker: string) => {
    setRequested((prev) => {
      const next = prev.filter((t) => t !== ticker);
      saveToStorage(next);
      return next;
    });
  }, []);

  return { requested, addRequested, removeRequested };
}
