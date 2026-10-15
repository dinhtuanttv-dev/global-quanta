import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MacroThermometer } from './MacroThermometer';
import { MacroFilterBar } from './MacroFilterBar';
import { MacroImpactMatrix } from './MacroImpactMatrix';
import { CellDetail, Sparkline } from './CellDetail';
import { ScenarioPanel } from './ScenarioPanel';
import { MacroCalendar } from './MacroCalendar';
import { MacroCenterTab } from './MacroCenterTab';
import { DEFAULT_FILTER, buildMatrixView, describeCell } from '../macro-filter';
import { createMacroApi } from '../macro-api';
import { makeSyntheticStore } from '../macro-seed';
import type { ImpactPayload, ThermoPayload, ScenarioPayload, CellDetailPayload } from './types';

type Any = any; // eslint-disable-line
const api = createMacroApi({ store: makeSyntheticStore(2024), today: () => '2026-07-15' });
const call = async (path: string, body: unknown, method = 'POST') => (await api.handle({ method, path, query: {}, body })).body as Any;
const names: Record<string, string> = { CPI: 'Lạm phát (CPI)', M2: 'Cung tiền M2', VNINDEX: 'VN-Index', VN30: 'VN30', VNSMALLCAP: 'VNSmallcap' };

describe('presentational components render real API payloads', () => {
  it('matrix: accessible table, one button per cell, status encoded in data attributes and labels', async () => {
    const impact = (await call('/api/macro/impact', {})) as ImpactPayload;
    const view = buildMatrixView(impact, { ...DEFAULT_FILTER, factors: ['CPI', 'M2', 'OIL'], targets: ['VNINDEX', 'VNSMALLCAP'] });
    const html = renderToStaticMarkup(<MacroImpactMatrix view={view} factorNames={names} targetNames={names} selected="CPI|VNINDEX" onSelect={() => undefined} />);
    expect(html).toContain('<table');
    expect(html).toContain('scope="col"');
    expect(html).toContain('scope="row"');
    expect((html.match(/<button/g) ?? []).length).toBe(6);
    expect(html).toContain('data-status="stable"');
    expect(html).toContain('data-status="insignificant"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-label="CPI lên VN-Index');
    expect(html).toContain('Ô sọc');
    expect(html).toContain('data-dir="-"');
  });
  it('matrix: empty state explains how many cells the filter hides', async () => {
    const impact = (await call('/api/macro/impact', {})) as ImpactPayload;
    const view = buildMatrixView(impact, { ...DEFAULT_FILTER, minAbsT: 5, factors: ['OIL'] });
    const html = renderToStaticMarkup(<MacroImpactMatrix view={view} factorNames={names} targetNames={names} selected={null} onSelect={() => undefined} />);
    expect(html).toContain('Không có ô nào khớp bộ lọc');
    expect(html).not.toContain('<table');
  });
  it('filter bar: grouped, labelled controls reflect the state', () => {
    const html = renderToStaticMarkup(
      <MacroFilterBar state={{ ...DEFAULT_FILTER, direction: '-', targets: ['VN30'] }} onChange={() => undefined}
        factors={[{ id: 'CPI', label: 'Lạm phát' }, { id: 'M2', label: 'Cung tiền' }]} targets={[{ id: 'VN30', label: 'VN30' }]} maxLag={3} />,
    );
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Chỉ số"');
    expect(html).toContain('<label');
    expect(html).toContain('Tốt nhất mỗi cặp');
    expect(html).toContain('3 tháng');
    expect(/aria-pressed="true"[^>]*>Giảm giá/.test(html)).toBe(true);
    expect(/aria-pressed="true"[^>]*title="VN30"/.test(html)).toBe(true);
  });
  it('thermometer: band, value, marker position, contributors and the gate verdict', async () => {
    const data = (await call('/api/macro/score', {})) as ThermoPayload;
    const html = renderToStaticMarkup(<MacroThermometer data={data} names={names} />);
    expect(html).toContain(data.thermometer!.bandVi);
    expect(html).toContain('thermo-marker');
    expect(html).toContain('role="img"');
    expect(html).toContain('Yếu tố đóng góp nhiều nhất');
    expect(html).toContain('data-pass="true"');
    const left = Number(/left:([\d.]+)%/.exec(html)![1]);
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(100);
    expect(renderToStaticMarkup(<MacroThermometer data={{ ...data, thermometer: null }} names={names} />)).toContain('Chưa đủ dữ liệu');
  });
  it('detail: shows stats, sparkline and the plain-language sentence; handles loading, error and empty', async () => {
    const d = (await call('/api/macro/cell', { factor: 'CPI', target: 'VNINDEX', lag: 1, arLags: 1 })) as CellDetailPayload;
    const html = renderToStaticMarkup(<CellDetail detail={d} loading={false} error={null} sentence="Câu mô tả thử." onClose={() => undefined} />);
    expect(html).toContain('CPI → VNINDEX');
    expect(html).toContain('<svg');
    expect(html).toContain('Câu mô tả thử.');
    expect(html).toContain('Khoảng tin cậy bootstrap 95%');
    expect(renderToStaticMarkup(<CellDetail detail={null} loading error={null} sentence="" onClose={() => undefined} />)).toContain('Đang tính');
    expect(renderToStaticMarkup(<CellDetail detail={null} loading={false} error="Lỗi thử" sentence="" onClose={() => undefined} />)).toContain('role="alert"');
    expect(renderToStaticMarkup(<CellDetail detail={null} loading={false} error={null} sentence="" onClose={() => undefined} />)).toContain('Chọn một ô');
    expect(renderToStaticMarkup(<Sparkline values={[1]} label="x" />)).toBe('');
  });
  it('scenario: ranked rows, CI bars, hollow marker for inconclusive results', async () => {
    const info = ((await call('/api/macro/series', undefined, 'GET')) as Any).scenarios;
    const result = (await call('/api/macro/scenario', { scenarioId: 'easing', horizon: 3 })) as ScenarioPayload;
    const html = renderToStaticMarkup(
      <ScenarioPanel scenarios={info} selectedId="easing" onSelect={() => undefined} horizon={3} onHorizon={() => undefined} result={result} loading={false} error={null} targetNames={names} />,
    );
    expect(html).toContain('Nới lỏng tiền tệ');
    expect((html.match(/class="sc-row"/g) ?? []).length).toBe(6);
    expect(html).toContain('data-sig="true"');
    expect(html).toContain('khoảng tin cậy 90%');
    const vals = [...html.matchAll(/sc-val">([+\-\d,%?\s]+)</g)].map((m) => Number(m[1].replace(/[+%?\s]/g, '').replace(',', '.')));
    expect(vals).toEqual([...vals].sort((a, b) => b - a));
  });
  it('calendar and alerts: estimated dates are labelled as estimates', async () => {
    const cal = await call('/api/macro/calendar', undefined, 'GET');
    const html = renderToStaticMarkup(<MacroCalendar calendar={cal} alerts={{ alerts: [{ id: 'a', level: 'high', messageVi: 'CPI cao bất thường.' }] }} />);
    expect(html).toContain('ƯỚC TÍNH');
    expect(html).toContain('<time');
    expect(html).toContain('data-level="high"');
    expect(html).toContain('Cao.');
    expect(renderToStaticMarkup(<MacroCalendar calendar={null} alerts={{ alerts: [] }} />)).toContain('Không có cảnh báo');
  });
});

describe('container', () => {
  it('checks API readiness before requesting Macro analytics', () => {
    const html = renderToStaticMarkup(<MacroCenterTab client={{} as Any} />);
    expect(html).toContain('Trung tâm vĩ mô');
    expect(html).toContain('Đang kết nối dịch vụ Macro');
    expect(html).not.toContain('aria-labelledby="mc-matrix"');
  });
  it('sentence generator agrees with the rendered statuses', async () => {
    const impact = (await call('/api/macro/impact', {})) as ImpactPayload;
    const view = buildMatrixView(impact, DEFAULT_FILTER);
    const c = view.cells['CPI|VNINDEX'];
    expect(describeCell(c, { factor: 'CPI', target: 'VN-Index' }, 'diff')).toContain('giảm khoảng');
  });
});
