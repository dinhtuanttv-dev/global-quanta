export interface PAParams {
  atrPeriod: number;
  trendBar: {
    minBodyRange: number;
    minRangeAtr: number;
    bullCloseLoc: number;
    bearCloseLoc: number;
  };
  pinBar: {
    minDominantWickBody: number;
    maxOppositeWickBody: number;
    maxBodyRange: number;
    bullCloseLoc: number;
    bearCloseLoc: number;
  };
  reversal: { requirePriorExtreme: boolean };
  zone: {
    atrTolerance: number;
    minTouches: number;
    maxAgeBars: number;
    rejectionCloseLoc: number;
  };
  swing: { left: number; right: number };
  setup: { maxAgeBars: number; breakoutBufferTicks: number };
}

export const DEFAULT_PA_PARAMS: Readonly<PAParams> = Object.freeze({
  atrPeriod: 14,
  trendBar: Object.freeze({
    minBodyRange: 0.6,
    minRangeAtr: 1,
    bullCloseLoc: 0.75,
    bearCloseLoc: 0.25,
  }),
  pinBar: Object.freeze({
    minDominantWickBody: 2,
    maxOppositeWickBody: 1,
    maxBodyRange: 0.35,
    bullCloseLoc: 0.65,
    bearCloseLoc: 0.35,
  }),
  reversal: Object.freeze({ requirePriorExtreme: false }),
  zone: Object.freeze({
    atrTolerance: 0.25,
    minTouches: 2,
    maxAgeBars: 120,
    rejectionCloseLoc: 0.65,
  }),
  swing: Object.freeze({ left: 5, right: 5 }),
  setup: Object.freeze({ maxAgeBars: 5, breakoutBufferTicks: 1 }),
});

export type PAParamsOverrides = {
  atrPeriod?: number;
  trendBar?: Partial<PAParams["trendBar"]>;
  pinBar?: Partial<PAParams["pinBar"]>;
  reversal?: Partial<PAParams["reversal"]>;
  zone?: Partial<PAParams["zone"]>;
  swing?: Partial<PAParams["swing"]>;
  setup?: Partial<PAParams["setup"]>;
};

export function mergeParams(overrides: PAParamsOverrides = {}): PAParams {
  return {
    atrPeriod: overrides.atrPeriod ?? DEFAULT_PA_PARAMS.atrPeriod,
    trendBar: { ...DEFAULT_PA_PARAMS.trendBar, ...overrides.trendBar },
    pinBar: { ...DEFAULT_PA_PARAMS.pinBar, ...overrides.pinBar },
    reversal: { ...DEFAULT_PA_PARAMS.reversal, ...overrides.reversal },
    zone: { ...DEFAULT_PA_PARAMS.zone, ...overrides.zone },
    swing: { ...DEFAULT_PA_PARAMS.swing, ...overrides.swing },
    setup: { ...DEFAULT_PA_PARAMS.setup, ...overrides.setup },
  };
}

export function validateParams(p: PAParams): string[] {
  const errors: string[] = [];
  const numericParams: [string, number][] = [
    ["atrPeriod", p.atrPeriod],
    ["trendBar.minBodyRange", p.trendBar.minBodyRange],
    ["trendBar.minRangeAtr", p.trendBar.minRangeAtr],
    ["trendBar.bullCloseLoc", p.trendBar.bullCloseLoc],
    ["trendBar.bearCloseLoc", p.trendBar.bearCloseLoc],
    ["pinBar.minDominantWickBody", p.pinBar.minDominantWickBody],
    ["pinBar.maxOppositeWickBody", p.pinBar.maxOppositeWickBody],
    ["pinBar.maxBodyRange", p.pinBar.maxBodyRange],
    ["pinBar.bullCloseLoc", p.pinBar.bullCloseLoc],
    ["pinBar.bearCloseLoc", p.pinBar.bearCloseLoc],
    ["zone.atrTolerance", p.zone.atrTolerance],
    ["zone.minTouches", p.zone.minTouches],
    ["zone.maxAgeBars", p.zone.maxAgeBars],
    ["zone.rejectionCloseLoc", p.zone.rejectionCloseLoc],
    ["swing.left", p.swing.left],
    ["swing.right", p.swing.right],
    ["setup.maxAgeBars", p.setup.maxAgeBars],
    ["setup.breakoutBufferTicks", p.setup.breakoutBufferTicks],
  ];
  for (const [name, value] of numericParams) {
    if (!Number.isFinite(value)) errors.push(`${name} must be finite`);
  }
  if (!Number.isInteger(p.atrPeriod) || p.atrPeriod < 1) errors.push("atrPeriod must be a positive integer");
  if (!Number.isInteger(p.swing.left) || p.swing.left < 1) errors.push("swing.left must be a positive integer");
  if (!Number.isInteger(p.swing.right) || p.swing.right < 1) errors.push("swing.right must be a positive integer");
  if (!Number.isInteger(p.zone.minTouches) || p.zone.minTouches < 2) errors.push("zone.minTouches must be an integer >= 2");
  if (!Number.isInteger(p.zone.maxAgeBars) || p.zone.maxAgeBars < 1) errors.push("zone.maxAgeBars must be a positive integer");
  if (!Number.isInteger(p.setup.maxAgeBars) || p.setup.maxAgeBars < 1) errors.push("setup.maxAgeBars must be a positive integer");
  if (!Number.isInteger(p.setup.breakoutBufferTicks) || p.setup.breakoutBufferTicks < 0) errors.push("setup.breakoutBufferTicks must be a non-negative integer");
  if (!(p.zone.atrTolerance > 0)) errors.push("zone.atrTolerance must be > 0");
  const unitInterval = [
    ["trendBar.minBodyRange", p.trendBar.minBodyRange],
    ["trendBar.bullCloseLoc", p.trendBar.bullCloseLoc],
    ["trendBar.bearCloseLoc", p.trendBar.bearCloseLoc],
    ["pinBar.maxBodyRange", p.pinBar.maxBodyRange],
    ["pinBar.bullCloseLoc", p.pinBar.bullCloseLoc],
    ["pinBar.bearCloseLoc", p.pinBar.bearCloseLoc],
    ["zone.rejectionCloseLoc", p.zone.rejectionCloseLoc],
  ] as const;
  for (const [name, value] of unitInterval) {
    if (!Number.isFinite(value) || value < 0 || value > 1) errors.push(`${name} must be in [0, 1]`);
  }
  if (!(p.trendBar.minRangeAtr > 0)) errors.push("trendBar.minRangeAtr must be > 0");
  if (!(p.pinBar.minDominantWickBody > 0)) errors.push("pinBar.minDominantWickBody must be > 0");
  if (p.pinBar.maxOppositeWickBody < 0) errors.push("pinBar.maxOppositeWickBody must be >= 0");
  if (typeof p.reversal.requirePriorExtreme !== "boolean") errors.push("reversal.requirePriorExtreme must be boolean");
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
