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
        if (!res.ok) throw new Error("Chua co du lieu catalyst");
        const json = await res.json();
        if (!cancelled) { setData(json); setError(null); }
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
