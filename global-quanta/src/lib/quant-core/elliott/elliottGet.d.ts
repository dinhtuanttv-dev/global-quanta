export interface ElliottCandle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ElliottPivot {
  i: number;
  time: string;
  type: "H" | "L";
  price: number;
  confirmed: boolean;
  /** Chỉ số nến tại đó pivot được xác nhận (null = pivot cuối chưa xác nhận). */
  ci: number | null;
}

export interface ElliottScenario {
  dir: "up" | "down";
  status: "complete" | "wave5-forming";
  points: ElliottPivot[];
  valid: boolean;
  violations: string[];
  ratios: {
    w2: number;
    w3: number;
    w4: number;
    w5OverW1?: number;
    w5Over03?: number;
  };
  targets: {
    wave5: {
      mode: string;
      levels: { ratio: number; price: number }[];
      window03: { low: number; high: number };
    };
  };
  score: number;
  weight?: number;
  volume?: { score: number | null; checks: Record<string, { pass: boolean }> };
  time?: { score: number | null; edge: number | null };
}

export interface ElliottAnalysis {
  options: Record<string, unknown>;
  pivots: ElliottPivot[];
  best: ElliottScenario | null;
  scenarios: ElliottScenario[];
  confluence: { price: number; weight: number; count: number; sources: string[]; degrees: string[] }[];
  hasVolume: boolean;
}

export interface ElliottOptions {
  zigzag?: { pct?: number; atrPeriod?: number; atrMult?: number };
  maxPivotsBack?: number;
  requireNewExtreme5?: boolean;
  market?: "cash" | "futures";
  pro?: {
    degrees?: { name: string; k: number }[];
    topN?: number;
    maxPivotsAfter?: number;
    projectBars?: number;
    temperature?: number;
  };
}

export function analyzeFull(candles: ElliottCandle[], options?: ElliottOptions): ElliottAnalysis;
export function zigzag(candles: ElliottCandle[], options?: { pct?: number; atrPeriod?: number; atrMult?: number }): ElliottPivot[];
export function invalidationOf(sc: ElliottScenario): { price: number; side: "above" | "below"; reason: string; overlapLevel: number };
export function wave4Zones(p2: number, p3: number): { ratio: number; price: number }[];
export function classifyABC(
  start: { price: number }, A: { price: number }, B: { price: number }, C: { price: number } | null, s: 1 | -1, o?: { flatTol?: number },
): { kind: string; family?: string; bRatio?: number; cRatio?: number; cTargets?: { ratio: number; price: number }[] };
