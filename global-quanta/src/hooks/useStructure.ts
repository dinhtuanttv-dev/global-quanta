// Bản tóm tắt cấu trúc toàn universe (job 15:47, /api/market/structure-summary) cho bảng bộ lọc + sổ M1. Bảng phân tích một mã
// dùng MTF v3 (hooks/useStructure3). Endpoint v2 /api/market/structure/:symbol đã gỡ (30/10/2026).
import useSWR from "swr";
import { marketUrl } from "../services/marketDataClient";

export type StructureStage = "A" | "UP" | "B" | "C" | "D" | "DOWN" | "Bp" | "RANGE";
export type StructureVerdict = "MUA" | "CHỜ MUA" | "ĐỨNG NGOÀI" | "GIẢM TỶ TRỌNG" | "BÁN";
export type EvidenceLabel = "ĐÃ KIỂM ĐỊNH" | "THỰC NGHIỆM" | "ĐANG KIỂM ĐỊNH" | "MÔ TẢ";
export type StructurePatternContext = "reversal" | "reaccum" | "countertrend";

export interface StructureSummaryRow {
  t: string; asOf: string; st: StructureStage; age: number; ws: StructureStage | null; dow: number; v: StructureVerdict; rule: string; sc: number; ss: number; chg: boolean;
  prev?: StructureStage | null; pat: { type: string; status: string; date: string; ctx?: StructurePatternContext } | null; sig: { code: string; date: string } | null;
  sup: number | null; res: number | null; trigL: number | null; trigS: number | null;
  /** v2 khung ngày (giữ cho sổ M1): cờ quá đà, R:R tại giá hiện tại. */
  ext?: number; rr?: { v: number | null; ok: boolean } | null;
  /** MTF v3 (Ngày · Tuần · Tháng) — job 15:47 từ 30/10/2026. */
  s3?: {
    st: "S1" | "S2" | "S3" | "S4" | "NA"; age: number; tpl: number; dow: string; ws: "S1" | "S2" | "S3" | "S4" | "NA" | null; wdow: string | null; ord: number | null;
    dec: "setup" | "blocked" | "wait"; setup: "pullback" | "breakout" | "expansion" | "reversal" | null; rr: number | null;
    base: { p: string; ok: boolean; fp: string; bk: string | null } | null;
  };
}
export interface StructureLedgerStats {
  target: number; updatedAt: string | null;
  coverage: Record<string, { sessions: number; forecasts: number; coverage: number | null; alpha: number | null; offset: number | null; through: string | null }>;
  verdicts: Record<string, { n: number; meanRet10: number | null; recentN: number }>;
}
/** Sổ thời gian thực M1 "đà tăng tiếp diễn" (MTF-momentum-prereg): BẬT = cờ quá đà trong giai đoạn UP / B, so với TẮT. */
export interface StructureMomentumStats {
  prereg: string; firstDay: string | null; recordedDays: number; scoredDays: number; pendingDays: number; minDays: number;
  meanS: number | null; ciS: [number, number] | null; meanL: number | null; hitS: number | null; meanOn: number | null; meanOff: number | null;
  lastGroup: { d: string; on: number; off: number } | null; verdict: "PENDING" | "PASS" | "FAIL"; confirm: string | null; label: string; updatedAt: string | null;
}
export interface StructureTransition { t: string; from: StructureStage | null; to: StructureStage; v: StructureVerdict }
export interface StructureSummaryDoc {
  engine: string; generatedAt: string; asOf: string; evidence: Record<string, EvidenceLabel>; verdictValidated?: boolean; rows: StructureSummaryRow[]; skipped: string[];
  transitions?: StructureTransition[]; ledger?: StructureLedgerStats | { error: string } | null;
  momentum?: StructureMomentumStats | { error: string } | null;
}

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Gateway trả HTTP ${response.status}`);
  }
  return response.json();
};

/** Tóm tắt cấu trúc toàn universe (job 15:47) — Map theo mã. */
export function useStructureSummary(enabled = true) {
  const { data, error, isLoading } = useSWR<StructureSummaryDoc>(enabled ? marketUrl("/api/market/structure-summary") : null, fetcher,
    { refreshInterval: 10 * 60_000, revalidateOnFocus: false, dedupingInterval: 5 * 60_000 });
  const byTicker = new Map((data?.rows ?? []).map((r) => [r.t, r]));
  return { data, byTicker, error: error as Error | undefined, isLoading };
}
