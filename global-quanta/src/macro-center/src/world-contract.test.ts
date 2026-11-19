// W5 (19/11/2026) — test hợp đồng /api/world/*: (a) phản hồi THẬT của production ghi ngày 19/11/2026, (b) đầu ra engine trong test.
// Mục đích: khoá định dạng JSON giao diện đang đọc. Đổi/bỏ một trường đang dùng -> test vỡ.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWorldApi } from './world-api';
import { WORLD_SYNTHETIC_NOTICE, makeSyntheticWorld } from './world-seed';
import {
  WorldConnectednessSchema, WorldErrorSchema, WorldEventDetailSchema, WorldEventsSchema, WorldMatrixSchema, WorldOverviewSchema, WorldScenarioSchema, WorldSeriesSchema,
} from './world-schemas';

const prod = (f: string) => JSON.parse(readFileSync(resolve(process.cwd(), `src/macro-center/src/__fixtures__/world-prod-2026-11-19/${f}.json`), 'utf8'));
const ok = (schema: { safeParse: (v: unknown) => { success: boolean; error?: { issues: unknown[] } } }, v: unknown) => {
  const r = schema.safeParse(v);
  if (!r.success) throw new Error(JSON.stringify(r.error?.issues.slice(0, 3)));
  return true;
};

describe('hợp đồng /api/world/* — phản hồi thật của production (19/11/2026)', () => {
  it('series, overview, matrix, events, event detail, connectedness, scenario đều khớp schema', () => {
    expect(ok(WorldSeriesSchema, prod('series'))).toBe(true);
    expect(ok(WorldOverviewSchema, prod('overview'))).toBe(true);
    expect(ok(WorldMatrixSchema, prod('matrix'))).toBe(true);
    expect(ok(WorldEventsSchema, prod('events'))).toBe(true);
    expect(ok(WorldEventDetailSchema, prod('event-detail'))).toBe(true);
    expect(ok(WorldConnectednessSchema, prod('connectedness'))).toBe(true);
    expect(ok(WorldScenarioSchema, prod('scenario-usd-strong-h3'))).toBe(true);
    expect(ok(WorldErrorSchema, prod('stock-HPG-422'))).toBe(true);
  });
  it('số liệu thật: danh mục 13 yếu tố; ma trận chỉ gồm yếu tố có số liệu, đủ mọi ô yếu tố × 10 ngành; 6 kịch bản', () => {
    const m = prod('matrix'), s = prod('series');
    expect(s.factors).toHaveLength(13);
    expect(m.sectors).toHaveLength(10);
    expect(m.factors.length).toBeLessThanOrEqual(13);
    expect(m.cells).toHaveLength(m.factors.length * m.sectors.length);
    expect(s.scenarios).toHaveLength(6);
  });
  it('schema bắt được thay đổi phá hợp đồng', () => {
    const m = prod('matrix');
    expect(WorldMatrixSchema.safeParse({ ...m, cells: [{ ...m.cells[0], tier: 'D' }] }).success).toBe(false);
    const sc = prod('scenario-usd-strong-h3');
    const { conclusive: _drop, ...noFlag } = sc.sectors[0];
    expect(WorldScenarioSchema.safeParse({ ...sc, sectors: [noFlag] }).success).toBe(false);
    expect(WorldEventsSchema.safeParse({ events: [{ ...prod('events').events[0], kind: 'other' }], family: 'x' }).success).toBe(false);
    // thêm trường mới thì KHÔNG vỡ
    expect(WorldOverviewSchema.safeParse({ ...prod('overview'), extraField: 1 }).success).toBe(true);
  });
});

describe('hợp đồng /api/world/* — đầu ra engine (cùng mã Gateway đang chạy)', () => {
  const w = makeSyntheticWorld(11);
  const api = createWorldApi({ world: w.data, store: w.store, catalog: w.catalog, today: () => '2026-07-15', notice: WORLD_SYNTHETIC_NOTICE });
  const get = async (path: string) => (await api.handle({ method: 'GET', path, query: {}, body: undefined })).body;
  const post = async (path: string, body: unknown) => (await api.handle({ method: 'POST', path, query: {}, body })).body;
  it('mọi route giao diện dùng đều khớp schema', async () => {
    expect(ok(WorldSeriesSchema, await get('/api/world/series'))).toBe(true);
    expect(ok(WorldOverviewSchema, await get('/api/world/overview'))).toBe(true);
    expect(ok(WorldMatrixSchema, await post('/api/world/matrix', {}))).toBe(true);
    const ev = await get('/api/world/events') as { events: { id: string; sessionDate: string | null }[] };
    expect(ok(WorldEventsSchema, ev)).toBe(true);
    const dated = ev.events.find((e) => e.sessionDate);
    if (dated) expect(ok(WorldEventDetailSchema, await get(`/api/world/events/${dated.id}`))).toBe(true);
    expect(ok(WorldConnectednessSchema, await get('/api/world/connectedness'))).toBe(true);
    expect(ok(WorldScenarioSchema, await post('/api/world/scenario', { scenarioId: 'usd-strong', horizon: 3 }))).toBe(true);
    expect(ok(WorldErrorSchema, await post('/api/world/scenario', {}))).toBe(true);
  });
});

describe('W5 quy tắc bất ổn của kịch bản (±50% trong 3 tháng)', async () => {
  const { scenarioUnstable, SCENARIO_UNSTABLE } = await import('./world-api');
  it('đánh dấu khi vượt ±50% ở tháng 0–3, bỏ qua tháng sau 3 và số không hữu hạn', () => {
    expect(SCENARIO_UNSTABLE).toEqual({ maxAbsPct: 50, months: 3 });
    expect(scenarioUnstable([{ h: 0, est: 1 }, { h: 1, est: 27.7 }, { h: 3, est: 98 }])).toBe(true); // Thép × dầu, production 19/11/2026
    expect(scenarioUnstable([{ h: 0, est: 1 }, { h: 3, est: -49.9 }])).toBe(false);
    expect(scenarioUnstable([{ h: 4, est: 80 }])).toBe(false);
    expect(scenarioUnstable([{ h: 2, est: NaN }])).toBe(false);
  });
  it('engine: mọi ngành có trường unstable; ngành bất ổn không bao giờ "kết luận được"; đường đáp ứng chỉ tới đúng tầm nhìn', async () => {
    const w = makeSyntheticWorld(11);
    const api = createWorldApi({ world: w.data, store: w.store, catalog: w.catalog, today: () => '2026-07-15', notice: WORLD_SYNTHETIC_NOTICE });
    for (const scenarioId of ['usd-strong', 'oil-spike', 'risk-off']) {
      for (const horizon of [1, 3]) {
        const r = (await api.handle({ method: 'POST', path: '/api/world/scenario', query: {}, body: { scenarioId, horizon } })).body as { sectors: { unstable: boolean; conclusive: boolean; irf: { h: number }[] }[] };
        for (const s of r.sectors) {
          expect(typeof s.unstable).toBe('boolean');
          if (s.unstable) expect(s.conclusive).toBe(false);
          expect(Math.max(...s.irf.map((p) => p.h))).toBeLessThanOrEqual(horizon);
        }
      }
    }
  });
});
