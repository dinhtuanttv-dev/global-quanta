// MTF v3 (30/10/2026) — đọc Gateway /api/market/structure3/:symbol: Ngày · Tuần · Tháng (không khung 1 giờ), MTF-v3-prereg.md.
import useSWR from "swr";
import { marketUrl } from "../services/marketDataClient";

export type Tf3 = "D" | "W" | "M";
export type RibbonPhase = "squeeze" | "expanding" | "extended" | "normal" | "na";
export interface RibbonSnapshot {
  tf: Tf3; date: string | null; bars: number;
  close: number | null; ema21: number | null; ema50: number | null; ema100: number | null; ma200: number | null;
  order: number | null; orderAge: number; width: number | null; widthPct: number | null; dev50: number | null; gap: number | null;
  slope: { e21: number | null; e50: number | null; e100: number | null; ma200: number | null };
  phase: RibbonPhase; over: number; lastExpand: { ago: number; dir: number } | null; inBand: boolean | null;
}
export interface RibbonContext { D: RibbonSnapshot; W: RibbonSnapshot; M: RibbonSnapshot; align: number; nested: "up" | "down" | null }
export interface RibbonLines { dates: string[]; ema21: (number | null)[]; ema50: (number | null)[]; ema100: (number | null)[]; ma200: (number | null)[] }
export type Stage4 = "S1" | "S2" | "S3" | "S4" | "NA";
export type DowState = "UP" | "UP_WEAK" | "BROKEN_UP" | "DOWN" | "DOWN_WEAK" | "BROKEN_DOWN" | "RANGE";
export type DowEvent = "CHOCH_UP" | "CHOCH_DOWN" | "BOS_UP" | "BOS_DOWN" | "BREAK_PROTECTED_LOW" | "BREAK_PULLBACK_HIGH";
export interface FrameSnapshot {
  tf: Tf3; date: string | null; dow: DowState; dowLabel: string;
  protectedLow: number | null; pullbackHigh: number | null; lastHigh: number | null; lastLow: number | null;
  lastEvent: { type: DowEvent; label: string; ago: number; date: string; close: number } | null;
  stage: Stage4; stageLabel: string; stageAge: number; templateScore: number; template: { key: string; ok: boolean | null; text: string }[];
}
export interface MtfTrigger { side: "L" | "S" | null; steps: { key: string; ok: boolean; text: string }[]; ago: number | null }
export interface Context3 { ribbon: RibbonContext; D: FrameSnapshot; W: FrameSnapshot; M: FrameSnapshot; trigger: MtfTrigger }
export interface FrameDraw {
  swings: { kind: "H" | "L"; date: string; price: number; confirmedDate: string }[];
  swingsMajor: { kind: "H" | "L"; date: string; price: number; confirmedDate: string }[];
  events: { date: string; type: DowEvent; label: string; close: number | null }[];
  segments: { stage: Stage4; from: string; to: string; bars: number }[];
}
export interface Structure3Doc {
  version: string; symbol: string; asOf: string; priceBasis: string | null;
  bars: Record<Tf3, number>;
  ribbon: { context: RibbonContext | null; lines: Record<Tf3, RibbonLines> };
  /** S2: Dow + giai đoạn + "chân dưới đổi theo chân trên". */
  structure?: { context: Context3 | null; frames: Record<Tf3, FrameDraw> };
  evidence: { label: string; note: string };
}

const fetcher = async (url: string): Promise<Structure3Doc> => {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error || `Gateway trả HTTP ${r.status}`);
  return r.json();
};

/** Cấu trúc MTF v3 của một mã — làm mới 60 giây trong phiên (Gateway đệm 60 giây). */
export function useStructure3(symbol: string | null) {
  const key = symbol ? marketUrl(`/api/market/structure3/${encodeURIComponent(symbol.toUpperCase())}`) : null;
  const { data, error, isLoading } = useSWR<Structure3Doc>(key, fetcher, { refreshInterval: 60_000, revalidateOnFocus: false, dedupingInterval: 30_000 });
  return { data, error: error as Error | undefined, isLoading };
}
