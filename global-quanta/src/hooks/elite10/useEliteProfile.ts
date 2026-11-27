import useSWR from "swr";
import { fetchMarketJson } from "../../services/marketDataClient";
import type { ProfileSnapshot } from "../../lib/elite10/profileTypes";

// HS360-v3 H4: ảnh chụp Hồ sơ 360° của một mã (Gateway bộ đệm 5 phút theo mã × phiên). 404 = mã ngoài vũ trụ -> data null, không lặp lại.
const OPTS = { revalidateOnFocus: false, refreshInterval: 30 * 60_000, dedupingInterval: 5 * 60_000, errorRetryCount: 1, shouldRetryOnError: (e: unknown) => (e as { status?: number })?.status !== 404 };

export function useEliteProfile(ticker: string | null) {
  const t = ticker && /^[A-Z0-9]{3,10}$/.test(ticker) && ticker !== "VNINDEX" ? ticker : null;
  return useSWR<ProfileSnapshot>(t ? `elite-profile:${t}` : null, () => fetchMarketJson<ProfileSnapshot>(`/api/elite/profile/${t}`), OPTS);
}
