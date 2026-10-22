import { getMarketGateway } from "../config/marketGateway";
import useSWR from "swr";
import { isMarketGatewayEnabled, marketUrl } from "../services/marketDataClient";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "https://tuan-quant-scanner-psi.vercel.app";
const fetcher = (url: string) => fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Loi ${r.status}`);
  return r.json();
});

export interface SieuQuetIndexState {
  asOf: string;
  ma20: number; ma50: number; ma200: number;
  maAlignmentScore: number;
  trendBias: string; trendLabel: string;
  rsi14: number; macdHistogram: number;
  marketBreadthPct: number; divergence: string;
  atr14: number; atrPercentile: number; breakoutProbability: number;
  impulseScore: number;
  narrative: string;
}

export interface SieuQuetStockItem {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  price: number | null;
  changePct: number | null;
  faScore: number | null;
  taScore: number | null;
  eventImpactScore: number | null;
  smartScore: number | null;
  rsRating: number | null;
  riskAdjustedMomentum: number | null;
  riskRewardRatio: number | null;
  trendTag: string | null;
  qualityTag: string | null;
  confluenceStatusCode: string | null;
  confluenceStatusLabel: string | null;
  confluenceBoost: number | null;
  confluenceReasonCodes: string[];
  breakoutBoostBadge: boolean;
  piotroskiFScore: number | null;
  fScoreMax: number;
  /** v2: false = ngân hàng / chứng khoán / bảo hiểm (F-Score không áp dụng); reason INSUFFICIENT = thiếu BCTC. */
  fScoreApplicable?: boolean;
  fScoreReason?: "FINANCIAL" | "INSUFFICIENT" | "NO_DATA" | null;
  /** v2: R/R từ vùng hỗ trợ / kháng cự của engine cấu trúc (khung ngày). */
  riskRewardBasis?: { source: string; support: number; resistance: number; asOf: string } | null;
  faBasis?: "PEER" | "UNIVERSE" | "MIXED" | null;
  faPeriod?: string | null;
  peerGroup?: string | null;
  foreignNetBuyFlag: boolean;
  computedAt: string;
  /** Phiên dữ liệu dùng để tính (engine Gateway). */
  dataAsOf?: string;
  /** Phân ngành 2 cấp (Gateway): Ngành và Nhóm ngành thống nhất tiếng Việt. */
  industry?: string | null;
  sectorGroup?: string | null;
  /** Danh mục tự chọn: false = mã ngoài universe, được chấm theo bối cảnh của lần quét. */
  inUniverse?: boolean;
}

export type ScannerSource = "gateway" | "projectA";

/** Nguồn bảng quét: engine trên Gateway (SSI, mặc định) hoặc projectA (VITE_SCANNER_SOURCE=projectA / Gateway tắt). */
export function scannerSource(): ScannerSource {
  return isMarketGatewayEnabled() ? getMarketGateway().scannerSource : "projectA";
}

/** Kết quả kiểm định đặt trước Smart Score (SQ-prereg.md) — Gateway gửi kèm bảng quét. */
export interface IcStat { mean: number | null; lo: number | null; hi: number | null; dates: number }
export interface ScannerValidation {
  prereg: string; status: "DONE" | "PENDING"; ranAt?: string; primaryHorizon?: number; isEnd?: string;
  sample?: { dates: number; from: string | null; to: string | null; symbols: number; avgNames: number };
  verdicts: Record<string, "PASS" | "FAIL" | "INSUFFICIENT">;
  ic?: Record<string, Record<string, { is: IcStat; oos: IcStat }>>;
}

interface ScannerResponse {
  generatedAt: string; dataAsOf?: string; source?: string; engine?: string;
  indexState: SieuQuetIndexState | null; items: SieuQuetStockItem[]; totalCount: number;
  meta?: { universeSize?: number; universeBuiltAt?: string; skipped?: unknown[]; priceBasis?: Record<string, number> };
  validation?: ScannerValidation;
}

/**
 * Gateway chưa có kết quả (VD ngày đầu triển khai) -> tự dùng Project A để bảng
 * không trống; UI hiển thị rõ nguồn đang dùng.
 */
async function fetchScanner(): Promise<ScannerResponse & { usedSource: ScannerSource }> {
  if (scannerSource() === "gateway") {
    try {
      const res = await fetch(marketUrl("/api/market/scanner"), { cache: "no-store" });
      if (res.ok) return { ...(await res.json()), usedSource: "gateway" };
    } catch {
      /* rơi xuống Project A */
    }
  }
  return { ...(await fetcher(`${API_BASE}/api/sieu-quet-ai/scanner`)), usedSource: "projectA" };
}

// SIEU QUET AI - doc du lieu THAT (Confluence Engine + Scoring, da port
// tu Python + nuoi bang VN-Index that/Yahoo/VCI) tu Database, cap nhat
// dinh ky boi Cron Job sieu-quet-scan (1 lan/ngay).
export function useSieuQuetScanner() {
  const { data, error, isLoading, mutate } = useSWR(["sieu-quet-scanner", scannerSource()], fetchScanner, {
    refreshInterval: 30 * 60 * 1000,
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60 * 1000,
  });

  return {
    indexState: data?.indexState ?? null,
    items: data?.items ?? [],
    generatedAt: data?.generatedAt ?? null,
    dataAsOf: data?.dataAsOf ?? null,
    usedSource: data?.usedSource ?? null,
    universeSize: data?.meta?.universeSize ?? null,
    validation: data?.validation ?? null,
    engine: data?.engine ?? null,
    priceBasis: data?.meta?.priceBasis ?? null,
    isLoading, error, refresh: mutate,
  };
}
