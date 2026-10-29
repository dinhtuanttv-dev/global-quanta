import useSWR from "swr";
import { getAccessToken } from "../../services/api";
import { fetchMarketJson, isMarketGatewayEnabled } from "../../services/marketDataClient";
import type { EliteFilter } from "../../lib/elite10/filterEngine";
import type { PortfolioPick } from "../../lib/elite10/decisionTypes";

export interface LedgerHorizonLite { n: number; meanExcess: number | null; hitRate: number | null; meanPortfolioNet: number | null }
export interface MyLedger { startedAt: string | null; summary: { horizons: Record<string, LedgerHorizonLite> } | null; entries: { date: string; passCount: number; holdings: { ticker: string; weight: number }[]; results?: Record<string, { excess: number }> }[] }
export interface MyFilterDoc { filter: EliteFilter | null; active: boolean; savedAt: string | null; hash: string | null; ledger: MyLedger | null }
export interface MyPortfolio { date: string; pass: string[]; perCond: number[]; portfolio: PortfolioPick[]; construction: { method: string; sessions: number }; filter: EliteFilter; savedAt: string | null; ledger: MyLedger | null }

const authed = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const token = await getAccessToken().catch(() => null);
  if (!token) throw new Error("Cần đăng nhập.");
  return fetchMarketJson<T>(path, {}, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${token}`, "content-type": "application/json" } });
};

/** Bộ lọc Elite đã lưu theo tài khoản + danh mục "Elite 10 · bộ lọc của tôi" + sổ theo dõi tiến (Gateway). */
export function useMyFilter() {
  const on = isMarketGatewayEnabled();
  const doc = useSWR<MyFilterDoc>(on ? "elite-my-filter" : null, () => authed<MyFilterDoc>("/api/elite/my-filter"), { revalidateOnFocus: false, shouldRetryOnError: false });
  const pf = useSWR<MyPortfolio | null>(on && doc.data?.filter ? ["elite-my-portfolio", doc.data.hash] : null,
    () => authed<MyPortfolio>("/api/elite/my-portfolio"), { revalidateOnFocus: false, shouldRetryOnError: false, dedupingInterval: 5 * 60_000 });
  const save = async (filter: EliteFilter, active = true) => {
    const r = await authed<MyFilterDoc>("/api/elite/my-filter", { method: "PUT", body: JSON.stringify({ filter, active }) });
    await doc.mutate(r, { revalidate: false });
    await pf.mutate();
    return r;
  };
  return { saved: doc.data ?? null, savedError: doc.error ? String((doc.error as Error).message) : null, portfolio: pf.data ?? null, portfolioLoading: pf.isLoading, portfolioError: pf.error ? String((pf.error as Error).message) : null, save };
}
