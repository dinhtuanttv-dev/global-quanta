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
export type StructurePatternContext = "reversal" | "reaccum" | "countertrend";
export interface StructurePattern {
  type: "W" | "M" | "IHS" | "HS"; name: string; dir: 1 | -1; status: "forming" | "confirmed" | "failed";
  /** v2: vị trí trên cẳng sóng (đảo chiều / tái tích lũy / ngược xu hướng) + "thành công" (giá sang hẳn phía kia MA, MA đổi hướng). */
  context?: StructurePatternContext; contextLabel?: string; contextText?: string; followDate?: string | null;
  points: { date: string; price: number; label: string }[]; neck: { d0: string; p0: number; d1: string; p1: number };
  confirmedDate: string; breakDate: string | null; failDate: string | null; target: number; height: number;
}
/** R:R "nếu mua ở giá hiện tại" theo tài liệu: cắt lỗ = đáy sóng nhỏ gần nhất − 0,2 ATR; mục tiêu = đỉnh sóng lớn phía trên (không có: 3R). */
export interface StructureRrNow { entry: number; stop: number; target: number; targetBasis: "swing4h" | "3R"; rr: number; ok: boolean }
export interface StructureTf {
  tf: StructureTfKey; asOf: string; close: number; stage: StructureStage; stageLabel: string; stageText: string; stageAge: number; dow: number;
  /** v2: cờ quá đà (+1 lệch ≥ 3 ATR trên MA đang lên, −1 ngược lại); MA bối cảnh (khung 1 giờ: MA ngày = 100 tiết). */
  ext?: number; rrNow?: StructureRrNow | null;
  ma: { fast: number; slow: number; ctx?: number | null; fastValue: number | null; slowValue: number | null; ctxValue?: number | null }; dev: number | null; slope: number | null; spread: number | null; atr: number | null;
  segments: StructureSegment[]; zones: StructureZone[];
  base: { from: string; to: string; lo: number; hi: number; bars: number; rangeAtr: number; contractions: number; tight: boolean; positionPct: number; bbwPct: number | null; maConverged: boolean } | null;
  patterns: StructurePattern[];
  signals: { date: string; code: string; side: "MUA" | "BÁN"; price: number; note: string }[];
  swings: { date: string; kind: "H" | "L"; price: number; confirmedDate: string }[];
  /** v2: sóng "mức 4 giờ" (sóng lớn, 4 ATR). */
  swingsLarge?: { date: string; kind: "H" | "L"; price: number; confirmedDate: string }[];
  checklistBuy: StructureCheck[]; checklistSell: StructureCheck[];
  maSeries?: { dates: string[]; fast: (number | null)[] | null; slow: (number | null)[] | null; ctx: (number | null)[] | null };
}
export interface StructureStat { n: number; mean?: number | null; ci?: [number, number] | null; p?: number | null; hit?: number | null }
export interface StructureStatPair { IS: StructureStat; OOS: StructureStat }
export interface StructureHistory {
  tests: Record<"V1" | "V2" | "V3" | "V4" | "V5", StructureStatPair & { placebo?: { realMean: number; p: number } | null }>;
  stageTable: Record<StructureStage, StructureStatPair> | null;
  ext: { on: StructureStatPair; off: StructureStatPair; note?: string } | null;
  patternContext: { reaccum: StructureStatPair; reversal: StructureStatPair } | null;
  v1ByDayStage: { aligned: StructureStatPair; other: StructureStatPair } | null;
}
export type StructureEvidenceKey = "alignment" | "rrGate" | "entryDaily" | "stageB" | "sellSignal" | "checklist" | "patterns" | "stageUp" | "stageDown";
export interface StructureScenario { side: "L" | "S"; title: string; trigger: number; entry: number; stop: number; targets: number[]; rr: number | null; targetBasis: "zones" | "R-multiple"; text: string }
export interface StructureAnnotation { tf: StructureTfKey; kind: "stage" | "pattern" | "signal" | "swing"; date: string; price: number; text: string; detail: string; tone: "bull" | "bear" | "neutral" | "warn" }
export interface StructureCone { horizons: Record<string, { p10: number; p50: number; p90: number; kind: "cqr" | "empirical"; coverageOOS: number | null }>; label: EvidenceLabel | string; note?: string }
export interface StructureDoc {
  version: string; symbol: string; asOf: string; generatedAt: string;
  dataSource: { daily: { source: string; priceBasis: string; bars: number; warnings: string[] }; h1: { source?: string; bars?: number; sessions?: number; live?: boolean; unavailable?: string } };
  context: { week: StructureStage | null; day: StructureStage; h1: StructureStage | null };
  ext?: { day: number; entry: number }; rrNow?: StructureRrNow | null;
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
  stageOdds: { stage: StructureStage; age: number; typical: { n: number; median: number; p75: number } | null; up: number | null; down: number | null; horizon?: number; label: EvidenceLabel | string } | null;
  evidence: {
    prereg: string; status: string; verdicts: Record<string, string>; summary: string | null; coneNote?: string | null;
    labels: Partial<Record<StructureEvidenceKey, EvidenceLabel>>;
    engine?: string | null; ranAt?: string | null; period?: { from: string; to: string; isTo: string; oosFrom: string; h1IsFrom?: string; symbolsDaily: number; symbolsH1: number } | null;
    /** MTF-v2-prereg: chữ MUA / BÁN chỉ dùng khi V1–V3 có ít nhất một ĐẠT. */
    verdictValidated?: boolean;
    history?: StructureHistory | null;
    previous?: { prereg: string; engine: string; ranAt: string; verdicts: Record<string, string> } | null;
  };
}

