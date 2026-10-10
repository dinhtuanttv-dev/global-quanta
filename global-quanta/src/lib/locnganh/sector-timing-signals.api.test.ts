// Port từ locnganh-timing-engine (ui/sector-rotation/sector-timing-signals.api.test.ts).
import { describe, expect, it } from 'vitest';
import { SectorFetchError } from './http-json';
import { buildSectorTimingSignalsUrl, fetchSectorTimingSignals } from './sector-timing-signals.api';

function stub(respond: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string) => {
    calls.push(String(url));
    return respond(String(url));
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const bulk = (signals: unknown[] = []) => ({ version: 'v1', asOf: '2026-10-01T00:00:00Z', signals });

async function rejection(p: Promise<unknown>): Promise<SectorFetchError> {
  try { await p; } catch (e) { expect(e).toBeInstanceOf(SectorFetchError); return e as SectorFetchError; }
  throw new Error('Mong đợi bị từ chối');
}

describe('buildSectorTimingSignalsUrl', () => {
  it('ghép đúng đường dẫn', () => {
    expect(buildSectorTimingSignalsUrl('https://h.example')).toBe('https://h.example/api/locnganh/sector-timing-signals');
    expect(buildSectorTimingSignalsUrl('https://h.example/')).toBe('https://h.example/api/locnganh/sector-timing-signals');
  });
});

describe('fetchSectorTimingSignals', () => {
  it('thành công, gọi đúng URL', async () => {
    const { calls, fetchImpl } = stub(() => json(bulk([])));
    const r = await fetchSectorTimingSignals({ fetchImpl, baseUrl: 'https://h' });
    expect(r?.signals).toEqual([]);
    expect(calls[0]).toBe('https://h/api/locnganh/sector-timing-signals');
  });
  it('404 ⇒ null (chưa có dữ liệu)', async () => {
    const r = await fetchSectorTimingSignals({ fetchImpl: stub(() => new Response('', { status: 404 })).fetchImpl });
    expect(r).toBeNull();
  });
  it('sai schema ⇒ SCHEMA kèm lý do', async () => {
    const e = await rejection(fetchSectorTimingSignals({ fetchImpl: stub(() => json({ version: 'v1', asOf: 'bad', signals: [] })).fetchImpl }));
    expect(e.kind).toBe('SCHEMA');
    expect((e.issues ?? []).join('\n')).toContain('asOf');
  });
  it('HTTP 500', async () => {
    const e = await rejection(fetchSectorTimingSignals({ fetchImpl: stub(() => new Response('', { status: 500 })).fetchImpl }));
    expect(e).toMatchObject({ kind: 'HTTP', status: 500 });
  });
  it('signal đã huỷ trước ⇒ ABORTED, không gọi mạng', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    const { calls, fetchImpl } = stub(() => json(bulk()));
    const e = await rejection(fetchSectorTimingSignals({ fetchImpl, signal: ctrl.signal }));
    expect(e.kind).toBe('ABORTED');
    expect(calls).toHaveLength(0);
  });
});
