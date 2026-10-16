import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { EvidenceChip, CiTrack, ColumnChart, Notice } from './shared';
import { WorldPulse } from './WorldPulse';
import { WorldFilterBar, WorldMatrix } from './WorldMatrix';
import { ConnectednessPanel } from './ConnectednessPanel';
import { EventDetail, EventList } from './EventPanels';
import { StockProfile, WorldScenario } from './ScenarioStock';
import { WorldTab } from './WorldTab';
import { createWorldApi } from '../../world-api';
import { WORLD_SYNTHETIC_NOTICE, makeSyntheticWorld } from '../../world-seed';
import { DEFAULT_WORLD_FILTER, buildWorldMatrixView, contrastRatio, themeCssVars, WORLD_THEME, worldCellKey, type WorldMatrixPayload } from '../../world-view';

type Any = any; // eslint-disable-line
const w = makeSyntheticWorld(11);
const api = createWorldApi({ world: w.data, store: w.store, catalog: w.catalog, today: () => '2026-07-15', notice: WORLD_SYNTHETIC_NOTICE });
const call = async (method: string, path: string, body?: unknown) => (await api.handle({ method, path, query: {}, body })).body as Any;
const noop = () => undefined;

describe('design tokens', () => {
  const textPairs: [string, string][] = [['ink', 'panel'], ['ink', 'ground'], ['ink', 'track'], ['ink2', 'panel'], ['ink2', 'ground'], ['ink2', 'track'], ['onAccent', 'accent'], ['accent', 'panel'], ['up3fg', 'up3'], ['up2fg', 'up2'], ['up1fg', 'up1'], ['down3fg', 'down3'], ['down2fg', 'down2'], ['down1fg', 'down1'], ['warntext', 'warnbg'], ['uptext', 'panel'], ['downtext', 'panel'], ['ink', 'surface']];
  for (const theme of ['light', 'dark'] as const)
    it(`${theme}: every text/background pair reaches WCAG AA (4.5:1)`, () => {
      for (const [fg, bg] of textPairs) expect(contrastRatio(WORLD_THEME[theme][fg], WORLD_THEME[theme][bg])).toBeGreaterThanOrEqual(4.5);
    });
  it('non-text marks (axis, borders of hatched cells) reach 3:1 against the panel in both themes', () => {
    for (const theme of ['light', 'dark'] as const) expect(contrastRatio(WORLD_THEME[theme].ink3, WORLD_THEME[theme].panel)).toBeGreaterThanOrEqual(3);
  });
  it('both themes define exactly the same tokens, and the generated CSS matches the TypeScript source', () => {
    expect(Object.keys(WORLD_THEME.dark).sort()).toEqual(Object.keys(WORLD_THEME.light).sort());
    // đường dẫn tính từ gốc repo (thư mục chạy vitest), không phải gốc của gói
    const css = readFileSync(resolve(process.cwd(), 'src/macro-center/src/ui/world/world-tokens.css'), 'utf8');
    expect(css).toContain(themeCssVars('light'));
    expect(css).toContain(themeCssVars('dark'));
  });
  it('contrast helper matches known values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 10);
  });
});

describe('view model', () => {
  it('filters by tier, direction and channel; counts and orders by strength', async () => {
    const m = (await call('POST', '/api/world/matrix', {})) as WorldMatrixPayload & Any;
    const all = buildWorldMatrixView(m, DEFAULT_WORLD_FILTER);
    expect(all.counts.A + all.counts.B + all.counts.C).toBe(130);
    const onlyA = buildWorldMatrixView(m, { ...DEFAULT_WORLD_FILTER, tiers: ['A'] });
    expect(Object.values(onlyA.cells).every((c) => c.tier === 'A')).toBe(true);
    const neg = buildWorldMatrixView(m, { ...DEFAULT_WORLD_FILTER, direction: '-', tiers: ['A', 'B'] });
    expect(Object.values(neg.cells).every((c) => c.direction === '-' && c.tier !== 'C')).toBe(true);
    const trade = buildWorldMatrixView(m, { ...DEFAULT_WORLD_FILTER, channel: 'policy_trade' });
    expect(trade.factors.map((f) => f.id)).toEqual(['TARIFF']);
    expect(all.hidden).toBe(0);
    const strengths = all.factors.map((f) => Math.max(...Object.values(all.cells).filter((c) => c.factor === f.id).map((c) => Math.abs(c.t) * (c.tier === 'C' ? 0.2 : 1))));
    expect(strengths).toEqual([...strengths].sort((a, b) => b - a));
  });
});

