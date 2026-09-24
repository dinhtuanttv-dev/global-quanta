import { useState } from 'react';
import useSWR from 'swr';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'https://tuan-quant-scanner-psi.vercel.app';
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

// Elite 10 - Muc A/B (Tech Spec v2) Giai doan 4/4: hook cho Multi-Agent
// Debate + LMSR + Jury of Judges. Noi voi route /api/elite10/debate/
// {ticker} - GET tu dong doc lai debate GAN NHAT khi mo ma (khong tinh
// gi moi, khong ton chi phi AI), POST chi chay KHI nguoi dung bam nut
// "Chay Debate AI" (on-demand, ton chi phi that moi lan bam).

export interface DebateRound { round: number; side: 'bull' | 'bear'; model: string; argument: string; confidencePct: number; citedFields: string[]; }
export interface JudgeVote { judge: string; verdict: 'bullish' | 'bearish' | 'neutral'; confidencePct: number; reasoning: string; }
export interface DebateSessionData {
  id?: number; sessionId?: number; ticker: string; createdAt?: string; status: string;
  rounds: DebateRound[];
  lmsrQYes?: number; lmsrQNo?: number; lmsrFinalPricePct: number;
  judgeVotes: JudgeVote[] | null; finalVerdict: 'bullish' | 'bearish' | 'neutral' | null;
  isTieBreak?: boolean; avgConfidencePct?: number;
  isSingleProviderDebate?: boolean; isSingleProviderJury?: boolean;
  note?: string; errorMessage?: string | null;
}

export function useDebateSession(ticker: string | null) {
  const { data, error, isLoading, mutate } = useSWR<DebateSessionData>(
    ticker ? `${API_BASE}/api/elite10/debate/${ticker}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60 * 1000, shouldRetryOnError: false }
  );

  const [isRunning, setIsRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const runDebate = async () => {
    if (!ticker) return;
    setIsRunning(true);
    setRunError(null);
    try {
      const res = await fetch(`${API_BASE}/api/elite10/debate/${ticker}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ triggeredBy: 'on_demand' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Lỗi ${res.status}`);
      }
      const fresh = await res.json();
      await mutate(fresh, { revalidate: false });
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Không thể chạy Debate AI lúc này (có thể do Gemini đang quá tải tạm thời, thử lại sau).');
    } finally {
      setIsRunning(false);
    }
  };

  return {
    debate: data ?? null,
    hasExistingDebate: Boolean(data) && !error,
    isLoadingExisting: isLoading,
    isRunning, runError, runDebate,
  };
}
