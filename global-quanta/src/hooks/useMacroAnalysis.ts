import { useState, useCallback } from "react";
import { mutate } from "swr";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

interface AnalysisResult {
  market: { summaryVi: string; affectedSectorKeys: string[]; direction: "positive" | "negative" | "mixed"; confidence: number; evidenceRefs: string[] } | null;
  news: unknown;
  evidence: { verified: boolean; discrepancies: string[]; finalConfidence: number };
  finalConfidence: number;
  disclaimer: string;
  // MUC 4: minh bach cho biet day la ket qua cache (khong ton phi Gemini
  // lan nay) hay moi goi that.
  cached?: boolean;
  cacheAgeMinutes?: number;
}

// KHONG dung SWR/auto-refresh o day - AI Multi-Agent (Gemini) TON PHI THAT
// moi lan goi, giong dung nguyen tac da ap dung cho /api/chat trong guide
// goc ("chi goi khi nguoi dung bam nut thu cong, khong tu dong"). Hook nay
// la 1 action (goi bang tay), khong phai 1 data source tu dong refresh.
export function useMacroAnalysis() {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/ai/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Lỗi ${res.status}`);
      }
      const json = await res.json();
      setResult(json);
      // FIX (2026-08-27): kich hoat StockImpactTable tu tai lai ngay sau
      // khi phan tich xong - truoc day 2 SWR/fetch doc lap khong dong bo,
      // bang tac dong co phieu chi lam moi khi doi cua so (revalidateOnFocus),
      // khong phai ngay sau khi bam nut trong cung trang.
      mutate(`${API_BASE}/api/global/impact-table`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi không xác định khi phân tích AI");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { result, isLoading, error, analyze };
}
