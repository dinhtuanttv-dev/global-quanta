// SEPA Minervini (SP4) — đọc kết quả quét của Gateway (/api/market/strategies/sepa, chiến lược "sepa", engine sepa/SP2).
import useSWR from "swr";
import { marketUrl } from "../services/marketDataClient";
import type { LiveTracking, TechnicalFilterCriteria } from "./useTechnicalFilter";

export type SepaList = "SẴN SÀNG MUA" | "CẢNH BÁO MUA" | "THEO DÕI" | "LOẠI";
export type SepaStatus = "FORMING" | "NEAR_PIVOT" | "BREAKOUT" | "EXTENDED" | "SQUAT" | "FAILED" | "NONE";
export const SEPA_LISTS: SepaList[] = ["SẴN SÀNG MUA", "CẢNH BÁO MUA", "THEO DÕI", "LOẠI"];

export interface SepaContraction { ngay_dinh: string; dinh: number; ngay_day: string; day: number }
export interface SepaPattern {
  name: string;
  detected: boolean;
  status: SepaStatus;
  pivot: number | null;
  baseStart: string | null;
  baseEnd: string | null;
  baseWeeks: number | null;
  depth: number | null;
  footprint: string;
  stopRef: number | null;
  score: number;
  /** Khóa giữ nguyên tên của gói Python (ví dụ VCP: cac_lan_thu_hep_pct, thu_hep_chi_tiet, KL_vung_pivot_x_TB50). */
  details: Record<string, unknown> & { thu_hep_chi_tiet?: SepaContraction[]; cac_lan_thu_hep_pct?: number[] };
  notes: string[];
  reasonsFailed: string[];
  breakout: Record<string, unknown> & { ngay_pha_vo?: string; KL_pha_vo_dat?: boolean; KL_pha_vo_x_TB50?: number | null; status?: SepaStatus };
}
export interface SepaPatternShort { name: string; detected: boolean; status: SepaStatus; score: number; footprint: string | null; pivot: number | null; reasonsFailed: string[] }
export interface SepaPlan {
  entry: number; stop: number; stopPct: number; structuralStop: number | null; stopTooWide: boolean;
  target2r: number; target3r: number; breakevenTrigger: number; shares: number; positionValue: number; positionPct: number;
  riskAmount: number; riskPctEquity: number; notes: string[];
}
export interface SepaBase { bat_dau: string; pha_vo: string | null; so_tuan: number; do_sau: number; dang_hinh_thanh?: boolean }
export interface SepaStage {
  stage: 0 | 1 | 2 | 3 | 4; label: string; confidence: number; evidence?: Record<string, unknown>;
  stage2Start?: string | null; baseCount: number; bases?: SepaBase[]; warnings: string[];
}
export interface SepaFundamentals {
  score: number; passedMin: boolean; flags: Record<string, boolean | number>; metrics: Record<string, unknown>;
  warnings: string[]; positives: string[]; latestQuarter?: string | null; quarters?: number; columns?: string[]; source?: string;
}
export interface SepaMetrics {
  score: number; close: number; rs: number | null; trendScore: number; stage: number; baseNo: number | null;
  pattern: string | null; footprint: string | null; pivot: number | null; stop: number | null; stopPct: number | null;
  fundScore: number; epsGrowthQ: number | null; revGrowthQ: number | null; code33: boolean; leadScore: number | null;
}
export interface SepaRow {
  ticker: string; name?: string | null; sector?: string | null; date: string;
  list: SepaList; status: SepaStatus | null; score: number; screensPassed: number; screens: Record<string, boolean>;
  metrics: SepaMetrics;
  trend: { passed: boolean; score: number; criteria: Record<string, boolean>; values?: Record<string, number | boolean | null> };
  warnings: string[];
  liquidity?: { price: number; avgValue20: number } | null;
  priceBasis?: string | null;
  // Chỉ có ở SẴN SÀNG MUA / CẢNH BÁO MUA / THEO DÕI (dòng LOẠI rút gọn)
  stageLabel?: string;
  components?: { trend: number; fund: number; rs: number; pattern: number; lead: number; penalty: number };
  stage?: SepaStage;
  fundamentals?: SepaFundamentals;
  lead?: Record<string, number | boolean | null>;
  pattern?: SepaPattern | null;
  patterns?: SepaPatternShort[];
  plan?: SepaPlan | null;
  monitor?: (Record<string, unknown> & { canh_bao?: string[]; cac_nhip_dieu_chinh?: { so_phien: number; do_sau: number; KL_x_TB50: number | null; da_lap_dinh_moi: boolean }[] }) | null;
  bars?: number;
}
export interface SepaMarketHealth {
  chi_so: number; tren_MA50: boolean; tren_MA200: boolean | null; dieu_chinh_tu_dinh_52t: number;
  ngay_phan_phoi_25_phien?: number; so_dinh_52t?: number; so_day_52t?: number; ty_le_dat_trend_template?: number;
  danh_gia: "THUẬN LỢI" | "TRUNG TÍNH" | "THẬN TRỌNG" | "BẤT LỢI"; goi_y_rui_ro: string; ghi_chu_RS?: string; hardMarket?: boolean;
}
export interface SepaStat { n: number; mean: number; ci?: [number, number] }
export interface SepaHypothesis {
  id: string; label: string; criterion?: string; verdict: "PASS" | "FAIL" | "DESCRIPTIVE"; caveat?: string;
  is?: SepaStat; oos?: SepaStat | Record<string, SepaStat | Record<string, number>>; all?: Record<string, unknown>; control?: SepaStat;
}
export interface SepaValidation { version: string; engine: string; period: { from: string; to: string; oosFrom: string; sessions: number }; rules: string; hypotheses: SepaHypothesis[] }
/** Tín hiệu S2 của kiểm định SP3: SẴN SÀNG MUA + phá vỡ với KL đạt chuẩn. */
export const isS2Signal = (r: SepaRow) => r.list === "SẴN SÀNG MUA" && r.status === "BREAKOUT" && Boolean(r.pattern?.breakout?.KL_pha_vo_dat);

export interface SepaDoc {
  strategy: "sepa"; engine: string; generatedAt: string; dataAsOf: string;
  universeCount: number; scannedCount: number; resultCount: number;
  results: SepaRow[];
  lists: Record<SepaList, number>;
  sectors: { nganh: string; mean: number; max: number; count: number; hang_nganh: number }[];
  market?: { indexAsOf: string | null; up: boolean | null; rule: string; sepa?: SepaMarketHealth };
  evidence?: { label: "PENDING" | "VALIDATED" | "EXPERIMENTAL"; reason: string; validation?: SepaValidation; signals?: { breakoutReady?: string } };
  equityRef: number;
  risk: { avgGain: number; maxStop: number; hardMarketStop: number; riskPerTrade: number; maxPositionPct: number; breakevenRMultiple: number; lot: number; note?: string };
  fundamentalsCoverage?: { withData: number; withInventory: number };
  criteria?: TechnicalFilterCriteria;
  liveTracking?: LiveTracking;
  skipped: { ticker: string; reason: string }[];
  disclaimer: string;
}

const fetcher = async (url: string): Promise<SepaDoc> => {
  const response = await fetch(url, { cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error ?? `Market API lỗi ${response.status}`);
  return body as SepaDoc;
};

export function useSepa() {
  const { data, error, isLoading, mutate } = useSWR<SepaDoc>(
    marketUrl("/api/market/strategies/sepa"),
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  return { data, error: error as Error | undefined, isLoading, refresh: mutate };
}
