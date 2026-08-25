// useDividendFilterUrl - va lo hong #7 (mat filter khi F5).
// Dong bo DividendFilter voi URL query params -> chia se link duoc,
// F5 khong mat trang thai. BAN VIET LAI CHO VITE: Project B khong co
// next.config, khong co react-router-dom -> khong the dung next/navigation.
// Thay bang URLSearchParams thuan + window.history.replaceState (khong
// router, khong reload trang, hanh vi tuong duong ban goc).

import { useEffect, useRef, useCallback } from "react";
import { DEFAULT_FILTER, type DividendFilter } from "../lib/quant-cotuc";

const FIELD_KEYS: (keyof DividendFilter)[] = [
  "minYield", "minRoe", "maxPe", "maxDebt", "minFscore",
  "trend", "phase", "upcomingGDKHQ", "upcomingAGM", "hideRiskFlags", "searchQ",
];

export function useDividendFilterUrl(filter: DividendFilter, setFilter: (f: DividendFilter) => void) {
  const didInit = useRef(false);

  // Doc filter tu URL khi mount lan dau (chi 1 lan, giong ban goc dung [])
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    const params = new URLSearchParams(window.location.search);
    const fromUrl: Partial<DividendFilter> = {};
    FIELD_KEYS.forEach((key) => {
      const raw = params.get(key);
      if (raw === null) return;
      const defaultVal = DEFAULT_FILTER[key];
      if (typeof defaultVal === "boolean") (fromUrl as any)[key] = raw === "true";
      else if (typeof defaultVal === "number") (fromUrl as any)[key] = parseFloat(raw);
      else (fromUrl as any)[key] = raw;
    });
    if (Object.keys(fromUrl).length > 0) setFilter({ ...DEFAULT_FILTER, ...fromUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncToUrl = useCallback((f: DividendFilter) => {
    const params = new URLSearchParams();
    FIELD_KEYS.forEach((key) => {
      const val = f[key];
      const defaultVal = DEFAULT_FILTER[key];
      if (val !== defaultVal && val !== "" && val !== undefined) params.set(key, String(val));
    });
    const query = params.toString();
    const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    // replaceState thay vi router.replace: khong reload, khong them history entry
    window.history.replaceState(null, "", newUrl);
  }, []);

  useEffect(() => { syncToUrl(filter); }, [filter, syncToUrl]);
}
