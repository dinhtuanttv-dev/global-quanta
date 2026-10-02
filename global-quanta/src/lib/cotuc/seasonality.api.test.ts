import { describe, expect, it } from 'vitest';
import { SeasonalityFetchError, isRetryableSeasonality } from './http-json';
import {
  buildAnnualCalendarUrl,
  buildEarningsCycleStatsUrl,
  fetchAnnualEarningsCalendar,
  fetchEarningsCyclePaths,
  fetchEarningsCycleStats,
} from './seasonality.api';
import { makePaths } from './cycle-timeline.fixtures';

const rp = { alpha: 6, beta: 3, mean: 6 / 9, ci: [0.4, 0.88], level: 0.9 };
const statsBody = (o: Record<string, unknown> = {}) => ({
  ticker: 'VNM', version: 'v1', asOf: '2026-09-26T00:00:00Z', eventType: 'EARNINGS', quarter: 2,
  windows: [{ id: 'W1', label: 'W1', entryFrom: -15, entryTo: -5, exitOffset: -1, holdsThroughEx: false, nEvents: 9, nEff: 8, meanCarRaw: 0.02, meanCarShrunk: 0.015, netExpectancy: 0.012, netExpectancyLcb: 0.004, winRate: 0.7, oosHitRate: null, oosMeanNet: null, fdrQValue: 0.05, selected: true }],
  selectedWindowId: 'W1', adjustedPriceBasis: 'ADJ_CLOSE', benchmark: 'VNINDEX', reactionProbability: rp, ...o,
});
const q = (n: number) => ({ quarter: n, typicalAnnounceMonth: 4, announceMonthStd: 0.5, reactionProbability: null, nEvents: 3, dataStatus: 'CONFIRMED' });
const calBody = (o: Record<string, unknown> = {}) => ({ ticker: 'VNM', version: 'v1', asOf: '2026-09-26T00:00:00Z', quarters: [q(1), q(2), q(3), q(4)], ...o });

function stub(respond: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(String(url));
    return respond(String(url));
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
async function rejection(p: Promise<unknown>): Promise<SeasonalityFetchError> {
  try { await p; } catch (e) { expect(e).toBeInstanceOf(SeasonalityFetchError); return e as SeasonalityFetchError; }
  throw new Error('Mong đợi bị từ chối');
}

describe('URL builders', () => {
  it('có ticker và quarter đúng', () => {
    expect(buildEarningsCycleStatsUrl('VNM', 3, 'https://h')).toBe('https://h/api/cotuc/earnings-cycle-stats?ticker=VNM&quarter=3');
    expect(buildAnnualCalendarUrl('VNM', 'https://h/')).toBe('https://h/api/cotuc/annual-earnings-calendar?ticker=VNM');
  });
});

describe('fetchEarningsCycleStats', () => {
  it('thành công, gọi đúng URL', async () => {
    const { calls, fetchImpl } = stub(() => json(statsBody()));
    const r = await fetchEarningsCycleStats(' vnm ', 2, { fetchImpl, baseUrl: 'https://h' });
    expect(r?.quarter).toBe(2);
    expect(calls[0]).toBe('https://h/api/cotuc/earnings-cycle-stats?ticker=VNM&quarter=2');
  });
  it('quarter/ticker sai ⇒ INVALID_INPUT, không gọi mạng', async () => {
    const { calls, fetchImpl } = stub(() => json({}));
    expect((await rejection(fetchEarningsCycleStats('VNM', 5 as never, { fetchImpl }))).kind).toBe('INVALID_INPUT');
    expect((await rejection(fetchEarningsCycleStats('a b', 1, { fetchImpl }))).kind).toBe('INVALID_INPUT');
    expect(calls).toHaveLength(0);
  });
  it('404 ⇒ null; backend trả nhầm quý ⇒ MISMATCH; sai schema ⇒ SCHEMA', async () => {
    expect(await fetchEarningsCycleStats('VNM', 2, { fetchImpl: stub(() => new Response('', { status: 404 })).fetchImpl })).toBeNull();
    expect((await rejection(fetchEarningsCycleStats('VNM', 3, { fetchImpl: stub(() => json(statsBody({ quarter: 2 }))).fetchImpl }))).kind).toBe('MISMATCH');
    const bad = statsBody({ reactionProbability: { ...rp, mean: 0.99 } });
    const e = await rejection(fetchEarningsCycleStats('VNM', 2, { fetchImpl: stub(() => json(bad)).fetchImpl }));
    expect(e.kind).toBe('SCHEMA');
    expect((e.issues ?? []).join('\n')).toContain('mean');
  });
});

describe('fetchAnnualEarningsCalendar / fetchEarningsCyclePaths', () => {
  it('calendar thành công, sai mã ⇒ MISMATCH', async () => {
    expect((await fetchAnnualEarningsCalendar('VNM', { fetchImpl: stub(() => json(calBody())).fetchImpl }))?.quarters).toHaveLength(4);
    expect((await rejection(fetchAnnualEarningsCalendar('VNM', { fetchImpl: stub(() => json(calBody({ ticker: 'FPT' }))).fetchImpl }))).kind).toBe('MISMATCH');
  });
  it('calendar thiếu quý ⇒ SCHEMA', async () => {
    const e = await rejection(fetchAnnualEarningsCalendar('VNM', { fetchImpl: stub(() => json(calBody({ quarters: [q(1)] }))).fetchImpl }));
    expect(e.kind).toBe('SCHEMA');
  });
  it('cycle-paths tái dùng schema CyclePathsV3', async () => {
    const r = await fetchEarningsCyclePaths('TST', 1, { fetchImpl: stub(() => json(makePaths({ ticker: 'TST' }))).fetchImpl });
    expect(r?.eventPaths).toHaveLength(5);
  });
});

describe('lỗi mạng và thử lại', () => {
  it('HTTP 500 retryable, 403 thì không; abort sớm không gọi mạng', async () => {
    const e500 = await rejection(fetchAnnualEarningsCalendar('VNM', { fetchImpl: stub(() => new Response('', { status: 500 })).fetchImpl }));
    const e403 = await rejection(fetchAnnualEarningsCalendar('VNM', { fetchImpl: stub(() => new Response('', { status: 403 })).fetchImpl }));
    expect(isRetryableSeasonality(e500)).toBe(true);
    expect(isRetryableSeasonality(e403)).toBe(false);
    const ctrl = new AbortController();
    ctrl.abort();
    const { calls, fetchImpl } = stub(() => json(calBody()));
    expect((await rejection(fetchAnnualEarningsCalendar('VNM', { fetchImpl, signal: ctrl.signal }))).kind).toBe('ABORTED');
    expect(calls).toHaveLength(0);
  });
});
