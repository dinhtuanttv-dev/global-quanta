// pa-book-2 (26/11/2026): tham số theo sách "Price Action – Hành động giá chuyên sâu" Tập 2–3. Định nghĩa mẫu hình ghi ở
// candlePatterns.ts; các ngưỡng số là định nghĩa vận hành (sách mô tả bằng lời), có version và hash, không tối ưu trên dữ liệu.
export interface PAParams {
  atrPeriod: number;
  trendBar: {
    minBodyRange: number;
    minRangeAtr: number;
    bullCloseLoc: number;
    bearCloseLoc: number;
  };
  /** Sách: đuôi dài chiếm "phần lớn chiều dài nến", đuôi còn lại "gần thân". Thân bằng 0 vẫn là pin bar. */
  pinBar: {
    minDominantWickRange: number;
    maxOppositeWickRange: number;
    minRangeAtr: number;
  };
  /** Đảo chiều 2 thanh: "2 cây nến mạnh, đuôi ngắn" -> thân ≥ tỷ lệ này của biên độ. 3 nến hồi: "nến nhỏ" -> biên độ < x ATR. */
  bars: { strongBodyRange: number; smallRangeAtr: number };
  zone: {
    atrTolerance: number;
    minTouches: number;
    /** Vùng hết hiệu lực khi không được chạm lại trong ngần này phiên (tính từ lần chạm / xác nhận gần nhất). */
    maxAgeBars: number;
    rejectionCloseLoc: number;
  };
  swing: { left: number; right: number };
  setup: {
    maxAgeBars: number;
    breakoutBufferTicks: number;
    /** Sách: "nếu khoảng cách tới kháng cự chia cho khoảng cách tới stop không đạt 2:1 hoặc 1.5:1 thì bỏ qua". */
    minRewardRisk: number;
  };
  /** Sách: "volume phải đồng thuận với xu hướng"; "breakout thật thường đi kèm volume tăng vọt". */
  volume: { lookback: number; breakoutRvol: number; trendRatioMin: number };
}

export const DEFAULT_PA_PARAMS: Readonly<PAParams> = Object.freeze({
  atrPeriod: 14,
  trendBar: Object.freeze({ minBodyRange: 0.6, minRangeAtr: 1, bullCloseLoc: 0.75, bearCloseLoc: 0.25 }),
  pinBar: Object.freeze({ minDominantWickRange: 0.6, maxOppositeWickRange: 0.15, minRangeAtr: 0.5 }),
  bars: Object.freeze({ strongBodyRange: 0.5, smallRangeAtr: 1 }),
  zone: Object.freeze({ atrTolerance: 0.25, minTouches: 2, maxAgeBars: 120, rejectionCloseLoc: 0.65 }),
  swing: Object.freeze({ left: 5, right: 5 }),
  setup: Object.freeze({ maxAgeBars: 5, breakoutBufferTicks: 1, minRewardRisk: 1.5 }),
  volume: Object.freeze({ lookback: 20, breakoutRvol: 1.5, trendRatioMin: 1 }),
});

export type PAParamsOverrides = { [K in keyof PAParams]?: PAParams[K] extends object ? Partial<PAParams[K]> : PAParams[K] };

export function mergeParams(overrides: PAParamsOverrides = {}): PAParams {
  return {
    atrPeriod: overrides.atrPeriod ?? DEFAULT_PA_PARAMS.atrPeriod,
    trendBar: { ...DEFAULT_PA_PARAMS.trendBar, ...overrides.trendBar },
    pinBar: { ...DEFAULT_PA_PARAMS.pinBar, ...overrides.pinBar },
    bars: { ...DEFAULT_PA_PARAMS.bars, ...overrides.bars },
    zone: { ...DEFAULT_PA_PARAMS.zone, ...overrides.zone },
    swing: { ...DEFAULT_PA_PARAMS.swing, ...overrides.swing },
    setup: { ...DEFAULT_PA_PARAMS.setup, ...overrides.setup },
    volume: { ...DEFAULT_PA_PARAMS.volume, ...overrides.volume },
  };
}

export function validateParams(p: PAParams): string[] {
  const errors: string[] = [];
  const group = (name: string, o: object) => Object.entries(o).map(([k, v]) => [`${name}.${k}`, v as number] as [string, number]);
  const all: [string, number][] = [["atrPeriod", p.atrPeriod], ...group("trendBar", p.trendBar), ...group("pinBar", p.pinBar), ...group("bars", p.bars),
    ...group("zone", p.zone), ...group("swing", p.swing), ...group("setup", p.setup), ...group("volume", p.volume)];
  for (const [name, value] of all) if (!Number.isFinite(value)) errors.push(`${name} must be finite`);
  const posInt: [string, number][] = [["atrPeriod", p.atrPeriod], ["swing.left", p.swing.left], ["swing.right", p.swing.right],
    ["zone.maxAgeBars", p.zone.maxAgeBars], ["setup.maxAgeBars", p.setup.maxAgeBars], ["volume.lookback", p.volume.lookback]];
  for (const [name, value] of posInt) if (!Number.isInteger(value) || value < 1) errors.push(`${name} must be a positive integer`);
  if (!Number.isInteger(p.zone.minTouches) || p.zone.minTouches < 2) errors.push("zone.minTouches must be an integer >= 2");
  if (!Number.isInteger(p.setup.breakoutBufferTicks) || p.setup.breakoutBufferTicks < 0) errors.push("setup.breakoutBufferTicks must be a non-negative integer");
  const unit: [string, number][] = [["trendBar.minBodyRange", p.trendBar.minBodyRange], ["trendBar.bullCloseLoc", p.trendBar.bullCloseLoc],
    ["trendBar.bearCloseLoc", p.trendBar.bearCloseLoc], ["pinBar.minDominantWickRange", p.pinBar.minDominantWickRange],
    ["pinBar.maxOppositeWickRange", p.pinBar.maxOppositeWickRange], ["bars.strongBodyRange", p.bars.strongBodyRange], ["zone.rejectionCloseLoc", p.zone.rejectionCloseLoc]];
  for (const [name, value] of unit) if (value < 0 || value > 1) errors.push(`${name} must be in [0, 1]`);
  if (p.pinBar.minDominantWickRange + p.pinBar.maxOppositeWickRange > 1) errors.push("pinBar wick ratios must sum to <= 1");
  for (const [name, value] of [["zone.atrTolerance", p.zone.atrTolerance], ["trendBar.minRangeAtr", p.trendBar.minRangeAtr],
    ["bars.smallRangeAtr", p.bars.smallRangeAtr], ["volume.breakoutRvol", p.volume.breakoutRvol]] as [string, number][]) {
    if (!(value > 0)) errors.push(`${name} must be > 0`);
  }
  if (p.pinBar.minRangeAtr < 0) errors.push("pinBar.minRangeAtr must be >= 0");
  if (p.setup.minRewardRisk < 0) errors.push("setup.minRewardRisk must be >= 0");
  if (p.volume.trendRatioMin < 0) errors.push("volume.trendRatioMin must be >= 0");
  return errors;
}

export function stableParamsHash(params: PAParams): string {
  // mergeParams constructs every nested object in stable declaration order.
  const canonical = JSON.stringify(params);
  // FNV-1a 32-bit: stable cache/version key, not a cryptographic digest.
  let hash = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
