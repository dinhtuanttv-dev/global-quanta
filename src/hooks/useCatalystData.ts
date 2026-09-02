import { useEffect, useState } from "react";
import type { CatalystSnapshot } from "../types/catalyst";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export function useCatalystData(pollMs = 60_000) {
  const [data, setData] = useState<CatalystSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${API_BASE}/api/catalysts/latest`);

        // The backend returns 404 while the cron cache is still cold
        // ("Chưa có dữ liệu - chờ lần quét cron đầu tiên"). Treat that as
        // "no data yet" instead of an error so the macro tab never breaks.
        if (res.status === 404) {
          if (!cancelled) {
            setData(null);
            setError(null);
          }
        } else {
          if (!res.ok) throw new Error(`Catalyst API loi: ${res.status}`);
          const json = (await res.json()) as CatalystSnapshot;
          if (!cancelled) {
            setData(json);
            setError(null);
          }
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    const interval = setInterval(load, pollMs);
    return () => { cancelled = true; clearInterval(interval); };
  }, [pollMs]);

  return { data, error, isLoading };
}