export interface StructureSummaryRow {
  t: string; asOf: string; st: StructureStage; age: number; ws: StructureStage | null; dow: number; v: StructureVerdict; rule: string; sc: number; ss: number; chg: boolean;
  prev?: StructureStage | null; pat: { type: string; status: string; date: string; ctx?: StructurePatternContext } | null; sig: { code: string; date: string } | null;
  sup: number | null; res: number | null; trigL: number | null; trigS: number | null;
  /** v2: giai đoạn khung 1 giờ (rổ VN100 có kho nến 1 giờ), cờ quá đà khung ngày, R:R tại giá hiện tại. */
  hs?: StructureStage | null; ext?: number; rr?: { v: number | null; ok: boolean } | null;
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
  engine: string; generatedAt: string; asOf: string; evidence: StructureDoc["evidence"]["labels"]; verdictValidated?: boolean; rows: StructureSummaryRow[]; skipped: string[];
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

// v2 (24/10/2026, theo tài liệu gốc): B = TÁI TÍCH LŨY (điều chỉnh về MA chân trên trong xu hướng tăng), không còn "quá mua".
export const STAGE_SHORT: Record<StructureStage, string> = { A: "MỘT · Đáy", UP: "Tăng", B: "B · Tái tích lũy", C: "C · Phân phối", D: "D · Đảo chiều", DOWN: "Giảm", Bp: "B′ · Hồi", RANGE: "Củng cố" };
export const STAGE_TONE: Record<StructureStage, "bull" | "bear" | "warn" | "neutral"> = { A: "bull", UP: "bull", B: "bull", C: "warn", D: "bear", DOWN: "bear", Bp: "warn", RANGE: "neutral" };
export const VERDICT_TONE: Record<StructureVerdict, "bull" | "bear" | "warn" | "neutral"> = { MUA: "bull", "CHỜ MUA": "neutral", "ĐỨNG NGOÀI": "neutral", "GIẢM TỶ TRỌNG": "warn", BÁN: "bear" };
/** Lời MÔ TẢ thay chữ MUA / BÁN khi kiểm định đặt trước chưa đạt (MTF-v2-prereg.md). */
export const VERDICT_DESCRIPTIVE: Record<StructureVerdict, string> = {
  MUA: "Cấu trúc thuận tăng", "CHỜ MUA": "Chờ tín hiệu tăng", "ĐỨNG NGOÀI": "Trung tính", "GIẢM TỶ TRỌNG": "Cấu trúc suy yếu", BÁN: "Cấu trúc giảm",
};
export const verdictText = (v: StructureVerdict, validated: boolean | undefined) => (validated ? v : VERDICT_DESCRIPTIVE[v]);
