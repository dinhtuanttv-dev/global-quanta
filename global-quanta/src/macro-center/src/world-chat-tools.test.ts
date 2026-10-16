import { describe, it, expect } from 'vitest';
import { WORLD_CHAT_GUIDELINES, WORLD_TOOL_SPECS, createWorldChatTools } from './world-chat-tools';
import { createWorldApi } from './world-api';
import { createWorldClient } from './world-client';
import { MacroApiError } from './macro-client';
import { WORLD_SYNTHETIC_NOTICE, makeSyntheticWorld } from './world-seed';
import { toAnthropicTools, toOpenAITools } from './macro-chat-tools';

type Any = any; // eslint-disable-line
const w = makeSyntheticWorld(11);
const api = createWorldApi({ world: w.data, store: w.store, catalog: w.catalog, today: () => '2026-07-15', notice: WORLD_SYNTHETIC_NOTICE });
const tools = createWorldChatTools(api);
const size = (x: unknown) => JSON.stringify(x).length;

describe('world chat tools', () => {
  it('specs are strict, unique and convertible to provider formats', () => {
    expect(new Set(WORLD_TOOL_SPECS.map((s) => s.name)).size).toBe(WORLD_TOOL_SPECS.length);
    WORLD_TOOL_SPECS.forEach((s) => { expect(s.parameters.additionalProperties).toBe(false); expect(s.description.length).toBeGreaterThan(40); });
    expect(toAnthropicTools(WORLD_TOOL_SPECS)[0].input_schema.type).toBe('object');
    expect(toOpenAITools(WORLD_TOOL_SPECS)[0].function.name).toBe('world_links');
    for (const k of ['Bậc A', 'Bậc C', 'pending', 'conclusive', 'notice']) expect(WORLD_CHAT_GUIDELINES).toContain(k);
  });
  it('rejects unknown tools and invalid arguments', async () => {
    expect((await tools.run('world_hack', {})).ok).toBe(false);
    expect((await tools.run('world_links', { factor: 'CPI' })).error).toContain('không hợp lệ');
    expect((await tools.run('world_links', { topN: 99 })).ok).toBe(false);
    expect((await tools.run('world_stock_profile', {})).error).toContain('Thiếu');
    expect((await tools.run('world_scenario', {})).ok).toBe(false);
    expect((await tools.run('world_stock_profile', { code: 'NOPE' })).ok).toBe(false);
  });
  it('links: only A/B by default, tier and reason included, compact', async () => {
    const r = await tools.run('world_links', {});
    const d = r.data as Any;
    expect(d.rows.length).toBeGreaterThan(0);
    d.rows.forEach((x: Any) => expect(['A', 'B']).toContain(x.tier));
    expect(r.notice).toBe(WORLD_SYNTHETIC_NOTICE);
    expect(size(r)).toBeLessThan(5500);
    const withC = (await tools.run('world_links', { factor: 'PMI_US', includeC: true })).data as Any;
    expect(withC.rows.length).toBeGreaterThan(0);
    withC.rows.forEach((x: Any) => expect(x.tier).toBe('C'));
    const none = await tools.run('world_links', { factor: 'PMI_US' });
    expect((none.data as Any).rows).toHaveLength(0);
    expect(none.guidance!.join(' ')).toContain('chưa tìm thấy bằng chứng');
  });
  it('events: list and detail, pending is explicit', async () => {
    const l = (await tools.run('world_events', {})).data as Any;
    expect(l.events).toHaveLength(12);
    expect(l.events.find((e: Any) => e.id === 'ev12').tier).toBe('pending');
    const d = (await tools.run('world_events', { eventId: 'ev1' })).data as Any;
    expect(d.carPct).toBeLessThan(-4);
    expect(d.topSectors).toHaveLength(3);
    expect((await tools.run('world_events', { eventId: 'zzz' })).ok).toBe(false);
  });
  it('connectedness, scenario and stock profile return honest compact payloads', async () => {
    const c = (await tools.run('world_connectedness', {})).data as Any;
    expect(c.netTransmitters[0].market).toBe('Mỹ');
    expect(c.tailDependence).toHaveLength(5);
    const s = await tools.run('world_scenario', { scenarioId: 'tariff-up' });
    const sd = s.data as Any;
    expect(sd.sectors).toHaveLength(10);
    expect(typeof sd.sectors[0].conclusive).toBe('boolean');
    expect(s.guidance!.join(' ')).toContain('conclusive');
    expect(size(s)).toBeLessThan(5000);
    const p = await tools.run('world_stock_profile', { code: 'SEA1' });
    const pd = p.data as Any;
    expect(pd.betas.length).toBe(2);
    expect(pd.source).toContain('kỳ');
    expect(size(p)).toBeLessThan(2500);
  });
});

describe('world client against the API (in-process fetch)', () => {
  it('serves the world API through the generic HTTP adapter and surfaces errors', async () => {
    // fetch trong tiến trình: đi qua đúng api.handle (route, kiểm tra tham số, mã lỗi) mà không cần máy chủ HTTP
    const fetchImpl = async (url: string, init?: RequestInit) => {
      const u = new URL(url, 'http://local');
      const r = await api.handle({ method: init?.method ?? 'GET', path: u.pathname, query: Object.fromEntries(u.searchParams), body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined });
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
    };
    const c = createWorldClient('', fetchImpl);
    const series = await c.series<{ factors: unknown[] }>();
    expect(series.factors).toHaveLength(13);
    const ev = await c.event<{ event: { id: string } }>('ev1');
    expect(ev.event.id).toBe('ev1');
    let err: unknown = null;
    try { await c.stock('NOPE'); } catch (e) { err = e; }
    expect(err instanceof MacroApiError).toBe(true);
    expect((err as MacroApiError).status).toBe(404);
  });
});
