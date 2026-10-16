// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { DEFAULT_FILTER, buildMatrixView, cellKey, describeCell, fmtNum, fmtQ, type ImpactPayloadLike } from './macro-filter';
import { createMacroClient, MacroApiError } from './macro-client';
import { createMacroApi } from './macro-api';
import { makeSyntheticStore } from './macro-seed';

const mk = (factor: string, target: string, t: number, sig: boolean, lag = 1) => ({
  factor, target, lag, beta: t / 2, t, p: 0.01, q: sig ? 0.001 : 0.5, betaStd: 0.1, nobs: 200,
  direction: (t > 0 ? '+' : '-') as '+' | '-', significant: sig,
});
const payload: ImpactPayloadLike = {
  factors: ['CPI', 'M2', 'FDI'], targets: ['VNINDEX', 'VN30'],
  best: [mk('CPI', 'VNINDEX', -6, true), mk('CPI', 'VN30', -4, true), mk('M2', 'VNINDEX', 5, true), mk('M2', 'VN30', 1, false), mk('FDI', 'VNINDEX', 0.5, false), mk('FDI', 'VN30', 0.4, false)],
  cells: [mk('CPI', 'VNINDEX', -6, true, 1), mk('CPI', 'VNINDEX', -1, false, 2), mk('M2', 'VNINDEX', 5, true, 1)],
  stability: {
    'CPI|VNINDEX': { shareSameSign: 0.95, signFlips: 0, windows: 100, stable: true },
    'CPI|VN30': { shareSameSign: 0.6, signFlips: 7, windows: 100, stable: false },
  },
  diagnostics: [{ id: 'CPI', transform: 'diff' }, { id: 'M2', transform: 'logdiff' }],
};

describe('matrix view model', () => {
  it('classifies cells by significance and stability and counts them', () => {
    const v = buildMatrixView(payload, DEFAULT_FILTER);
    expect(v.cells[cellKey('CPI', 'VNINDEX')].status).toBe('stable');
    expect(v.cells[cellKey('CPI', 'VN30')].status).toBe('unstable');
    expect(v.cells[cellKey('M2', 'VNINDEX')].status).toBe('significant');
    expect(v.cells[cellKey('M2', 'VN30')].status).toBe('insignificant');
    expect(v.counts).toEqual({ stable: 1, unstable: 1, significant: 1, insignificant: 3 });
  });
  it('orders factors by their strongest visible |t|', () => {
    expect(buildMatrixView(payload, DEFAULT_FILTER).factors).toEqual(['CPI', 'M2', 'FDI']);
  });
  it('filters by direction, significance, stability and minimum |t|', () => {
    expect(buildMatrixView(payload, { ...DEFAULT_FILTER, direction: '-' }).factors).toEqual(['CPI']);
    const sig = buildMatrixView(payload, { ...DEFAULT_FILTER, significance: 'significant' });
    expect(sig.factors).toEqual(['CPI', 'M2']);
    expect(sig.hiddenByFilter).toBe(3);
    const stable = buildMatrixView(payload, { ...DEFAULT_FILTER, significance: 'stable' });
    expect(Object.keys(stable.cells)).toEqual(['CPI|VNINDEX']);
    expect(Object.keys(buildMatrixView(payload, { ...DEFAULT_FILTER, minAbsT: 4.5 }).cells).sort()).toEqual(['CPI|VNINDEX', 'M2|VNINDEX']);
  });
  it('restricts to chosen targets/factors and to a specific lag', () => {
    const v = buildMatrixView(payload, { ...DEFAULT_FILTER, targets: ['VN30'] });
    expect(v.targets).toEqual(['VN30']);
    expect(buildMatrixView(payload, { ...DEFAULT_FILTER, factors: ['M2'] }).factors).toEqual(['M2']);
    const lag2 = buildMatrixView(payload, { ...DEFAULT_FILTER, lag: 2 });
    expect(Object.keys(lag2.cells)).toEqual(['CPI|VNINDEX']);
    expect(lag2.cells['CPI|VNINDEX'].status).toBe('insignificant');
  });
  it('insignificant cells are drawn fainter than significant ones', () => {
    const v = buildMatrixView(payload, DEFAULT_FILTER);
    expect(v.cells['CPI|VNINDEX'].intensity).toBeGreaterThan(v.cells['M2|VN30'].intensity);
    expect(v.cells['FDI|VNINDEX'].intensity).toBeLessThan(0.1);
  });
});

describe('Vietnamese formatting and narrative', () => {
  it('uses decimal comma and clear placeholders', () => {
    expect(fmtNum(-3.456, 1)).toBe('-3,5');
    expect(fmtNum(NaN)).toBe('–');
    expect(fmtQ(0.0004)).toBe('< 0,001');
    expect(fmtQ(0.0423)).toBe('0,042');
  });
  it('sentence states direction, lag, unit and the honest caveat', () => {
    const v = buildMatrixView(payload, DEFAULT_FILTER);
    const names = { factor: 'CPI', target: 'VN-Index' };
    const stable = describeCell(v.cells['CPI|VNINDEX'], names, 'diff');
    expect(stable).toContain('tăng 1 điểm');
    expect(stable).toContain('giảm khoảng');
    expect(stable).toContain('sau 1 tháng');
    expect(stable).toContain('ổn định');
    expect(describeCell(v.cells['CPI|VN30'], names, 'diff')).toContain('KHÔNG ổn định');
    expect(describeCell(v.cells['M2|VN30'], names, 'logdiff')).toContain('Chưa đủ bằng chứng');
  });
});

describe('client against the real API (in-process fetch)', () => {
  it('returns typed payloads and surfaces server errors as MacroApiError', async () => {
    const api = createMacroApi({ store: makeSyntheticStore(2024), today: () => '2026-07-15' });
    // fetch trong tiến trình: đi qua đúng api.handle (route, kiểm tra tham số, mã lỗi) mà không cần máy chủ HTTP
    const fetchImpl = async (url: string, init?: RequestInit) => {
      const u = new URL(url, 'http://local');
      const r = await api.handle({ method: init?.method ?? 'GET', path: u.pathname, query: Object.fromEntries(u.searchParams), body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
    };
    const c = createMacroClient('', fetchImpl);
    const health = await c.health<{ ok: boolean }>();
    expect(health.ok).toBe(true);
    const sc = await c.scenario<{ ranking: unknown[] }>({ scenarioId: 'cpi-up', horizon: 2 });
    expect(sc.ranking.length).toBe(6);
    const cal = await c.calendar<{ releases: unknown[] }>('2026-07-15');
    expect(cal.releases.length).toBeGreaterThan(0);
    let err: unknown = null;
    try {
      await c.impact({ adjust: 'nope' });
    } catch (e) {
      err = e;
    }
    expect(err instanceof MacroApiError).toBe(true);
    expect((err as MacroApiError).status).toBe(400);
    expect((err as MacroApiError).message).toContain('adjust');
  });
});
