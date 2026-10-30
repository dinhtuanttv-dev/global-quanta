import useSWR from "swr";
import type { CatalystSnapshot, CatalystErrorResponse } from "../types/catalyst";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const ENDPOINT = `${API_BASE}/api/catalysts/latest`;

// Phase 1 (tich hop tu goi ban giao Chat Xuc Tac 2.0): them timeout + retry
// backoff cho fetch - ban goc chi fetch().then(r=>r.json()) tran, khong co
// timeout nen 1 request treo co the lam UI cho vo han. GIU NGUYEN response
// shape/hop dong { snapshot, noDataYet, transientError, isLoading, error,
// refresh } de khong pha vo cac component dang dung useCatalystData().
const FETCH_TIMEOUT_MS = 9000;
const MAX_RETRIES = 2;

async function fetchWithTimeout(url: string, attempt = 0): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    // Khong throw tren !res.ok o day: backend co the tra 503 kem body
    // { error, transient: true } ma UI can doc duoc (xem hasError/isTransientError
    // duoi day) - throw som se lam mat thong tin "transient" nay.
    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (attempt < MAX_RETRIES) {
      const backoffMs = 500 * 2 ** attempt; // 500ms, 1s
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      return fetchWithTimeout(url, attempt + 1);
    }
    throw err;
  }
}

const fetcher = (url: string): Promise<CatalystSnapshot | CatalystErrorResponse> => fetchWithTimeout(url) as Promise<CatalystSnapshot | CatalystErrorResponse>;

export function useCatalystData() {
  const { data, error, isLoading, mutate } = useSWR<CatalystSnapshot | CatalystErrorResponse>(
    ENDPOINT,
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false, dedupingInterval: 60 * 1000 }
  );

  const hasError = data && "error" in data;
  const snapshot = data && !hasError ? (data as CatalystSnapshot) : null;
  const errorBody = hasError ? (data as CatalystErrorResponse) : null;
  // "transient" = loi Redis tam thoi (503) - nen khuyen khich thu lai.
  // Khac voi "chua co du lieu" (binh thuong, chi can doi lan quet dau tien).
  const isTransientError = !!(errorBody && (errorBody as any).transient === true);

  return {
    snapshot,
    noDataYet: !isTransientError ? errorBody?.error ?? null : null,
    transientError: isTransientError ? errorBody?.error ?? null : null,
    isLoading, error, refresh: mutate,
  };
}