describe('components render real API payloads accessibly', () => {
  it('chips, tracks, charts', () => {
    expect(renderToStaticMarkup(<EvidenceChip tier="A" />)).toContain('ev-A');
    expect(renderToStaticMarkup(<EvidenceChip tier="pending" />)).toContain('Chờ');
    const ci = renderToStaticMarkup(<CiTrack est={-1} lo={-3} hi={2} range={5} label="x" />);
    expect(ci).toContain('hollow');
    expect(renderToStaticMarkup(<CiTrack est={-4} lo={-5} hi={-3} range={8} label="x" />)).not.toContain('hollow');
    expect(renderToStaticMarkup(<ColumnChart values={[1, -2, 0.5]} scale={10} label="biểu đồ" />)).toContain('role="img"');
    expect(renderToStaticMarkup(<Notice text="Dữ liệu mô phỏng" />)).toContain('role="note"');
    expect(renderToStaticMarkup(<Notice />)).toBe('');
  });
  it('matrix: table semantics, one button per cell, status in class and label', async () => {
    const m = await call('POST', '/api/world/matrix', {});
    const view = buildWorldMatrixView(m, { ...DEFAULT_WORLD_FILTER, factors: ['CONTAINER', 'TARIFF', 'OIL'], sectors: ['S_PORT', 'S_SEAFOOD', 'S_POWER'] });
    const html = renderToStaticMarkup(<WorldMatrix view={view} selected={worldCellKey('CONTAINER', 'S_PORT')} onSelect={noop} />);
    expect(html).toContain('<table');
    expect(html).toContain('scope="row"');
    expect((html.match(/<button/g) ?? []).length).toBe(9);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Cảng và logistics và Cước container: tăng');
    expect(html).toContain('l0');
    expect(html).toContain('Chú giải');
    const empty = buildWorldMatrixView(m, { ...DEFAULT_WORLD_FILTER, tiers: ['A'], factors: ['PMI_US'] });
    expect(renderToStaticMarkup(<WorldMatrix view={empty} selected={null} onSelect={noop} />)).toContain('Không có ô nào khớp bộ lọc');
  });
  it('filter bar: labelled groups reflect state', () => {
    const html = renderToStaticMarkup(<WorldFilterBar state={{ ...DEFAULT_WORLD_FILTER, direction: '-', tiers: ['A'] }} onChange={noop} channels={[{ id: 'commodity', label: 'Hàng hoá' }]} />);
    expect(html).toContain('aria-label="Bậc bằng chứng"');
    expect(html).toContain('<label');
    expect(/aria-pressed="true"[^>]*>Giảm giá/.test(html)).toBe(true);
    expect(/aria-pressed="true"[^>]*>Bậc A/.test(html)).toBe(true);
  });
  it('pulse, connectedness, events, scenario and stock profile', async () => {
    const ov = await call('GET', '/api/world/overview');
    expect(renderToStaticMarkup(<WorldPulse pulse={ov.pulse} />).match(/pulse-card/g)).toHaveLength(13);
    const cn = await call('GET', '/api/world/connectedness');
    const chtml = renderToStaticMarkup(<ConnectednessPanel data={cn} />);
    expect(chtml).toContain('Lan ra');
    expect(chtml).toContain('Phụ thuộc đuôi');
    expect((chtml.match(/<tr/g) ?? []).length).toBeGreaterThanOrEqual(8);
    const ev = await call('GET', '/api/world/events');
    const ehtml = renderToStaticMarkup(<EventList events={ev.events} selected="ev1" onSelect={noop} />);
    expect(ehtml).toContain('aria-selected="true"');
    expect(ehtml).toContain('ev-pending');
    expect(ehtml).toContain('[–]');
    const det = await call('GET', '/api/world/events/ev1');
    const dhtml = renderToStaticMarkup(<EventDetail d={det} />);
    expect(dhtml).toContain('công bố sau giờ đóng cửa');
    expect(dhtml).toContain('Kiểm định BMP');
    expect(dhtml).toContain('Nền đậm là cửa sổ đo');
    const pend = renderToStaticMarkup(<EventDetail d={await call('GET', '/api/world/events/ev12')} />);
    expect(pend).toContain('Chưa đủ phiên sau sự kiện');
    const sc = await call('POST', '/api/world/scenario', { scenarioId: 'tariff-up', horizon: 3 });
    const series = await call('GET', '/api/world/series');
    const shtml = renderToStaticMarkup(<WorldScenario scenarios={series.scenarios} selectedId="tariff-up" onSelect={noop} horizon={3} onHorizon={noop} result={sc} loading={false} error={null} focusSector={null} onFocus={noop} />);
    expect(shtml).toContain('Thuế quan Mỹ tăng');
    expect(shtml).toContain('khoảng tin cậy 90% chứa 0');
    expect(shtml).toContain('Bậc của mã không bao giờ cao hơn');
    const stk = await call('GET', '/api/world/stock/SEA1');
    const khtml = renderToStaticMarkup(<StockProfile d={stk} />);
    expect(khtml).toContain('Doanh thu theo vùng');
    expect(khtml).toContain('dữ kiện báo cáo');
    expect(khtml).toContain('dữ liệu riêng');
  });
  it('container: first render shows loading states, the notice slot, theme attribute and navigation', () => {
    const html = renderToStaticMarkup(<WorldTab client={{} as Any} theme="dark" />);
    expect(html).toContain('data-theme="dark"');
    expect(html).toContain('Kết nối thế giới');
    expect(html).toContain('Đang tải tổng quan');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('Hồ sơ cổ phiếu');
    expect(renderToStaticMarkup(<WorldTab client={{} as Any} />)).toContain('data-theme="auto"');
  });
});
