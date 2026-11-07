// BL4 (07/11/2026) — bộ lọc đã lưu + cột hiển thị của Bộ lọc cổ tức THEO TÀI KHOẢN: lưu ngay trên máy (khoá theo tài khoản),
// đồng bộ Gateway /api/market/screener-prefs có phiên bản máy chủ (409 -> dùng bản mới nhất của máy chủ, báo người dùng).
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMarketJson, isMarketGatewayEnabled, MarketApiError } from "../services/marketDataClient";
import { getAccessToken } from "../services/api";
import { readScoped, userScope, writeScoped } from "../lib/ta-command-center/userScope";
import { EMPTY_PREFS, sanitizePrefs, type ScreenerPrefs } from "../lib/cotuc/screenerPrefs";

const KEY = "gq.cotuc.screener.v1";
const PATH = "/api/market/screener-prefs";
export type PrefsCloud = "idle" | "saving" | "saved" | "local";
interface Saved { prefs: ScreenerPrefs; updatedAt: string | null; dirty: boolean }

function readLocal(scope: string): Saved {
  try {
    const raw = JSON.parse(readScoped(KEY, scope) ?? "null") as { prefs?: unknown; updatedAt?: string | null; dirty?: boolean } | null;
    return raw ? { prefs: sanitizePrefs(raw.prefs), updatedAt: raw.updatedAt ?? null, dirty: raw.dirty === true } : { prefs: EMPTY_PREFS, updatedAt: null, dirty: false };
  } catch { return { prefs: EMPTY_PREFS, updatedAt: null, dirty: false }; }
}
const token = async () => (isMarketGatewayEnabled() ? getAccessToken().catch(() => null) : null);

export function useScreenerPrefs() {
  const scope = useRef(typeof window === "undefined" ? "guest" : userScope());
  const [saved, setSaved] = useState<Saved>(() => readLocal(scope.current));
  const [cloud, setCloud] = useState<PrefsCloud>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef(saved); ref.current = saved;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = (s: Saved) => { ref.current = s; setSaved(s); writeScoped(KEY, JSON.stringify(s), scope.current); };

  const push = useCallback(async () => {
    const tk = await token();
    if (!tk) { setCloud("local"); return; }
    setCloud("saving");
    const sent = ref.current;
    try {
      const r = await fetchMarketJson<{ updatedAt: string }>(PATH, {}, {
        method: "PUT", body: JSON.stringify({ prefs: sent.prefs, baseUpdatedAt: sent.updatedAt }), headers: { authorization: `Bearer ${tk}`, "content-type": "application/json" },
      });
      persist({ ...ref.current, updatedAt: r.updatedAt, dirty: ref.current !== sent });
      setCloud("saved");
    } catch (e) {
      if (e instanceof MarketApiError && e.status === 409) {
        const cur = e.body.current as { prefs?: unknown; updatedAt?: string | null } | undefined;
        persist({ prefs: sanitizePrefs(cur?.prefs), updatedAt: cur?.updatedAt ?? null, dirty: false });
        setNotice("Bộ lọc đã lưu vừa được đổi ở thiết bị khác — đang dùng bản mới nhất.");
        setCloud("saved");
      } else setCloud("local");
    }
  }, []);

  // Nạp bản đám mây một lần: máy có thay đổi chưa đồng bộ -> đẩy lên; không -> dùng bản đám mây.
  useEffect(() => {
    let off = false;
    (async () => {
      const tk = await token();
      if (!tk) { if (!off) { setCloud("local"); setLoaded(true); } return; }
      const r = await fetchMarketJson<{ prefs: unknown; updatedAt: string | null }>(PATH, {}, { headers: { authorization: `Bearer ${tk}` } }).catch(() => null);
      if (off) return;
      if (r) {
        if (ref.current.dirty) { persist({ ...ref.current, updatedAt: r.updatedAt ?? null }); void push(); }
        else if (r.prefs && r.updatedAt) { persist({ prefs: sanitizePrefs(r.prefs), updatedAt: r.updatedAt, dirty: false }); setCloud("saved"); }
      } else setCloud("local");
      setLoaded(true);
    })();
    return () => { off = true; };
  }, [push]);

  const update = useCallback((fn: (p: ScreenerPrefs) => ScreenerPrefs) => {
    persist({ ...ref.current, prefs: sanitizePrefs(fn(ref.current.prefs)), dirty: true });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void push(); }, 1200);
  }, [push]);

  return { prefs: saved.prefs, update, cloud, notice, loaded };
}
