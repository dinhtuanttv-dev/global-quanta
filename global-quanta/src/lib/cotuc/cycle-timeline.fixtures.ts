import type { BacktestWindow, CyclePathsV3, CycleStatsV3 } from './timing-types';

export function makeWindow(o: Partial<BacktestWindow> = {}): BacktestWindow {
  return {
    id: 'W2',
    label: 'W2',
    entryFrom: -15,
    entryTo: -5,
    exitOffset: -1,
    holdsThroughEx: false,
    nEvents: 10,
    nEff: 8.4,
    meanCarRaw: 0.021,
    meanCarShrunk: 0.016,
    netExpectancy: 0.012,
    netExpectancyLcb: 0.004,
    winRate: 0.7,
    oosHitRate: 0.6,
    oosMeanNet: 0.006,
    fdrQValue: 0.06,
    selected: true,
    ...o,
  };
}

export function makeStats(o: Partial<CycleStatsV3> = {}): CycleStatsV3 {
  return {
    ticker: 'TST',
    version: 'test-v1',
    asOf: '2026-09-24T03:00:00Z',
    eventType: 'CASH',
    windows: [
      makeWindow(),
      makeWindow({ id: 'W1', label: 'W1', entryFrom: -30, entryTo: -20, selected: false, netExpectancyLcb: -0.002, fdrQValue: 0.4 }),
    ],
    selectedWindowId: 'W2',
    adjustedPriceBasis: 'ADJ_CLOSE',
    benchmark: 'VNINDEX',
    ...o,
  };
}

/** 5 đợt, offsets -20..5 (26 điểm). currentPath có giá trị tới offset -12. */
export function makePaths(o: Partial<CyclePathsV3> = {}): CyclePathsV3 {
  const offsets = Array.from({ length: 26 }, (_, i) => i - 20);
  return {
    ticker: 'TST',
    version: 'test-v1',
    asOf: '2026-09-24T03:00:00Z',
    offsets,
    eventPaths: Array.from({ length: 5 }, (_, e) => ({
      exDate: `${2020 + e}-06-12`,
      car: offsets.map((_, i) => 0.001 * i * (1 + e * 0.1)),
    })),
    currentPath: offsets.map((t, i) => (t <= -12 ? 0.0009 * i : null)),
    ...o,
  };
}
