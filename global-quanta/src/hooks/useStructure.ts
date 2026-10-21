// Cấu trúc thị trường đa khung (T5) — đọc Gateway /api/market/structure/:symbol (Tuần / Ngày / 1 giờ, SSI) và
// /api/market/structure-summary (tóm tắt toàn universe cho bảng bộ lọc). Chỉ tải khi người dùng bật lớp / mở bảng.
import useSWR from "swr";
import { marketUrl } from "../services/marketDataClient";

export type StructureStage = "A" | "UP" | "B" | "C" | "D" | "DOWN" | "Bp" | "RANGE";
export type StructureTfKey = "W" | "D" | "H1";
export type StructureVerdict = "MUA" | "CHỜ MUA" | "ĐỨNG NGOÀI" | "GIẢM TỶ TRỌNG" | "BÁN";
export type EvidenceLabel = "ĐÃ KIỂM ĐỊNH" | "THỰC NGHIỆM" | "ĐANG KIỂM ĐỊNH" | "MÔ TẢ";

export interface StructureZone { lo: number; hi: number; mid: number; strength: number; sources: string[]; touches: number; role: "support" | "resistance"; flipped: boolean }
export interface StructureCheck { key: string; ok: boolean; text: string }
export interface StructureSegment { stage: StructureStage; label: string; from: string; to: string; bars?: number }
export interface StructurePattern {
  type: "W" | "M" | "IHS" | "HS"; name: string; dir: 1 | -1; status: "forming" | "confirmed" | "failed";
  points: { date: string; price: number; label: string }[]; neck: { d0: string; p0: number; d1: string; p1: number };
  confirmedDate: string; breakDate: string | null; failDate: string | null; target: number; height: number;
}
export interface StructureTf {
  tf: StructureTfKey; asOf: string; close: number; stage: StructureStage; stageLabel: string; stageText: string; stageAge: number; dow: number;
  ma: { fast: number; slow: number; fastValue: number | null; slowValue: number | null }; dev: number | null; slope: number | null; spread: number | null; atr: number | null;
  segments: StructureSegment[]; zones: StructureZone[];
  base: { from: string; to: string; lo: number; hi: number; bars: number; rangeAtr: number; contractions: number; tight: boolean; positionPct: number; bbwPct: number | null; maConverged: boolean } | null;
  patterns: StructurePattern[];
  signals: { date: string; code: string; side: "MUA" | "BÁN"; price: number; note: string }[];
  swings: { date: string; kind: "H" | "L"; price: number; confirmedDate: string }[];
  checklistBuy: StructureCheck[]; checklistSell: StructureCheck[];
}
export interface StructureScenario { side: "L" | "S"; title: string; trigger: number; entry: number; stop: number; targets: number[]; rr: number | null; targetBasis: "zones" | "R-multiple"; text: string }
export interface StructureAnnotation { tf: StructureTfKey; kind: "stage" | "pattern" | "signal" | "swing"; date: string; price: number; text: string; detail: string; tone: "bull" | "bear" | "neutral" | "warn" }
export interface StructureCone { horizons: Record<string, { p10: number; p50: number; p90: number; kind: "cqr" | "empirical"; coverageOOS: number | null }>; label: EvidenceLabel | string; note?: string }
export interface StructureDoc {
  version: string; symbol: string; asOf: string; generatedAt: string;
  dataSource: { daily: { source: string; priceBasis: string; bars: number; warnings: string[] }; h1: { source?: string; bars?: number; sessions?: number; live?: boolean; unavailable?: string } };
  context: { week: StructureStage | null; day: StructureStage; h1: StructureStage | null };
  align: { verdict: StructureVerdict; rule: string; cell: string; sizeMult: number; text: string; rules: string[] };
  checklist: { buy: StructureCheck[]; sell: StructureCheck[]; buyScore: number; sellScore: number };
  scenarios: StructureScenario[];
  tfs: Partial<Record<StructureTfKey, StructureTf>>;
  annotations: StructureAnnotation[];
  timeline: { tf: StructureTfKey; segments: StructureSegment[] }[];
  dayContextOnH1: { stage: StructureStage | null; label: string | null; from: string; to: string }[] | null;
  narrative: string[];
  cone: StructureCone | null;
  probability: { value: number | null; baseRate: number | null; label: EvidenceLabel | string; horizon?: number; note?: string | null } | null;
  stageOdds: { stage: StructureStage; age: number; typical: { n: number; median: number; p75: number } | null; up: number | null; down: number | null; label: EvidenceLabel | string } | null;
  evidence: { prereg: string; status: string; verdicts: Record<string, string>; summary: string | null; coneNote?: string | null; labels: Record<"stageUp" | "alignment" | "checklist" | "patterns" | "stageDown", EvidenceLabel> };
}

