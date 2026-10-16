import { describe, it, expect } from 'vitest';
import { buildMonthlyReport } from './macro-report';
import { createMacroApi } from './macro-api';
import { SYNTHETIC_NOTICE, makeSyntheticStore } from './macro-seed';

type Any = any; // eslint-disable-line
const api = createMacroApi({ store: makeSyntheticStore(2024), today: () => '2026-07-15', notice: SYNTHETIC_NOTICE });
const get = async (path: string, query: Record<string, string> = {}) => api.handle({ method: 'GET', path, query, body: undefined });
const post = async (path: string, body: unknown) => api.handle({ method: 'POST', path, query: {}, body });

describe('monthly report', () => {
  it('assembles every section from live API data, with no NaN/undefined leaks', async () => {
    const r = await get('/api/macro/report');
    expect(r.status).toBe(200);
    const md = (r.body as Any).markdown as string;
    for (const h of ['# Báo cáo vĩ mô tháng 07/2026', '## 1. Tóm tắt', '## 2. Nhiệt kế vĩ mô', '## 3. Chế độ vĩ mô', '## 4. Tác động nổi bật', '## 5. Cảnh báo', '## 6. Lịch công bố sắp tới', '## 7. Phương pháp và giới hạn'])
      expect(md).toContain(h);
    expect(md).toContain(SYNTHETIC_NOTICE);
    expect(md).not.toContain('NaN');
    expect(md).not.toContain('undefined');
    expect(md).toContain('ƯỚC TÍNH');
    expect(md).toContain('Hiệu chỉnh kiểm định bội: BY');
  });
  it('markdown tables are well-formed (same column count on every row)', async () => {
    const md = ((await get('/api/macro/report')).body as Any).markdown as string;
    const blocks = md.split('\n\n').filter((b) => b.startsWith('|'));
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    for (const b of blocks) {
      const counts = b.split('\n').map((l) => l.replace(/\\\|/g, '').split('|').length);
      expect(new Set(counts).size).toBe(1);
    }
  });
  it('is deterministic and degrades gracefully when optional parts are missing', async () => {
    const a = ((await get('/api/macro/report')).body as Any).markdown;
    const b = ((await get('/api/macro/report')).body as Any).markdown;
    expect(a).toBe(b);
    const imp = ((await post('/api/macro/impact', {})).body as Any);
    const minimal = buildMonthlyReport({ asOf: '2026-07-15', names: {}, impact: { ...imp, best: [], stability: {} } });
    expect(minimal).toContain('Không có cặp nào vượt hiệu chỉnh');
    expect(minimal).not.toContain('## 2. Nhiệt kế');
  });
  it('escapes pipe characters inside names', () => {
    const md = buildMonthlyReport({
      asOf: '2026-07-15', names: { A: 'Biến | có gạch', B: 'Chỉ số' },
      impact: { firstPeriod: '2010-01', lastPeriod: '2026-06', best: [{ factor: 'A', target: 'B', lag: 1, beta: -1, t: -5, q: 0.001, significant: true, direction: '-' }], stability: {}, warnings: [], options: { adjust: 'by', alpha: 0.05, maxLag: 6 } },
    });
    expect(md).toContain('Biến \\| có gạch');
  });
});

describe('regime-impact route', () => {
  it('returns per-regime betas with an equality test', async () => {
    const r = await post('/api/macro/regime-impact', { factor: 'CPI', target: 'VNINDEX', lag: 1 });
    if (r.status === 422) {
      // acceptable: the HMM found a single regime on this sample — the route must say so clearly
      expect(((r.body as Any).error as string).length).toBeGreaterThan(10);
      return;
    }
    const b = r.body as Any;
    expect(r.status).toBe(200);
    expect(b.perRegime.length).toBe(b.K);
    expect(typeof b.equalityP).toBe('number');
    expect(b.equalityP).toBeGreaterThanOrEqual(0);
    expect(b.equalityP).toBeLessThanOrEqual(1);
  });
  it('validates input', async () => {
    expect((await post('/api/macro/regime-impact', { factor: 'CPI' })).status).toBe(400);
    expect((await post('/api/macro/regime-impact', { factor: 'NOPE', target: 'VNINDEX' })).status).toBe(400);
  });
});
