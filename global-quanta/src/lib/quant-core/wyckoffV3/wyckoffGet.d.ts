// Khai báo kiểu cho wyckoffGet.js (Wyckoff v3) — chỉ phần quant-core dùng.
export interface WyCandle { time: string; open: number; high: number; low: number; close: number; volume: number }
export interface WyEvent {
  type: string; i: number; ci: number | null; time: string; price: number;
  volRel?: number; spreadRel?: number; note?: string; [k: string]: unknown;
}
export interface WyPoe { poe: 1 | 2 | 3; i: number; time: string; entry: number; stop: number; sizePct: number; note: string; side: "long" | "short"; structure?: string; kind?: string }
export interface WyFreshness { lastConfirmedIndex: number; barsSinceLastEvent: number; limit: number; away: "above" | "below" | null; stale: boolean; reasons: string[] }
export interface WyStructure {
  key: string; kind: string; direction: "long" | "short"; support: number; resistance: number; height: number;
  startI: number; endI: number; phase: string;
  status: string;
  variant: string; variantNote: string; events: WyEvent[]; poes: WyPoe[];
  checklist: Record<string, boolean | null> | null; checklistScore: number | null;
  spring: { type: string; low: number } | null; generic?: boolean; freshness: WyFreshness;
}
export interface WyAnalysis {
  error?: string;
  structures: WyStructure[]; active: WyStructure[]; current: WyStructure | null; signals: WyPoe[];
  alerts: { i: number; time: string; type: string; structure: string; note?: string }[];
  plan: { phase: string; direction: string; action: string; detail: string } | null;
  metrics: { atr: number[]; volRel: number[] };
}
export const DEFAULTS: Record<string, unknown>;
export function analyzeWyckoff(candles: WyCandle[], opts?: Record<string, unknown>): WyAnalysis;
export function timeframeAdvice(tf: string): { role: string; tradeable: boolean; note: string };
export function planForPhase(phase: string, direction?: string): { phase: string; direction: string; action: string; detail: string };
export function backtestPOE(candles: WyCandle[], opts?: Record<string, unknown>, bt?: Record<string, unknown>): {
  error?: string;
  trades: { t: number; signalIndex: number; poe: number; side: string; kind: string; hit: boolean; r: number; open: boolean; baseHitRate: number | null }[];
  summary: { n: number; hitRate: number | null; avgR: number | null; baseHitRate: number | null; lift: number | null; z: number | null };
};
