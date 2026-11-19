// W2/W4 (19/11/2026) — nhớ bộ lọc của người xem trong localStorage (chỉ tiện ích theo máy; hỏng/khoá thì dùng mặc định).
import { useEffect, useState } from 'react';

export function readPersisted<T>(key: string, fallback: T, valid: (v: unknown) => v is T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const v: unknown = JSON.parse(raw);
    return valid(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

/** useState có lưu: đọc một lần lúc dựng, ghi mỗi khi đổi. */
export function usePersistedState<T>(key: string, fallback: T, valid: (v: unknown) => v is T) {
  const [v, setV] = useState<T>(() => readPersisted(key, fallback, valid));
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(v)); } catch { /* chỉ nhớ trong phiên */ }
  }, [key, v]);
  return [v, setV] as const;
}

/** Giá trị trễ (debounce) — tránh gọi Gateway theo từng phím gõ. */
export function useDebounced<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export const PERSIST_KEYS = {
  matrixFilter: 'gq.world.matrix.filter.v1',
  eventFilter: 'gq.world.events.filter.v1',
  scenarioCompare: 'gq.world.scenario.compare.v1',
} as const;
