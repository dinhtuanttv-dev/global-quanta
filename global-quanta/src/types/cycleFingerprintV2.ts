/**
 * Cycle Fingerprint v2 (CF4) — Gateway GET /api/market/cycles/:symbol và /api/market/cycles-ledger.
 * Engine CF2: 30 giai đoạn tương tự trong thư viện TOÀN universe theo thời điểm; dự báo lợi suất VƯỢT VN-Index.
 * Bằng chứng: kiểm định đặt trước CF3 (evidence) — hiện KHÔNG ĐẠT -> EXPERIMENTAL.
 */
export interface CycleV2Neighbor {
  ticker: string;
  sector: string | null;
  sameSector: boolean;
  start: string | null;
  end: string | null;
  /** độ tương đồng tuyệt đối 0..1 = tỷ lệ cặp cửa sổ ngẫu nhiên có khoảng cách lớn hơn */
  similarity: number | null;
  distance: number | null;
  weight: number | null;
  /** lợi suất vượt VN-Index (%) sau giai đoạn, từ đóng cửa phiên kế tiếp */
  excess: { d10: number | null; d20: number | null; d40: number | null; d60: number | null };
  /** đường giá giai đoạn, base 100 tại phiên đầu (30 điểm) */
  pattern: number[];
  /** diễn biến sau giai đoạn, base 100 tại phiên cuối giai đoạn (≤ 61 điểm) */
  forward: number[];
}

export interface CycleV2Horizon { h: number; excessPct: number | null; rawPct: number | null; baselinePct: number | null; pOutperform: number | null }

export interface CycleV2Check { id: number; name: string; pass: boolean }
export interface CycleV2Boot { n: number; mean: number | null; lo: number | null; hi: number | null; pOneSided?: number | null }

export interface CycleV2Evidence {
  version: string;
  prereg: string;
  ranAt: string;
  configSha256: string;
  label: 'EXPERIMENTAL' | 'ĐÃ KIỂM ĐỊNH' | string;
  verdict: 'PASS' | 'FAIL' | string;
  period: { is: [string, string]; oos: [string, string]; oosDates: number; oosTickers: number; oosRows: number };
  rules: string;
  checks: CycleV2Check[];
  oos: { ic: CycleV2Boot; icMinusPlacebo: CycleV2Boot; placeboIc: CycleV2Boot; brierSkill: number | null; quintileSpreadNet: CycleV2Boot; coverage80: number | null; avgNEff: number | null };
  is: { ic: CycleV2Boot; brierSkill: number | null; coverage80: number | null };
  coverage: { value: number | null; band: [number, number]; ok: boolean };
  reason: string;
}

export interface CycleV2Ledger {
  engine: string;
  dataAsOf: string;
  horizon: number;
  snapshots: number;
  firstDate: string | null;
  lastDate: string | null;
  maturedDates: number;
  scoredRows: number;
  pendingRows: number;
  meanIc: number | null;
  positiveIcShare: number | null;
  hitRate: number | null;
  brier: number | null;
  coverage80: number | null;
  meanSpreadNet: number | null;
  recent: { date: string; n: number; ic: number | null; spread: number | null }[];
  mine: { date: string; excessPct: number | null; pOutperform: number | null; realizedPct: number | null }[];
}

export interface CycleV2Response {
  engine: string;
  builtAt: string;
  dataAsOf: string;
  config: { sha256: string; lambda: number; hMult: number; W: number };
  evidence: CycleV2Evidence;
  ledger: CycleV2Ledger | null;
  symbol: string;
  sector: string | null;
  asOf: string;
  window: number;
  inLibrary: boolean;
  current: { dates: string[]; closes: number[]; pattern: number[] };
  neighbors: CycleV2Neighbor[];
  forecast: {
    horizons: CycleV2Horizon[];
    nEff: number | null;
    shrink: number | null;
    avgSimilarity: number | null;
    sameSectorShare: number | null;
    interval80: { h: number; loPct: number | null; hiPct: number | null; calibrated: boolean; oosCoverage: number | null };
  };
  library: { windows: number; tickers: number };
}
