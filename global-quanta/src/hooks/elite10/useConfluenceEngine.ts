import useSWR from "swr";
import type { EliteScoreBreakdown, ConfluenceSource, ConfluenceStatus } from "../../types/taVnIndex";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "https://tuan-quant-scanner-psi.vercel.app";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

interface ConfluenceApiResponse {
  score: number; starRating: number;
  sources: { key: string; name: string; status: string; detail: string; weightPct: number | null; isCurrentTab: boolean }[];
  nAvailable: number; limitationsNote: string;
}

const STATUS_MAP: Record<string, ConfluenceStatus> = { ok: "ok", warn: "warn", no_data: "no_data" };

/** MAP response Confluence Engine THAT (route /api/elite10/confluence)
 * sang dung format EliteScoreBreakdown ma ConfluencePanel.tsx da ky vong -
 * GIU NGUYEN UI component, chi THAY NGUON DU LIEU tu mock sang that
 * (ra soat 2026-09-17).
 *
 * FIX (2026-09-18): production bao loi ".map of undefined" - backend co
 * the tra ve response THIEU field "sources" (loi/timeout khong catch
 * dung o 1 nhanh code nao do). Guard AN TOAN o day, KHONG gia dinh
 * response luon dung dinh dang du kien. */
function mapToBreakdown(res: ConfluenceApiResponse): EliteScoreBreakdown {
  const sources: ConfluenceSource[] = Array.isArray(res?.sources)
    ? res.sources.map((s) => ({
        key: s.key, name: s.name,
        status: STATUS_MAP[s.status] ?? "no_data",
        detail: s.detail, weightPct: s.weightPct, isCurrentTab: s.isCurrentTab,
      }))
    : [];
  return {
    overall: { value: res?.score ?? 0, source: "ESTIMATED" },
    sourcesWithData: res?.nAvailable ?? 0, sourcesTotal: 6,
    sources,
    concentrationRiskNote: res?.limitationsNote ?? "Không có dữ liệu.",
    weightsConfirmed: false,
  };
}

export function useConfluenceEngine(ticker: string | null) {
  const { data, error, isLoading } = useSWR<ConfluenceApiResponse>(
    ticker ? `${API_BASE}/api/elite10/confluence/${ticker}` : null,
    fetcher,
    { refreshInterval: 30 * 60 * 1000, revalidateOnFocus: false, dedupingInterval: 10 * 60 * 1000 }
  );
  return { breakdown: data ? mapToBreakdown(data) : null, isLoading, error };
}
