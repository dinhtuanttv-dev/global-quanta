// useDebouncedValue - vas lo hong #5 (khong debounce o tim kiem).
// Tri hoan cap nhat gia tri sau delay ms, tranh re-filter moi keystroke.

import { useState, useEffect } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
