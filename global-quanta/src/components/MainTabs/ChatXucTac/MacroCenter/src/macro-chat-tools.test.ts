import { describe, it, expect } from 'vitest';
import { MACRO_CHAT_SYSTEM_PROMPT, MACRO_TOOL_SPECS, createMacroChatTools, toAnthropicTools, toOpenAITools, validateArgs } from './macro-chat-tools';
import { createMacroApi } from './macro-api';
import { SYNTHETIC_NOTICE, makeSyntheticStore } from './macro-seed';
import { VN_CATALOG } from './macro-data';

type Any = any; // eslint-disable-line
const api = createMacroApi({ store: makeSyntheticStore(2024), today: () => '2026-07-15', notice: SYNTHETIC_NOTICE });
const tools = createMacroChatTools(api);
const size = (r: unknown) => JSON.stringify(r).length;
function allFinite(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(allFinite);
  if (v && typeof v === 'object') return Object.values(v).every(allFinite);
  return true;
}

describe('tool specs', () => {
  it('are well-formed: unique names, strict schemas, enums that exist in the catalogue', () => {
    expect(new Set(MACRO_TOOL_SPECS.map((s) => s.name)).size).toBe(MACRO_TOOL_SPECS.length);
    const ids = new Set(VN_CATALOG.map((m) => m.id));
    for (const s of MACRO_TOOL_SPECS) {
      expect(s.description.length).toBeGreaterThan(40);
      expect(s.parameters.additionalProperties).toBe(false);
      s.parameters.required.forEach((r) => expect(r in s.parameters.properties).toBe(true));
      for (const p of Object.values(s.parameters.properties)) {
        expect(p.description.length).toBeGreaterThan(5);
        if (p.enum && s.name !== 'macro_scenario') p.enum.forEach((e) => expect(ids.has(String(e))).toBe(true));
      }
    }
  });
  it('adapters produce the Anthropic and OpenAI shapes', () => {
    const a = toAnthropicTools();
    const o = toOpenAITools();
    expect(a).toHaveLength(MACRO_TOOL_SPECS.length);
    expect(Object.keys(a[0]).sort()).toEqual(['description', 'input_schema', 'name']);
    expect(o[0].type).toBe('function');
    expect(o[0].function.parameters).toEqual(MACRO_TOOL_SPECS[0].parameters);
  });
  it('system prompt carries the honesty rules the tools rely on', () => {
    for (const k of ['usableForDecisions', 'insignificant', 'unstable', 'conclusive', 'notice', 'nhân quả']) expect(MACRO_CHAT_SYSTEM_PROMPT).toContain(k);
  });
});

describe('argument validation', () => {
  const schema = MACRO_TOOL_SPECS.find((s) => s.name === 'macro_cell_detail')!.parameters;
  it('accepts valid input and explains every kind of mistake', () => {
    expect(validateArgs(schema, { factor: 'CPI', target: 'VNINDEX', lag: 2 })).toBe(null);
    expect(validateArgs(schema, { target: 'VNINDEX' })).toContain('Thiếu tham số bắt buộc: factor');
    expect(validateArgs(schema, { factor: 'XYZ', target: 'VNINDEX' })).toContain('không hợp lệ');
    expect(validateArgs(schema, { factor: 'CPI', target: 'VNINDEX', lag: 99 })).toContain('≤ 12');
    expect(validateArgs(schema, { factor: 'CPI', target: 'VNINDEX', lag: '1' })).toContain('kiểu number');
    expect(validateArgs(schema, { factor: 'CPI', target: 'VNINDEX', hack: 1 })).toContain('Tham số không hợp lệ: hack');
    expect(validateArgs(schema, [1])).toContain('đối tượng');
    expect(validateArgs(MACRO_TOOL_SPECS[0].parameters, undefined)).toBe(null);
  });
});

