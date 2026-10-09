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
  /** Trọng số TƯƠNG ĐỐI giữa các kịch bản (softmax của điểm mô hình) — KHÔNG phải xác suất đã hiệu chỉnh. */
  weight?: number;
  degree?: string;
  degreeK?: number;
  pivotsAfter?: number;
  provisional?: ElliottPivot;
  wave4Type?: "triangle";
  /** Điều kiện của Elliott Oscillator theo sách (T-13…T-20). */
  checks: Partial<Record<"wave3Band" | "wave3Strongest" | "wave4Osc" | "wave5Divergence" | "insufficientOscData", { pass: boolean } & Record<string, number | boolean | undefined>>>;
  stats?: { w2: { bucket: string; pct: number | null }; w3: { bucket: string; pct: number | null }; w4: { bucket: string; pct: number | null } };
  channel?: { slope: number; anchors: { lower: ElliottPivot; upperW1: ElliottPivot; upperW3: ElliottPivot }; preferred: "upperW1" | "upperW3" | null };
  afterWave5?: { firstTarget: number };
  correction?: ElliottCorrection | null;
  alternation?: { ok: boolean | null; expected?: string; note?: string; wave2?: { family?: string; kind?: string }; wave4?: { family?: string; kind?: string } };
  nesting?: { score: number | null };
  features?: { logp: number; osc: number; nest: number; alt: number; vol?: number; time?: number };
  invalidation?: { price: number; side: "above" | "below"; reason: string; overlapLevel: number };
  volume?: { score: number | null; checks: Record<string, { pass: boolean }> };
  time?: { score: number | null; edge: number | null };
}

export interface ElliottCorrection {
  kind: "zigzag" | "flat" | "irregular" | "unconfirmed" | "invalid" | "triangle-B" | string;
  family?: "simple" | "complex" | "unknown" | string;
  bRatio?: number; cRatio?: number; lenA?: number; cBeyondA?: boolean;
  cTargets?: { ratio: number; price: number }[];
  /** Số sóng con của A (zigzag mịn): zigzag cần 5, flat/irregular cần 3 (T-27). */
  aWaves?: number | null;
  structureOk?: boolean | null;
  cDivergence?: { pass: boolean; oscA: number; oscC: number; note: string } | null;
  triangle?: { valid: boolean; points: ElliottPivot[] };
  thrust?: { direction: "up" | "down"; note: string };
}

export interface ElliottAnalysis {
  options: Record<string, unknown>;
  pivots: ElliottPivot[];
  best: ElliottScenario | null;
  scenarios: ElliottScenario[];
  confluence: { price: number; weight: number; count: number; sources: string[]; degrees: string[]; low: number; high: number }[];
  osc?: number[];
  bands?: { up: number[]; lo: number[] };
  signals?: { type: string; dir?: "up" | "down"; gaps?: number; oscAboveBand?: boolean; note?: string; targets?: { ratio: number; price: number }[]; wave4Zones?: { ratio: number; price: number }[] }[];
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
    /** Bảng tỷ lệ sóng 2/3/4 thay cho STAT_TABLES của sách (vd. ELLIOTT_VN_TABLES). */
    statTables?: Record<"w2" | "w3" | "w4", { max: number; p: number | null }[]>;
  };
}

export function analyzeFull(candles: ElliottCandle[], options?: ElliottOptions): ElliottAnalysis;
export function zigzag(candles: ElliottCandle[], options?: { pct?: number; atrPeriod?: number; atrMult?: number }): ElliottPivot[];
export function invalidationOf(sc: ElliottScenario): { price: number; side: "above" | "below"; reason: string; overlapLevel: number };
export function wave4Zones(p2: number, p3: number): { ratio: number; price: number }[];
export function classifyABC(
  start: { price: number }, A: { price: number }, B: { price: number }, C: { price: number } | null, s: 1 | -1, o?: { flatTol?: number },
): { kind: string; family?: string; bRatio?: number; cRatio?: number; cTargets?: { ratio: number; price: number }[] };

export const DEFAULTS: { fast: number; slow: number; zigzag: { pct: number; atrPeriod: number; atrMult: number }; fineFactor: number; bands: { pct: number; lookback: number }; osc: { minPullback: number; maxOpposite: number; bandMargin: number } } & Record<string, unknown>;
export function elliottOscillator(candles: ElliottCandle[], fast?: number, slow?: number): number[];
export function breakoutBands(osc: number[], options?: { pct?: number; lookback?: number }): { up: number[]; lo: number[] };
export function subwaveCount(candles: ElliottCandle[], pa: ElliottPivot, pb: ElliottPivot, o: typeof DEFAULTS): number | null;
export function analyzeCorrection(candles: ElliottCandle[], osc: number[], pivots: ElliottPivot[], k5: number, s: 1 | -1, o: typeof DEFAULTS): ElliottCorrection | null;
export function channelValue(ch: NonNullable<ElliottScenario["channel"]>, name: "lower" | "upperW1" | "upperW3", i: number): number;
export function statWave2(r: number): { bucket: string; pct: number | null };
export function detectTriangle(t: ElliottPivot[]): { valid: boolean; points?: ElliottPivot[] };
export function evaluateImpulse(candles: ElliottCandle[], osc: number[], bands: { up: number[]; lo: number[] }, pts: ElliottPivot[], o: typeof DEFAULTS): ElliottScenario;
export function analyze(candles: ElliottCandle[], options?: ElliottOptions): { osc: number[]; bands: { up: number[]; lo: number[] }; pivots: ElliottPivot[]; best: ElliottScenario | null; correction: ElliottCorrection | null; impulses: ElliottScenario[] };

export type ElliottStatTable = { max: number; p: number | null }[];
/** Bảng tỷ lệ sóng của sách GET (T-37, T-38, T-40). */
export const STAT_TABLES: Record<"w2" | "w3" | "w4", ElliottStatTable>;
export function probOf(table: ElliottStatTable, r: number, nullP?: number, floor?: number): number;
