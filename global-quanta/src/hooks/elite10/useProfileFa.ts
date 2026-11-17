import useSWR from "swr";
import { fetchMarketJson } from "../../services/marketDataClient";
import type { ProfileFa, ProfileFaWarnings } from "../../lib/elite10/profileFaTypes";

// PFA-v1: hồ sơ Doanh nghiệp & Sự kiện (Gateway dựng 1 lần/phiên sau bảng E1) — làm mới 30 phút/lần như các hook Elite khác.
const OPTS = { revalidateOnFocus: false, refreshInterval: 30 * 60_000, dedupingInterval: 5 * 60_000, errorRetryCount: 1 };
const quiet404 = async <T,>(path: string): Promise<T | null> => {
  try { return await fetchMarketJson<T>(path); } catch (e) { if (/404|chưa có|không nằm trong/i.test(String((e as Error).message))) return null; throw e; }
};
export function useProfileFa(ticker: string | null) {
  return useSWR<ProfileFa | null>(ticker ? ["elite-profile-fa", ticker] : null, () => quiet404<ProfileFa>(`/api/elite/profile-fa/${ticker}`), OPTS);
}
/** Cảnh báo pha B của mọi mã trong phiên (một lần gọi cho cả bảng quyết định). */
export function useProfileFaWarnings() {
  return useSWR<ProfileFaWarnings | null>("elite-profile-fa-warnings", () => quiet404<ProfileFaWarnings>("/api/elite/profile-fa/warnings"), OPTS);
}
