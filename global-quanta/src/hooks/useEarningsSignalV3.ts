import useSWR from "swr";
import type { EarningsSignal } from "../lib/cotuc/timing-types";

/**
 * Hook don gian lay EarningsSignal (Giai Trinh Timing v3 - Giai doan 3)
 * tu route MOI /api/cotuc/earnings-signal?ticker= - KHONG can phuc tap
 * nhu useCyclePaths/useCycleStatsV3 (khong co retry/stale logic rieng,
 * vi day la du lieu it thay doi trong ngay, SWR mac dinh la du).
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "https://tuan-quant-scanner-psi.vercel.app";

async function fetcher(url: string): Promise<EarningsSignal | null> {
  const res = await fetch(url);
  if (res.status === 422 || res.status === 404) return null; // chua co du lieu - khong phai loi
  if (!res.ok) throw new Error(`Loi ${res.status}`);
  return res.json();
}

export function useEarningsSignalV3(ticker: string | null | undefined) {
  const key = ticker ? `${API_BASE}/api/cotuc/earnings-signal?ticker=${encodeURIComponent(ticker)}` : null;
  const { data, error, isLoading } = useSWR<EarningsSignal | null>(key, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60 * 1000,
  });
  return { data: data ?? null, isLoading, error };
}
