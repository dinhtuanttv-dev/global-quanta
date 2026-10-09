// AI Chart Vision v2 — đọc phân tích đa khung D/W/M của Gateway (/api/market/chart-vision/:symbol, engine chart-vision/V1).
// Tính từ nến thật (chuỗi giá điều chỉnh), quy tắc minh bạch, không gọi AI — xem backend/src/market/chartVision/chartVision.js.
import useSWR from "swr";
import { marketUrl } from "../services/marketDataClient";

export type CvTimeframe = "D" | "W" | "M";
export type CvBar = [date: string, open: number, high: number, low: number, close: number, volume: number];
export interface CvBias { key: "STRONG_UP" | "UP" | "NEUTRAL" | "DOWN" | "STRONG_DOWN"; label: string }
export interface CvPoint { date: string; price: number; type: "H" | "L" }
export interface CvLevel { price: number; lo: number; hi: number; touches: number; lastDate: string; firstDate: string }
export interface CvCheck { key: string; label: string; ok: boolean | null; value?: number | null }
export interface CvFrame {
  tf: CvTimeframe; label: string; bars: number; insufficient?: boolean; note?: string;
  date?: string; close?: number; changePct?: number; score: number; bias: CvBias;
  components?: { trend: number; momentum: number; structure: number; volume: number };
  trend?: { checks: CvCheck[]; mas: { n: number; value: number | null; distPct: number | null }[] };
  momentum?: {
    rsi: number | null; rsiZone: string | null;
    macd: { line: number; signal: number; hist: number; rising: boolean; cross: "UP" | "DOWN" | null } | null;
    adx: { value: number; pdi: number; mdi: number; strength: string } | null;
  };
  structure?: { kind: string; label: string; event: { kind: string; label: string } | null; highs: CvPoint[]; lows: CvPoint[]; pivots: CvPoint[] };
  levels?: { support: CvLevel[]; resistance: CvLevel[]; all: CvLevel[] };
  volume?: { upDownRatio: number; lastVsAvg20: number | null };
  atrPct?: number | null;
}
export interface CvPattern {
  timeframe: "D" | "W"; type: string; label: string; familyLabel: string; dir: "bull" | "bear"; state: string; stateLabel: string; score: number;
  startDate: string; endDate: string; breakoutDate: string | null; levelNow: number | null; distancePct: number | null;
  targets: number[]; checksOk: number; checksTotal: number; barWarn: string[];
  plan: { entry: number | null; stop: number | null; target: number | null; rr: number | null; rrOk: boolean | null } | null;
}
export interface CvScreenerHit { strategy: string; label: string; status: string | null; grade: string | null; side: string | null; score: number | null; date: string | null; evidence: string | null }
export interface CvSynthesis {
  score: number; bias: CvBias; alignment: { key: string; label: string }; thesis: string; support: string[]; conflict: string[];
  scenarios: { dir: "up" | "down"; label: string; then: string }[]; invalidation: number | null; conclusion: string;
  checklist: { label: string; passed: boolean; detail: string }[]; weights: Partial<Record<CvTimeframe, number>>;
}
export interface ChartVisionDoc {
  symbol: string; engine: string; dataAsOf: string; isIndex: boolean; priceBasis: string; warnings: string[];
  partial: { week: boolean; month: boolean };
  frames: CvFrame[]; patterns: CvPattern[]; screeners: CvScreenerHit[]; synthesis: CvSynthesis;
  method: { label: string; note: string };
  bars: Record<CvTimeframe, CvBar[]>;
  ma: Record<CvTimeframe, Record<string, (number | null)[]>>;
}

const fetcher = async (url: string): Promise<ChartVisionDoc> => {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `Gateway trả HTTP ${response.status}`);
  }
  return response.json();
};

export function useChartVision(symbol: string | null) {
  const key = symbol ? marketUrl(`/api/market/chart-vision/${encodeURIComponent(symbol.toUpperCase())}`) : null;
  const { data, error, isLoading, isValidating, mutate } = useSWR<ChartVisionDoc>(key, fetcher, { revalidateOnFocus: false, dedupingInterval: 60_000 });
  return { data, error: error as Error | undefined, isLoading, isValidating, refresh: mutate };
}

// ------------------------------------------------------------------ hình học mô hình giá Pring (bảng phụ Pattern Scanner v2)
export interface PringLine { name: string; i0: number; p0: number; i1: number; p1: number; d0: string; d1: string }
export interface PringPatternFull { type: string; label: string; dir: "bull" | "bear"; state: string; stateLabel: string; timeframe: "D" | "W"; lines: PringLine[]; points: { name: string; date: string; price: number }[]; targets: number[] }
export interface PatternDetailDoc { symbol: string; daily: PringPatternFull[]; weekly: PringPatternFull[] }

export function usePatternGeometry(symbol: string | null, enabled: boolean) {
  const key = symbol && enabled ? marketUrl(`/api/market/strategies/patterns/${encodeURIComponent(symbol.toUpperCase())}`) : null;
  const { data, error } = useSWR<PatternDetailDoc>(key, async (url: string) => {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }, { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 });
  return { data, error: error as Error | undefined };
}