describe('executor on live API data', () => {
  it('rejects unknown tools and bad arguments without calling the API', async () => {
    const before = api.cacheStats();
    const r = await tools.run('macro_hack', {});
    expect(r.ok).toBe(false);
    expect(r.error).toContain('macro_overview');
    expect((await tools.run('macro_cell_detail', { factor: 'CPI' })).ok).toBe(false);
    expect(api.cacheStats().misses).toBe(before.misses);
  });
  it('overview: compact, faithful, and carries the decision gate', async () => {
    const r = await tools.run('macro_overview', {});
    expect(r.ok).toBe(true);
    const d = r.data as Any;
    const score = (await api.handle({ method: 'POST', path: '/api/macro/score', query: {}, body: {} })).body as Any;
    expect(d.thermometer.value).toBeCloseTo(score.thermometer.value, 2);
    expect(d.thermometer.band).toBe(score.thermometer.bandVi);
    expect(typeof d.usableForDecisions).toBe('boolean');
    expect(d.alerts.length).toBeLessThanOrEqual(3);
    expect(r.notice).toBe(SYNTHETIC_NOTICE);
    expect(r.guidance!.length).toBeGreaterThan(0);
    expect(size(r)).toBeLessThan(3000);
    expect(allFinite(r)).toBe(true);
  });
  it('impact lookup: significant rows sorted by |t|, statuses, filters, topN, size bound', async () => {
    const r = await tools.run('macro_impact_lookup', {});
    const d = r.data as Any;
    expect(d.rows.length).toBe(8);
    const ts = d.rows.map((x: Any) => Math.abs(x.t));
    expect(ts).toEqual([...ts].sort((a: number, b: number) => b - a));
    d.rows.forEach((x: Any) => expect(['stable', 'unstable', 'significant-unchecked']).toContain(x.status));
    expect(d.significant).toBeGreaterThan(8);
    expect(size(r)).toBeLessThan(4500);
    const cpi = (await tools.run('macro_impact_lookup', { factor: 'CPI', target: 'VNINDEX' })).data as Any;
    expect(cpi.rows).toHaveLength(1);
    expect(cpi.rows[0].direction).toBe('giảm');
    expect(cpi.rows[0].lagMonths).toBe(1);
    const noisy = (await tools.run('macro_impact_lookup', { factor: 'OIL', onlySignificant: false })).data as Any;
    expect(noisy.rows.length).toBe(6);
    noisy.rows.forEach((x: Any) => expect(x.status).toBe('insignificant'));
    const none = await tools.run('macro_impact_lookup', { factor: 'OIL' });
    expect((none.data as Any).rows).toHaveLength(0);
    expect(none.guidance!.join(' ')).toContain('chưa tìm thấy bằng chứng');
    expect(((await tools.run('macro_impact_lookup', { topN: 3 })).data as Any).shown).toBe(3);
    expect((await tools.run('macro_impact_lookup', { topN: 50 })).ok).toBe(false);
  });
  it('scenario: ranked, with conclusive flags and explicit CI; custom shocks and errors', async () => {
    const r = await tools.run('macro_scenario', { scenarioId: 'easing', horizon: 3 });
    const d = r.data as Any;
    expect(d.ranking).toHaveLength(6);
    const est = d.ranking.map((x: Any) => x.estimatePct);
    expect(est).toEqual([...est].sort((a: number, b: number) => b - a));
    d.ranking.forEach((x: Any) => {
      expect(typeof x.conclusive).toBe('boolean');
      expect(x.ciLowPct).toBeLessThanOrEqual(x.estimatePct);
      expect(x.ciHighPct).toBeGreaterThanOrEqual(x.estimatePct);
    });
    expect(r.guidance!.join(' ')).toContain('conclusive');
    const custom = await tools.run('macro_scenario', { shocks: [{ factor: 'CPI', amount: 1, unit: 'pp' }] });
    expect(custom.ok).toBe(true);
    expect((custom.data as Any).ranking.every((x: Any) => x.estimatePct < 0)).toBe(true);
    const none = await tools.run('macro_scenario', {});
    expect(none.ok).toBe(false);
    expect(none.error).toContain('easing');
    expect((await tools.run('macro_scenario', { scenarioId: 'easing', horizon: 99 })).ok).toBe(false);
    const badUnit = await tools.run('macro_scenario', { shocks: [{ factor: 'CPI', amount: 1, unit: 'pct' }] });
    expect(badUnit.ok).toBe(true);
    expect((badUnit.data as Any).warnings.length).toBeGreaterThan(0);
  });
  it('cell detail: summarises rolling stability instead of dumping arrays', async () => {
    const r = await tools.run('macro_cell_detail', { factor: 'CPI', target: 'VNINDEX', lag: 1 });
    const d = r.data as Any;
    expect(d.beta).toBeLessThan(0);
    expect(d.rolling48m.windows).toBeGreaterThan(50);
    expect(d.rolling48m.shareSameSign).toBeGreaterThan(0.5);
    expect(d.bootstrapCI95[0]).toBeLessThan(d.bootstrapCI95[1]);
    expect(size(r)).toBeLessThan(1500);
    expect(r.guidance!.join(' ')).toContain('CHƯA hiệu chỉnh');
  });
  it('calendar+alerts and report', async () => {
    const c = await tools.run('macro_calendar_alerts', {});
    expect((c.data as Any).upcoming.length).toBeLessThanOrEqual(6);
    expect(c.guidance!.join(' ')).toContain('ƯỚC TÍNH');
    const rep = await tools.run('macro_report', {});
    expect(((rep.data as Any).markdown as string).startsWith('# Báo cáo vĩ mô')).toBe(true);
  });
  it('surfaces data problems honestly instead of inventing numbers', async () => {
    const r = await tools.run('macro_overview', { asOf: '2009-01-01' });
    expect(r.ok).toBe(false);
    expect(r.error!.length).toBeGreaterThan(10);
    expect(r.data).toBe(undefined);
  });
});
