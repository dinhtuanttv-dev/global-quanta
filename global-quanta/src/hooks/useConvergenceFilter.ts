// Nguồn Hợp lưu cho bộ lọc Golden / TA Consensus — từ 2026-10-09 đọc Bộ lọc Hợp lưu v2 của Market Gateway
// (thay /api/convergence-scan của Project A: Yahoo chưa điều chỉnh, Wyckoff v1, OB/FVG không xét chiều).
// Giữ nguyên hình dạng trả về cũ. CHỈ PHÍA MUA (TA Consensus là danh sách mua); compositeScore = điểm Hợp lưu v2 (0–100).
import { useConvergenceV2, type ConvergenceDoc } from "./useConvergenceV2";

export interface ConvergenceResult {
  ticker: string;
  sector: string;
  wyckoffPhase: string;
  compositeScore: number;
  grade: "A" | "B" | "C";
  status: "READY" | "WATCH";
}

export function toLegacyConvergence(doc: ConvergenceDoc | undefined): ConvergenceResult[] {
  return (doc?.results ?? [])
    .filter((r) => r.side === "buy")
    .map((r) => ({ ticker: r.ticker, sector: r.sector ?? "-", wyckoffPhase: r.wyckoff.phase, compositeScore: r.metrics.score, grade: r.grade, status: r.status }))
    .sort((a, b) => b.compositeScore - a.compositeScore);
}

export function useConvergenceFilter() {
  const { data, error, isLoading, refresh } = useConvergenceV2();
  return {
    results: toLegacyConvergence(data),
    universeSource: "GATEWAY_CONVERGENCE_V2" as const,
    totalUniverse: data?.scannedCount ?? 0,
    isLoading, error, refresh,
  };
}