export interface StructureSummaryRow {
  t: string; asOf: string; st: StructureStage; age: number; ws: StructureStage | null; dow: number; v: StructureVerdict; rule: string; sc: number; ss: number; chg: boolean;
  prev?: StructureStage | null; pat: { type: string; status: string; date: string } | null; sig: { code: string; date: string } | null;
  sup: number | null; res: number | null; trigL: number | null; trigS: number | null;
}
export interface StructureLedgerStats {
  target: number; updatedAt: string | null;
  coverage: Record<string, { sessions: number; forecasts: number; coverage: number | null; alpha: number | null; offset: number | null; through: string | null }>;
  verdicts: Record<string, { n: number; meanRet10: number | null; recentN: number }>;
}
export interface StructureTransition { t: string; from: StructureStage | null; to: StructureStage; v: StructureVerdict }
export interface StructureSummaryDoc {
  engine: string; generatedAt: string; asOf: string; evidence: StructureDoc["evidence"]["labels"]; rows: StructureSummaryRow[]; skipped: string[];
  transitions?: StructureTransition[]; ledger?: StructureLedgerStats | { error: string } | null;
}

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Gateway trả HTTP ${response.status}`);
  }
  return response.json();
};

/** Cấu trúc đa khung của một mã — làm mới 60 giây trong phiên (Gateway đệm 60 giây). */
export function useStructure(symbol: string | null) {
  const key = symbol ? marketUrl(`/api/market/structure/${encodeURIComponent(symbol.toUpperCase())}`) : null;
  const { data, error, isLoading } = useSWR<StructureDoc>(key, fetcher, { refreshInterval: 60_000, revalidateOnFocus: false, dedupingInterval: 30_000 });
  return { data, error: error as Error | undefined, isLoading };
}

/** Tóm tắt cấu trúc toàn universe (job 15:47) — Map theo mã. */
export function useStructureSummary(enabled = true) {
  const { data, error, isLoading } = useSWR<StructureSummaryDoc>(enabled ? marketUrl("/api/market/structure-summary") : null, fetcher,
    { refreshInterval: 10 * 60_000, revalidateOnFocus: false, dedupingInterval: 5 * 60_000 });
  const byTicker = new Map((data?.rows ?? []).map((r) => [r.t, r]));
  return { data, byTicker, error: error as Error | undefined, isLoading };
}

export const STAGE_SHORT: Record<StructureStage, string> = { A: "A · Tích lũy", UP: "Tăng", B: "B · Quá mua", C: "C · Suy yếu", D: "D · Phá vỡ", DOWN: "Giảm", Bp: "B′ · Hồi", RANGE: "Đi ngang" };
export const STAGE_TONE: Record<StructureStage, "bull" | "bear" | "warn" | "neutral"> = { A: "neutral", UP: "bull", B: "warn", C: "warn", D: "bear", DOWN: "bear", Bp: "warn", RANGE: "neutral" };
export const VERDICT_TONE: Record<StructureVerdict, "bull" | "bear" | "warn" | "neutral"> = { MUA: "bull", "CHỜ MUA": "neutral", "ĐỨNG NGOÀI": "neutral", "GIẢM TỶ TRỌNG": "warn", BÁN: "bear" };
